import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'transcripts');
const EVENT_FILE_SUFFIX = '.events.jsonl';
const MARKDOWN_FILE_SUFFIX = '.semantic.md';
const CACHE_FILE_SUFFIX = '.readable.txt';
const LEGACY_FILE_SUFFIX = '.log';
const MAX_TRANSCRIPT_SCROLLBACK = 20000;
const DEFAULT_COLS = 160;
const DEFAULT_ROWS = 48;
const BOX_DRAWING_ONLY_RE = /^[\s\u2500-\u257F\u2580-\u259F\u2800-\u28FF]+$/u;

type TranscriptEvent =
  | { type: 'output'; data: string }
  | { type: 'resize'; cols: number; rows: number };

let HeadlessTerminalCtorPromise: Promise<HeadlessTerminalCtor> | null = null;

interface HeadlessBufferLine {
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}

interface HeadlessBuffer {
  length: number;
  getLine(index: number): HeadlessBufferLine | undefined;
}

interface HeadlessTerminalInstance {
  buffer: {
    active: HeadlessBuffer;
  };
  resize(cols: number, rows: number): void;
  write(data: string, callback?: () => void): void;
}

type HeadlessTerminalCtor = new (options: { cols: number; rows: number; scrollback: number; allowProposedApi?: boolean }) => HeadlessTerminalInstance;

function eventPath(sessionId: string): string {
  return join(DATA_DIR, `${sessionId}${EVENT_FILE_SUFFIX}`);
}

function legacyPath(sessionId: string): string {
  return join(DATA_DIR, `${sessionId}${LEGACY_FILE_SUFFIX}`);
}

function cachePath(sessionId: string): string {
  return join(DATA_DIR, `${sessionId}${CACHE_FILE_SUFFIX}`);
}

function markdownPath(sessionId: string): string {
  return join(DATA_DIR, `${sessionId}${MARKDOWN_FILE_SUFFIX}`);
}

async function getHeadlessTerminalCtor(): Promise<HeadlessTerminalCtor> {
  if (!HeadlessTerminalCtorPromise) {
    HeadlessTerminalCtorPromise = import('@xterm/headless').then((module) => {
      const withDefault = module as { Terminal?: unknown; default?: { Terminal?: unknown } };
      const candidate = withDefault.Terminal ?? withDefault.default?.Terminal;
      if (typeof candidate !== 'function') {
        throw new Error('Failed to load @xterm/headless Terminal constructor');
      }
      return candidate as HeadlessTerminalCtor;
    });
  }

  return HeadlessTerminalCtorPromise;
}

function normalizeLine(line: string): string {
  if (!line) return '';
  
  // 1. Strip all ANSI escape sequences completely using a comprehensive regex
  // This catches colors, cursor movements, erase in line/display, etc.
  let clean = line.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
  
  // 2. Strip leftover artifacts that escape the primary regex
  clean = clean
    .replace(/\\\[[0-9;]*[mK]/g, '')
    .replace(/\[[0-9;]*[mK]/g, '')
    .replace(/\[?38;5;[0-9]+m/g, '')
    .replace(/\[?39m/g, '')
    .replace(/\(B/g, '');
    
  // 3. Strip box drawing, UI borders, and status bar junk
  clean = clean.replace(/[▄▀╭╮╰╯─│║|◇]/g, ' ');
  
  // 4. Strip control characters and unprintables
  clean = clean
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/\uFFFD+/g, '')
    .replace(/[\u2800-\u28FF]/g, '')
    .replace(/\r/g, '');

  return clean;
}

function isUiChromeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  
  // Catch CloudCode and terminal state dumps
  if (trimmed.includes('cc-') || trimmed.includes('projects/')) return true;
  if (trimmed.includes(';2c0;276;0c')) return true;
  if (trimmed.includes('[?12l') || trimmed.includes('[?25h') || trimmed.includes('[>c')) return true;
  if (trimmed.includes('to accept edits')) return true;
  
  const lowered = trimmed.toLowerCase();
  const chrome = [
    'gemini cli', 'claude code', 'logged in', 'openai codex', 'copilot cli',
    '/auth', '/upgrade', 'type your message', 'shift+tab', 'shortcuts',
    'analyzing', 'thinking', 'working', 'completed', 'no sandbox', '/model',
    'delegate to agent', 'subagent', 'termination reason', 'goal', 'result:'
  ];
  
  if (chrome.some(c => lowered.includes(c))) return true;
  
  // Catch lone numbers, versions, or dots
  if (/^[0-9. ]+$/.test(trimmed) && (trimmed.includes('.') || trimmed.length < 5)) return true;
  if (trimmed.length < 3 && !/^[A-Z0-9]+$/.test(trimmed)) return true;
  
  return false;
}

function finalizeReadableTranscript(rawText: string): string {
  const lines = rawText.split('\n');
  const processed: string[] = [];
  let currentBlock = '';

  for (let i = 0; i < lines.length; i++) {
    const cleanLine = normalizeLine(lines[i]);
    if (isUiChromeLine(cleanLine)) continue;

    const trimmed = cleanLine.trim();
    if (!trimmed) {
      if (currentBlock) {
        processed.push(currentBlock);
        currentBlock = '';
      }
      continue;
    }

    // Advanced Joining Logic:
    // If the line is short or doesn't end in punctuation, it's likely a wrap.
    const isNewThought = 
      /^[A-Z]/.test(trimmed) && currentBlock.length > 0 && /[.!?:;]\s*$/.test(currentBlock) || 
      /^[*\-•+]|\d+\./.test(trimmed) || 
      (trimmed === trimmed.toUpperCase() && trimmed.length > 4 && trimmed.length < 40);

    if (isNewThought && currentBlock) {
      processed.push(currentBlock);
      currentBlock = '';
    }

    currentBlock += (currentBlock ? ' ' : '') + trimmed;
  }
  if (currentBlock) processed.push(currentBlock);

  // Word Healing & Deduplication Pass
  const finalBlocks: string[] = [];
  const dictionary = ['description', 'descriptions', 'execution', 'architecture', 'technical', 'intelligence', 'strategy', 'documents', 'projects', 'context', 'protocol', 'linear', 'platform', 'management', 'components', 'connectors', 'interoperable', 'implementation', 'investigation', 'repository', 'structure', 'migrations'];

  processed.forEach(b => {
    let text = b.replace(/\s{2,}/g, ' ').trim();
    
    // 1. Heal broken common words: "descr iptio ns" -> "descriptions"
    dictionary.forEach(word => {
      // Create a fuzzy regex for the word with optional internal spaces
      const fuzzy = word.split('').join('\\s?');
      const regex = new RegExp(`\\b${fuzzy}\\b`, 'gi');
      text = text.replace(regex, word);
    });

    // 2. Generic single-letter heal: "p roject" -> "project"
    text = text.replace(/\b([a-zA-Z])\s([a-zA-Z]{3,})\b/g, (match, p1, p2) => {
      const valid = ['a', 'A', 'i', 'I'];
      return valid.includes(p1) ? match : p1 + p2;
    });

    // 3. Duplicate removal: Don't add if the block is very similar to the previous one
    if (finalBlocks.length > 0) {
      const prev = finalBlocks[finalBlocks.length - 1];
      // Simple similarity check: if one contains 80% of the other
      if (text.includes(prev.slice(0, Math.floor(prev.length * 0.8)))) return;
    }

    if (text.length > 5) finalBlocks.push(text);
  });

  return finalBlocks.join('\n\n');
}

function parseEvents(raw: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as Partial<TranscriptEvent>;
      if (event.type === 'output' && typeof event.data === 'string') {
        events.push({ type: 'output', data: event.data });
        continue;
      }
      if (
        event.type === 'resize' &&
        typeof event.cols === 'number' &&
        typeof event.rows === 'number'
      ) {
        events.push({ type: 'resize', cols: event.cols, rows: event.rows });
      }
    } catch {
      return [];
    }
  }

  return events;
}

async function writeToTerminal(term: HeadlessTerminalInstance, data: string): Promise<void> {
  term.write(data);
}

async function renderEventsToTranscript(
  events: TranscriptEvent[],
  cols = DEFAULT_COLS,
  rows = DEFAULT_ROWS,
): Promise<string> {
  if (events.length === 0) {
    return '';
  }

  const HeadlessTerminal = await getHeadlessTerminalCtor();
  // 1000 cols ensures NO terminal-side wrapping ever occurs
  const term = new HeadlessTerminal({
    cols: 1000, 
    rows: 500,
    scrollback: MAX_TRANSCRIPT_SCROLLBACK,
    allowProposedApi: true,
  });
  
  if ((term as any)._core && (term as any)._core.optionsService && (term as any)._core.optionsService.options) {
    (term as any)._core.optionsService.options.allowProposedApi = true;
  }

  // Concatenate all output to process it instantly instead of sequentially awaiting
  const combinedOutput = events
    .filter(e => e.type === 'output')
    .map(e => (e as any).data)
    .join('');
    
  if (combinedOutput) {
    term.write(combinedOutput);
  }

  const lines: string[] = [];
  const activeBuffer = term.buffer.active;
  for (let index = 0; index < activeBuffer.length; index += 1) {
    const line = activeBuffer.getLine(index);
    if (!line) continue;
    // Get the raw line string
    lines.push(line.translateToString(false));
  }

  return finalizeReadableTranscript(lines.join('\n'));
}

function renderLegacyTranscript(raw: string): string {
  return finalizeReadableTranscript(raw);
}

export function formatReadableTerminalText(raw: string): string {
  return finalizeReadableTranscript(raw);
}

export function hasReadableTranscriptArtifacts(text: string): boolean {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return false;
  }

  let artifactLines = 0;
  for (const line of lines) {
    const lowered = line.toLowerCase();
    if (
      /[▀▄]{8,}/u.test(line) ||
      lowered.includes('type your message') ||
      lowered.includes('/model auto') ||
      lowered.includes('sandbo') ||
      lowered.includes('st (main') ||
      lowered.startsWith('[cc-')
    ) {
      artifactLines += 1;
    }
  }

  return artifactLines >= Math.max(3, Math.ceil(lines.length * 0.12));
}

export async function initTranscript(sessionId: string): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(eventPath(sessionId), '', 'utf8');
}

import { SemanticProcessor } from './semantic-processor.js';

const semanticProcessors = new Map<string, SemanticProcessor>();

export async function appendTranscript(sessionId: string, chunk: string): Promise<void> {
  if (!chunk) return;
  await mkdir(DATA_DIR, { recursive: true });
  
  // 1. Append to raw event log
  await appendFile(eventPath(sessionId), `${JSON.stringify({ type: 'output', data: chunk } satisfies TranscriptEvent)}\n`, 'utf8');
  
  // 2. Process semantically for Markdown
  let processor = semanticProcessors.get(sessionId);
  if (!processor) {
    processor = new SemanticProcessor();
    semanticProcessors.set(sessionId, processor);
  }
  
  const oldMd = processor.getMarkdown();
  await processor.process(chunk);
  const newMd = processor.getMarkdown();
  
  // Only write if the markdown content actually changed
  if (newMd !== oldMd) {
    await writeFile(markdownPath(sessionId), newMd, 'utf8').catch(() => {});
  }
}

export async function appendTranscriptResize(sessionId: string, cols: number, rows: number): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(
    eventPath(sessionId),
    `${JSON.stringify({ type: 'resize', cols, rows } satisfies TranscriptEvent)}\n`,
    'utf8',
  );
}

export async function readTranscript(
  sessionId: string,
  options?: { cols?: number; rows?: number; asMarkdown?: boolean },
): Promise<string> {
  if (options?.asMarkdown) {
    try {
      return await readFile(markdownPath(sessionId), 'utf8');
    } catch {
      // Markdown cache doesn't exist, try to generate it from events
      const rawEvents = await readFile(eventPath(sessionId), 'utf8').catch(() => '');
      const events = parseEvents(rawEvents);
      const processor = new SemanticProcessor();
      for (const e of events) {
        if (e.type === 'output') await processor.process(e.data);
      }
      const md = processor.getMarkdown();
      if (md) await writeFile(markdownPath(sessionId), md, 'utf8').catch(() => {});
      return md;
    }
  }

  try {
    const rawEvents = await readFile(eventPath(sessionId), 'utf8');
    const events = parseEvents(rawEvents);
    if (events.length > 0) {
      return await renderEventsToTranscript(events, options?.cols, options?.rows);
    }
  } catch {
    // Fall back to legacy transcript.
  }

  try {
    const legacy = await readFile(legacyPath(sessionId), 'utf8');
    return renderLegacyTranscript(legacy);
  } catch {
    return '';
  }
}

export async function deleteTranscript(sessionId: string): Promise<void> {
  semanticProcessors.delete(sessionId);
  await Promise.all([
    rm(eventPath(sessionId), { force: true }).catch(() => {}),
    rm(cachePath(sessionId), { force: true }).catch(() => {}),
    rm(markdownPath(sessionId), { force: true }).catch(() => {}),
    rm(legacyPath(sessionId), { force: true }).catch(() => {}),
  ]);
}
