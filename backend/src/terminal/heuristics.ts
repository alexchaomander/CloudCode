import xtermHeadless from '@xterm/headless';
import { nanoid } from 'nanoid';

// Handle ESM / CJS interop for @xterm/headless
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

export class HeuristicsEngine {
  private term: any;
  private lastPromptState: PromptState = { isActive: false, type: null };
  private activeAction: TimelineAction | null = null;

  constructor() {
    this.term = new Terminal({
      cols: 1000,
      rows: 100,
      scrollback: 500, // Reduced from 100000 to save memory in headless mode
      allowProposedApi: true,
    });
    
    if (this.term._core?.optionsService?.options) {
      this.term._core.optionsService.options.allowProposedApi = true;
    }
  }

  /**
   * Process a chunk of raw PTY data.
   */
  public process(chunkBase64: string): HeuristicsResult {
    if (!chunkBase64) return {};
    
    const chunk = Buffer.from(chunkBase64, 'base64').toString('utf8');
    this.term.write(chunk);
    
    return {
      prompt: this.detectPrompt() || undefined,
      action: this.detectAction() || undefined
    };
  }

  /**
   * Cleanup resources.
   */
  public dispose(): void {
    if (this.term) {
      this.term.dispose();
      this.term = null;
    }
  }

  private detectPrompt(): PromptState | null {
    if (!this.term) return null;

    const activeBuffer = this.term.buffer.active;
    const end = activeBuffer.cursorY + activeBuffer.baseY;
    const start = Math.max(0, end - 5); // Prompts are usually very near the cursor
    
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

      // Avoid creating a new action if the label is exactly the same as the current running one
      if (!this.activeAction || this.activeAction.label !== label || this.activeAction.status !== 'running') {
        this.activeAction = {
          id: nanoid(8),
          type,
          label,
          status: 'running',
          startTime: new Date().toISOString()
        };
        return this.activeAction;
      }
    }

    // 2. Detect Tool Completion (Bottom of box)
    if (this.activeAction && this.activeAction.status === 'running') {
      const lastLine = lines[lines.length - 1] || '';
      // Looks for └──────────┘ or ╰──────────╯
      if (lastLine.match(/[└╰]─+┘/)) {
        this.activeAction.status = 'completed';
        this.activeAction.endTime = new Date().toISOString();
        const completedAction = { ...this.activeAction };
        this.activeAction = null; 
        return completedAction;
      }
    }

    // 3. Fallback: Generic Shell Command Detection
    // Detects lines starting with $ or > followed by a command
    if (!this.activeAction) {
      for (let i = lines.length - 1; i >= Math.max(0, lines.length - 3); i--) {
        const line = lines[i];
        const bashMatch = line.match(/^[\$]\s+([a-zA-Z0-9].+)$/);
        if (bashMatch) {
          const cmd = bashMatch[1].trim();
          // Filter out common interactive shells/prompts that aren't actions
          if (['bash', 'zsh', 'sh', 'node', 'python'].includes(cmd)) continue;

          this.activeAction = {
            id: nanoid(8),
            type: 'bash',
            label: cmd,
            status: 'running',
            startTime: new Date().toISOString()
          };
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
