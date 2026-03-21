import xtermHeadless from '@xterm/headless';
import { formatReadableTranscript } from './readable-transcript.js';

// Handle ESM / CJS interop for @xterm/headless
const Terminal = (xtermHeadless as any).Terminal || (xtermHeadless as any).default?.Terminal;

export class SemanticProcessor {
  private term: any;

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

  private finalizeReadableTranscript(rawText: string): string {
    return formatReadableTranscript(rawText);
  }
}
