import xtermHeadless from '@xterm/headless';
import { nanoid } from 'nanoid';

// Handle ESM / CJS interop for @xterm/headless
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Terminal = (xtermHeadless as any).Terminal || (xtermHeadless as any).default?.Terminal;

export interface PromptState {
  isActive: boolean;
  type: 'yesno' | 'enter' | null;
  text?: string;
}

export interface TimelineAction {
  id: string;
  type: 'bash' | 'read' | 'edit' | 'grep' | 'ls' | 'custom';
  label: string;
  status: 'running' | 'completed' | 'error';
  content?: string;
  startTime: string;
  endTime?: string;
}

export interface HeuristicsResult {
  prompt?: PromptState;
  action?: TimelineAction;
}

/**
 * Maximum time an action can be 'running' before it's considered stale and marked as error.
 * This prevents actions from being stuck in 'running' state forever.
 */
const ACTION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Represents a potentially incomplete UTF-8 sequence that needs to be carried over
 * to the next chunk to avoid byte-splitting corruption.
 */
interface Utf8IncompleteSequence {
  bytes: number[];
  bytesNeeded: number;
}

export class HeuristicsEngine {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private term: any;
  private lastPromptState: PromptState = { isActive: false, type: null };
  private activeAction: TimelineAction | null = null;
  private pendingUtf8: Utf8IncompleteSequence | null = null;
  private lastCompletionCheckIndex = 0;
  private actionStartTime: number | null = null;

  constructor() {
    this.term = new Terminal({
      cols: 1000,
      rows: 100,
      scrollback: 500,
      allowProposedApi: true,
    });

    if (this.term._core?.optionsService?.options) {
      this.term._core.optionsService.options.allowProposedApi = true;
    }
  }

  /**
   * Process a chunk of raw PTY data.
   * Handles UTF-8 byte splitting to prevent corruption of multi-byte characters.
   */
  public process(chunkBase64: string): HeuristicsResult {
    if (!chunkBase64 || !this.term) return {};

    // Check for stale actions that should be marked as error
    const staleAction = this.checkForStaleAction();
    if (staleAction) {
      return staleAction;
    }

    const chunk = Buffer.from(chunkBase64, 'base64');
    const text = this.decodeUtf8WithCarryover(chunk);

    if (text.length === 0) return {};

    this.term.write(text);

    return {
      prompt: this.detectPrompt() || undefined,
      action: this.detectAction() || undefined
    };
  }

  /**
   * Check if the current active action has been running for too long
   * and should be marked as error (stale).
   */
  private checkForStaleAction(): HeuristicsResult | null {
    if (this.activeAction && this.activeAction.status === 'running' && this.actionStartTime !== null) {
      const elapsed = Date.now() - this.actionStartTime;
      if (elapsed > ACTION_TIMEOUT_MS) {
        this.activeAction.status = 'error';
        this.activeAction.endTime = new Date().toISOString();
        const result = { ...this.activeAction };
        this.activeAction = null;
        this.actionStartTime = null;
        this.lastCompletionCheckIndex = 0;
        return { action: result };
      }
    }
    return null;
  }

  /**
   * Decodes UTF-8 bytes while handling incomplete sequences at chunk boundaries.
   * If a multi-byte UTF-8 sequence is split across chunks, this carries over
   * the incomplete bytes and prepends them to the next chunk.
   */
  private decodeUtf8WithCarryover(chunk: Buffer): string {
    const bytes = Array.from(chunk);
    let result: number[] = [];

    // Prepend any pending incomplete sequence from previous chunk
    if (this.pendingUtf8) {
      result = [...this.pendingUtf8.bytes, ...bytes];
      this.pendingUtf8 = null;
    } else {
      result = bytes;
    }

    // Find and handle incomplete UTF-8 sequences at the end
    let finalIndex = result.length - 1;
    let bytesNeeded = 0;

    // Check if the last byte is a lead byte that expects more bytes
    if (finalIndex >= 0) {
      const lastByte = result[finalIndex];
      if ((lastByte & 0x80) === 0x00) {
        bytesNeeded = 0; // ASCII
      } else if ((lastByte & 0xE0) === 0xC0) {
        bytesNeeded = 1; // 2-byte sequence, need 1 more
      } else if ((lastByte & 0xF0) === 0xE0) {
        bytesNeeded = 2; // 3-byte sequence, need 2 more
      } else if ((lastByte & 0xF8) === 0xF0) {
        bytesNeeded = 3; // 4-byte sequence, need 3 more
      } else if ((lastByte & 0xC0) === 0x80) {
        // This is a continuation byte but we have no pending sequence
        // Skip it and try from the byte before
        bytesNeeded = 0;
        for (let i = result.length - 2; i >= 0; i--) {
          const b = result[i];
          if ((b & 0x80) === 0x00) {
            finalIndex = i;
            break;
          }
          if ((b & 0xE0) === 0xC0) { bytesNeeded = 1; finalIndex = i; break; }
          if ((b & 0xF0) === 0xE0) { bytesNeeded = 2; finalIndex = i; break; }
          if ((b & 0xF8) === 0xF0) { bytesNeeded = 3; finalIndex = i; break; }
        }
      }
    }

    // If we have an incomplete sequence, carry it over to next chunk
    if (bytesNeeded > 0 && finalIndex >= 0) {
      const carriedBytes = result.slice(finalIndex);
      if (carriedBytes.length < bytesNeeded + 1) {
        this.pendingUtf8 = { bytes: carriedBytes, bytesNeeded };
        result = result.slice(0, finalIndex);
      }
    }

    return Buffer.from(result).toString('utf8');
  }

  /**
   * Cleanup resources.
   */
  public dispose(): void {
    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
    this.pendingUtf8 = null;
    this.actionStartTime = null;
  }

  private detectPrompt(): PromptState | null {
    if (!this.term) return null;

    const activeBuffer = this.term.buffer.active;
    const end = activeBuffer.cursorY + activeBuffer.baseY;
    const start = Math.max(0, end - 5);

    let text = '';
    for (let i = start; i <= end; i++) {
      const line = activeBuffer.getLine(i);
      if (line) {
        text += line.translateToString(true) + '\n';
      }
    }

    const trimmed = text.trim();

    // Improved regex for prompt detection
    // Matches patterns like: "Do you want to continue? [Y/n]" or "Overwrite file? (y/N)"
    const yesnoMatch = trimmed.match(/(.*?)(?:\[|\()([yY]\/[nN])(?:\]|\))\s*\??\s*$/s);

    // Matches: "Press Enter to continue..." or "Press [Enter] to exit"
    const enterMatch = trimmed.match(/(.*?)Press (?:\[?Enter\]?|any key) to (?:continue|exit)\.*$/is);

    let newState: PromptState = { isActive: false, type: null };

    if (yesnoMatch) {
      const precedingLines = yesnoMatch[1].trim().split('\n');
      const context = precedingLines.slice(-2).join('\n').trim() || 'Permission requested';
      newState = { isActive: true, type: 'yesno', text: context };
    } else if (enterMatch) {
      const precedingLines = enterMatch[1].trim().split('\n');
      const context = precedingLines.slice(-1).join('\n').trim();
      newState = { isActive: true, type: 'enter', text: context || 'Action required' };
    }

    // Only return if the prompt state has changed significantly
    if (this.lastPromptState.isActive !== newState.isActive ||
        this.lastPromptState.type !== newState.type ||
        (newState.isActive && this.lastPromptState.text !== newState.text)) {
      this.lastPromptState = newState;
      return newState;
    }

    return null;
  }

  private detectAction(): TimelineAction | null {
    if (!this.term) return null;

    const activeBuffer = this.term.buffer.active;
    const end = activeBuffer.cursorY + activeBuffer.baseY;
    const start = Math.max(0, end - 15);

    let lines: string[] = [];
    for (let i = start; i <= end; i++) {
      const line = activeBuffer.getLine(i);
      if (line) {
        lines.push(line.translateToString(true));
      }
    }

    const text = lines.join('\n');

    // 1. Detect Tool Use Start (Claude / Gemini Style boxes)
    const toolStartMatch = text.match(/[┌╭]─+ Tool Use: ([\w]+) ─+┐/i);
    if (toolStartMatch) {
      const toolName = toolStartMatch[1].toLowerCase();
      const type = this.mapToolType(toolName);

      // Look for the specific argument/command line
      const startIndex = lines.findIndex(l => l.match(/[┌╭]─+ Tool Use:/i));
      let label = 'Working...';
      if (startIndex !== -1 && lines[startIndex + 1]) {
        // Clean up common box characters
        label = lines[startIndex + 1].replace(/[│|┃]/g, '').trim();
      }

      // If we already have a running action with the same label, update it instead of creating new
      // This prevents orphaned "running" actions when labels change during execution
      if (this.activeAction &&
          this.activeAction.status === 'running' &&
          this.activeAction.label !== label) {
        // Update the existing action's label rather than creating a new one
        this.activeAction.label = label;
        // Return the updated action to sync with frontend
        return { ...this.activeAction };
      }

      // Create new action only if no active action exists or if the previous one was completed
      if (!this.activeAction || this.activeAction.status !== 'running') {
        this.activeAction = {
          id: nanoid(8),
          type,
          label,
          status: 'running',
          startTime: new Date().toISOString()
        };
        this.actionStartTime = Date.now();
        return this.activeAction;
      }
    }

    // 2. Detect Tool Completion - scan ALL lines, not just the last one
    // This is more robust against wrapped lines, trailing whitespace, etc.
    if (this.activeAction && this.activeAction.status === 'running') {
      // Reset check position if we've moved to a new part of the buffer
      const currentCheckIndex = lines.length - 1;

      // Scan through lines looking for completion marker
      // Only check lines we haven't already validated
      const checkStart = this.lastCompletionCheckIndex;
      for (let i = Math.max(0, checkStart); i <= currentCheckIndex; i++) {
        const line = lines[i] || '';
        // Looks for └──────────┘ or ╰──────────╯
        if (line.match(/[└╰]─+┘/)) {
          this.activeAction.status = 'completed';
          this.activeAction.endTime = new Date().toISOString();
          const completedAction = { ...this.activeAction };
          this.activeAction = null;
          this.actionStartTime = null;
          this.lastCompletionCheckIndex = 0; // Reset for next action
          return completedAction;
        }
      }

      // Mark that we've checked up to the current index
      this.lastCompletionCheckIndex = currentCheckIndex;
    }

    // 3. Fallback: Generic Shell Command Detection
    // Detects lines starting with common prompt characters: $ # > ❯ λ etc.
    if (!this.activeAction) {
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
        const line = lines[i];
        // More inclusive regex: matches $, #, >, ❯, λ prompts
        const bashMatch = line.match(/^([\$>#❯λ]\s*)(.+)$/);
        if (bashMatch) {
          const cmd = bashMatch[2].trim();
          // Filter out common interactive shells/prompts that aren't actions
          if (['bash', 'zsh', 'sh', 'node', 'python', 'python3', 'ruby', 'perl'].includes(cmd)) continue;
          // Filter out pure path navigation
          if (/^cd\s/.test(cmd)) continue;

          this.activeAction = {
            id: nanoid(8),
            type: 'bash',
            label: cmd,
            status: 'running',
            startTime: new Date().toISOString()
          };
          this.actionStartTime = Date.now();
          return this.activeAction;
        }
      }
    }

    return null;
  }

  private mapToolType(tool: string): TimelineAction['type'] {
    const t = tool.toLowerCase();
    if (t.includes('bash') || t.includes('shell') || t.includes('run')) return 'bash';
    if (t.includes('read') || t.includes('cat')) return 'read';
    if (t.includes('edit') || t.includes('write') || t.includes('patch')) return 'edit';
    if (t.includes('grep') || t.includes('search') || t.includes('find')) return 'grep';
    if (t.includes('ls') || t.includes('list')) return 'ls';
    return 'custom';
  }
}
