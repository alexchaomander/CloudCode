import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { formatReadableTranscript } from './readable-transcript.js';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'transcripts');
const EVENT_FILE_SUFFIX = '.events.jsonl';
const MARKDOWN_FILE_SUFFIX = '.semantic.md';
const CACHE_FILE_SUFFIX = '.readable.txt';
const LEGACY_FILE_SUFFIX = '.log';
const MAX_TRANSCRIPT_SCROLLBACK = 20000;
const DEFAULT_COLS = 160;
const DEFAULT_ROWS = 48;
type TranscriptEvent =
  | { type: 'output'; data: string; at: string }
  | { type: 'resize'; cols: number; rows: number; at: string };

export interface TranscriptPageItem {
  index: number;
  at: string;
  text: string;
}

export interface TranscriptPage {
  items: TranscriptPageItem[];
  hasMoreBefore: boolean;
  hasMoreAfter: boolean;
  firstIndex: number | null;
  lastIndex: number | null;
  totalItems: number;
  source: 'events' | 'legacy';
}

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

function parseEvents(raw: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as Partial<TranscriptEvent>;
      if (event.type === 'output' && typeof event.data === 'string') {
        events.push({
          type: 'output',
          data: event.data,
          at: typeof (event as any).at === 'string' ? (event as any).at : new Date().toISOString(),
        });
        continue;
      }
      if (
        event.type === 'resize' &&
        typeof event.cols === 'number' &&
        typeof event.rows === 'number'
      ) {
        events.push({
          type: 'resize',
          cols: event.cols,
          rows: event.rows,
          at: typeof (event as any).at === 'string' ? (event as any).at : new Date().toISOString(),
        });
      }
    } catch {
      return [];
    }
  }

  return events;
}

function clampLimit(limit: number | undefined): number {
  if (!limit || Number.isNaN(limit)) return 80;
  return Math.min(Math.max(Math.floor(limit), 1), 500);
}

const lastTranscriptFingerprintBySession = new Map<string, string>();

function normalizeTranscriptLine(line: string): string {
  return line.replace(/\s+/g, ' ').trim();
}

function isMostlySymbolLine(line: string): boolean {
  return /^[\W_]+$/.test(line) && !/[A-Za-z0-9]/.test(line);
}

function isUiChromeLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;

  if (trimmed.includes('cc-') || trimmed.includes('projects/')) return true;
  if (trimmed.includes(';2c0;276;0c')) return true;
  if (trimmed.includes('[?12l') || trimmed.includes('[?25h') || trimmed.includes('[>c')) return true;
  if (trimmed.includes('to accept edits')) return true;

  const lowered = trimmed.toLowerCase();
  const chrome = [
    'gemini cli', 'claude code', 'logged in', 'openai codex', 'copilot cli',
    '/auth', '/upgrade', 'type your message', 'shift+tab', 'shortcuts',
    'analyzing', 'thinking', 'working', 'completed', 'no sandbox', '/model',
    'delegate to agent', 'subagent', 'termination reason', 'goal', 'result:',
  ];

  if (chrome.some((needle) => lowered.includes(needle))) return true;

  if (/^[0-9. ]+$/.test(trimmed) && (trimmed.includes('.') || trimmed.length < 5)) return true;
  if (trimmed.length < 3 && !/^[A-Z0-9]+$/.test(trimmed)) return true;

  return false;
}

function buildTranscriptFingerprint(text: string): string {
  const readable = formatReadableTranscript(text);
  const lines = readable
    .split('\n')
    .map(normalizeTranscriptLine)
    .filter(Boolean)
    .filter((line) => !isUiChromeLine(line))
    .filter((line) => !isMostlySymbolLine(line));

  return lines.join('\n').trim();
}

function isNearDuplicateFingerprint(current: string, previous: string): boolean {
  if (!current || !previous) return false;
  if (current === previous) return true;

  const currentLines = current.split('\n').filter(Boolean);
  const previousLines = previous.split('\n').filter(Boolean);
  if (currentLines.length < 3 || previousLines.length < 3) return false;

  const previousSet = new Set(previousLines);
  let shared = 0;
  for (const line of currentLines) {
    if (previousSet.has(line)) shared += 1;
  }

  const overlap = shared / Math.max(currentLines.length, previousLines.length);
  const lengthDelta = Math.abs(currentLines.length - previousLines.length);
  return overlap >= 0.9 && lengthDelta <= 2;
}

function dedupeTranscriptEvents(events: TranscriptEvent[]): TranscriptEvent[] {
  const deduped: TranscriptEvent[] = [];
  const recentFingerprints: string[] = [];

  for (const event of events) {
    if (event.type !== 'output') {
      deduped.push(event);
      continue;
    }

    const fingerprint = buildTranscriptFingerprint(event.data);
    if (!fingerprint) {
      continue;
    }

    const previousFingerprint = recentFingerprints[recentFingerprints.length - 1];
    const duplicate = recentFingerprints.some((prior) => isNearDuplicateFingerprint(fingerprint, prior));
    if (duplicate) {
      continue;
    }

    recentFingerprints.push(fingerprint);
    if (recentFingerprints.length > 5) {
      recentFingerprints.shift();
    }
    deduped.push(event);
  }

  return deduped;
}

function buildTranscriptPageFromEvents(
  events: TranscriptEvent[],
  options?: { limit?: number; before?: number; after?: number },
): TranscriptPage {
  const limit = clampLimit(options?.limit);
  const outputEvents = events
    .map((event, index) => ({ event, index }))
    .filter(({ event }) => event.type === 'output') as Array<{ event: Extract<TranscriptEvent, { type: 'output' }>; index: number }>;

  if (outputEvents.length === 0) {
    return {
      items: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
      firstIndex: null,
      lastIndex: null,
      totalItems: 0,
      source: 'events',
    };
  }

  let selected = outputEvents;
  const after = options?.after;
  const before = options?.before;
  if (typeof after === 'number' && Number.isFinite(after)) {
    selected = outputEvents.filter(({ index }) => index > after).slice(0, limit);
  } else if (typeof before === 'number' && Number.isFinite(before)) {
    const older = outputEvents.filter(({ index }) => index < before);
    selected = older.slice(Math.max(0, older.length - limit));
  } else if (outputEvents.length > limit) {
    selected = outputEvents.slice(outputEvents.length - limit);
  }

  const firstIndex = selected[0]?.index ?? null;
  const lastIndex = selected[selected.length - 1]?.index ?? null;

  return {
    items: selected.map(({ event, index }) => ({
      index,
      at: event.at,
      text: formatReadableTranscript(event.data),
    })),
    hasMoreBefore: firstIndex !== null ? outputEvents.some(({ index }) => index < firstIndex) : false,
    hasMoreAfter: lastIndex !== null ? outputEvents.some(({ index }) => index > lastIndex) : false,
    firstIndex,
    lastIndex,
    totalItems: outputEvents.length,
    source: 'events',
  };
}

export function buildTranscriptPage(
  events: TranscriptEvent[],
  options?: { limit?: number; before?: number; after?: number },
): TranscriptPage {
  return buildTranscriptPageFromEvents(dedupeTranscriptEvents(events), options);
}

async function writeToTerminal(term: HeadlessTerminalInstance, data: string): Promise<void> {
  await new Promise<void>((resolve) => {
    term.write(data, () => resolve());
  });
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
    await writeToTerminal(term, combinedOutput);
  }

  const lines: string[] = [];
  const activeBuffer = term.buffer.active;
  for (let index = 0; index < activeBuffer.length; index += 1) {
    const line = activeBuffer.getLine(index);
    if (!line) continue;
    // Get the raw line string
    lines.push(line.translateToString(false));
  }

  return formatReadableTranscript(lines.join('\n'));
}

function renderLegacyTranscript(raw: string): string {
  return formatReadableTranscript(raw);
}

function formatTimelineStamp(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return 'unknown time';
  return date.toISOString().slice(11, 19);
}

export function formatTimelineTranscript(events: TranscriptEvent[]): string {
  if (events.length === 0) return '';

  const sections: string[] = [];

  for (const event of events) {
    if (event.type !== 'output') continue;

    const body = formatReadableTranscript(event.data).trim();
    if (!body) continue;

    sections.push(`── ${formatTimelineStamp(event.at)} ──`);
    sections.push(body);
    sections.push('');
  }

  return sections.join('\n').trim();
}

export function formatReadableTerminalText(raw: string): string {
  return formatReadableTranscript(raw);
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
  lastTranscriptFingerprintBySession.delete(sessionId);
}

import { SemanticProcessor } from './semantic-processor.js';

const semanticProcessors = new Map<string, SemanticProcessor>();

export async function appendTranscript(sessionId: string, chunk: string): Promise<void> {
  if (!chunk) return;
  await mkdir(DATA_DIR, { recursive: true });
  const at = new Date().toISOString();
  const fingerprint = buildTranscriptFingerprint(chunk);
  if (!fingerprint) return;

  if (lastTranscriptFingerprintBySession.get(sessionId) === fingerprint) {
    return;
  }
  lastTranscriptFingerprintBySession.set(sessionId, fingerprint);
  
  // 1. Append to raw event log
  await appendFile(eventPath(sessionId), `${JSON.stringify({ type: 'output', data: chunk, at } satisfies TranscriptEvent)}\n`, 'utf8');
  
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
  const at = new Date().toISOString();
  await appendFile(
    eventPath(sessionId),
    `${JSON.stringify({ type: 'resize', cols, rows, at } satisfies TranscriptEvent)}\n`,
    'utf8',
  );
}

export async function readTranscript(
  sessionId: string,
  options?: { cols?: number; rows?: number; asMarkdown?: boolean; asTimeline?: boolean },
): Promise<string> {
  if (options?.asTimeline) {
    try {
      const rawEvents = await readFile(eventPath(sessionId), 'utf8');
      const events = dedupeTranscriptEvents(parseEvents(rawEvents));
      if (events.length > 0) {
        return formatTimelineTranscript(events);
      }
    } catch {
      // Fall back to live pane rendering below.
    }
  }

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
    const events = dedupeTranscriptEvents(parseEvents(rawEvents));
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

export async function readTranscriptPage(
  sessionId: string,
  options?: { limit?: number; before?: number; after?: number },
): Promise<TranscriptPage> {
  try {
    const rawEvents = await readFile(eventPath(sessionId), 'utf8');
    const events = dedupeTranscriptEvents(parseEvents(rawEvents));
    const page = buildTranscriptPageFromEvents(events, options);
    if (page.totalItems > 0) {
      return page;
    }
  } catch {
    // Fall back below.
  }

  try {
    const legacy = await readFile(legacyPath(sessionId), 'utf8');
    const text = renderLegacyTranscript(legacy).trim();
    if (!text) {
      return {
        items: [],
        hasMoreBefore: false,
        hasMoreAfter: false,
        firstIndex: null,
        lastIndex: null,
        totalItems: 0,
        source: 'legacy',
      };
    }

    return {
      items: [{
        index: 0,
        at: new Date().toISOString(),
        text,
      }],
      hasMoreBefore: false,
      hasMoreAfter: false,
      firstIndex: 0,
      lastIndex: 0,
      totalItems: 1,
      source: 'legacy',
    };
  } catch {
    return {
      items: [],
      hasMoreBefore: false,
      hasMoreAfter: false,
      firstIndex: null,
      lastIndex: null,
      totalItems: 0,
      source: 'legacy',
    };
  }
}

export async function deleteTranscript(sessionId: string): Promise<void> {
  semanticProcessors.delete(sessionId);
  lastTranscriptFingerprintBySession.delete(sessionId);
  await Promise.all([
    rm(eventPath(sessionId), { force: true }).catch(() => {}),
    rm(cachePath(sessionId), { force: true }).catch(() => {}),
    rm(markdownPath(sessionId), { force: true }).catch(() => {}),
    rm(legacyPath(sessionId), { force: true }).catch(() => {}),
  ]);
}
