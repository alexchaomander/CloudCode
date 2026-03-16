import xtermHeadless from '@xterm/headless';

// Handle ESM / CJS interop for @xterm/headless
const Terminal = (xtermHeadless as any).Terminal || (xtermHeadless as any).default?.Terminal;

export class SemanticProcessor {
  private term: any;
  private lastExtractedIndex: number = 0;
  private committedBlocks: string[] = [];

  constructor() {
    // Use an ultra-wide terminal so words are NEVER wrapped by the grid.
    // This allows us to extract perfect, continuous sentences.
    this.term = new Terminal({
      cols: 1000,
      rows: 500,
      scrollback: 100000,
      allowProposedApi: true,
    });
    
    // Force bypass proposed API check if constructor argument is dropped
    if (this.term._core && this.term._core.optionsService && this.term._core.optionsService.options) {
      this.term._core.optionsService.options.allowProposedApi = true;
    }
  }

  /**
   * Process a chunk of raw PTY data using the actual xterm emulator.
   */
  async process(chunk: string): Promise<void> {
    if (!chunk) return;
    return new Promise((resolve) => {
      this.term.write(chunk, () => resolve());
    });
  }

  /**
   * Extracts clean text from the virtual terminal buffer.
   */
  getMarkdown(): string {
    const activeBuffer = this.term.buffer.active;
    const lines: string[] = [];

    // Extract all lines from the buffer
    for (let i = 0; i < activeBuffer.length; i++) {
      const line = activeBuffer.getLine(i);
      if (!line) continue;
      // translateToString(true) trims trailing whitespace automatically
      lines.push(line.translateToString(true));
    }

    // Pass the perfectly extracted lines to the finalizer to clean up UI chrome
    return this.finalizeReadableTranscript(lines.join('\n'));
  }

  private isUiChromeLine(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed) return false;
    
    // Catch CloudCode and terminal state dumps
    if (trimmed.includes('cc-') || trimmed.includes('projects/')) return true;
    if (trimmed.includes(';2c0;276;0c')) return true;
    if (trimmed.includes('to accept edits')) return true;
    if (trimmed.includes('no sandbox')) return true;
    
    const lowered = trimmed.toLowerCase();
    const chrome = [
      'gemini cli', 'claude code', 'logged in', 'openai codex', 'copilot cli',
      '/auth', '/upgrade', 'type your message', 'shift+tab', 'shortcuts',
      'analyzing', 'thinking', 'working', 'completed', '/model',
      'delegate to agent', 'subagent', 'termination reason', 'goal', 'result:'
    ];
    
    if (chrome.some(c => lowered.includes(c))) return true;
    
    // Catch lone numbers, versions, or dots (e.g. "v0.33.1")
    if (/^[0-9. v]+$/.test(trimmed) && (trimmed.includes('.') || trimmed.length < 8)) return true;
    
    // Catch decorative lines (boxes, separators)
    const nonWhitespace = Array.from(trimmed);
    const decorativeChars = nonWhitespace.filter((char) => /[\u2500-\u257F\u2580-\u259F│║|+◇]/.test(char)).length;
    if (nonWhitespace.length >= 5 && decorativeChars / nonWhitespace.length > 0.5) return true;
    
    return false;
  }

  private finalizeReadableTranscript(rawText: string): string {
    const lines = rawText.split('\n');
    const blocks: string[] = [];
    let currentBlock = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.isUiChromeLine(line)) continue;

      const trimmed = line.trim();
      if (!trimmed) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = '';
        }
        continue;
      }

      // Semantic Paragraph Grouping
      const isNewThought = 
        (/^[A-Z]/.test(trimmed) && currentBlock.length > 0 && /[.!?:;]\s*$/.test(currentBlock)) || 
        /^[*\-•+]|\d+\./.test(trimmed) || 
        (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && trimmed.length < 40) ||
        trimmed.startsWith('{') || trimmed.startsWith('}') || trimmed.startsWith('[') || trimmed.startsWith(']');

      if (isNewThought && currentBlock) {
        blocks.push(currentBlock);
        currentBlock = '';
      }

      // Add to current block
      currentBlock += (currentBlock ? ' ' : '') + trimmed;
    }

    if (currentBlock) blocks.push(currentBlock);

    // Final cleanup: filter garbage blocks and format
    const finalBlocks: string[] = [];
    
    blocks.forEach(b => {
      // Collapse multiple spaces
      let text = b.replace(/\s{2,}/g, ' ').trim(); 
      
      // EXTREME WORD HEALING: The raw stream sometimes outputs "w o r d".
      // We will look for 1-3 letter lowercase fragments surrounded by spaces and fuse them
      // if they don't look like real small words.
      text = text.replace(/\b([a-zA-Z]{1,3})\s+([a-zA-Z]{2,})\b/g, (match, p1, p2) => {
        const validSmallWords = ['a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'hi', 'if', 'in', 'is', 'it', 'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'and', 'are', 'but', 'for', 'had', 'has', 'her', 'him', 'his', 'how', 'not', 'our', 'out', 'she', 'the', 'too', 'use', 'was', 'who', 'you'];
        if (validSmallWords.includes(p1.toLowerCase())) return match;
        return p1 + p2;
      });

      // Heal hyphenated line breaks
      text = text.replace(/-\s+/g, '-');
      
      // Must have some actual letters, not just symbols/JSON syntax
      if (!/[a-zA-Z]{3,}/.test(text)) return;
      
      // Filter out weird fragment blocks
      if (text.length < 5 && !/^[A-Z0-9]/.test(text)) return;
      
      // Filter out trailing JSON/terminal garbage that isn't a real sentence
      if (text.startsWith('"FilePath":') || text.startsWith('"Reasoning":') || text.startsWith('"KeySymbols":')) return;

      // Duplicate removal (heuristic to catch AI reprinting the same block after a progress spinner)
      if (finalBlocks.length > 0) {
        const prev = finalBlocks[finalBlocks.length - 1];
        if (text.includes(prev.slice(0, Math.floor(prev.length * 0.8)))) return;
      }

      finalBlocks.push(text);
    });

    return finalBlocks.join('\n\n'); 
  }
}
