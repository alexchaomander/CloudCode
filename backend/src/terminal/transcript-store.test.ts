import { describe, expect, it } from 'vitest';
import { buildTranscriptPage, formatTimelineTranscript } from './transcript-store.js';

describe('formatTimelineTranscript', () => {
  it('adds timestamp separators between output chunks', () => {
    const timeline = formatTimelineTranscript([
      { type: 'output', data: 'First chunk\n- item one', at: '2026-03-19T20:11:12.000Z' },
      { type: 'output', data: 'Second chunk', at: '2026-03-19T20:11:18.000Z' },
    ]);

    expect(timeline).toContain('── 20:11:12 ──');
    expect(timeline).toContain('First chunk');
    expect(timeline).toContain('- item one');
    expect(timeline).toContain('── 20:11:18 ──');
    expect(timeline).toContain('Second chunk');
  });
});

describe('buildTranscriptPage', () => {
  const events = [
    { type: 'output' as const, data: 'Chunk 1', at: '2026-03-19T20:11:12.000Z' },
    { type: 'resize' as const, cols: 140, rows: 40, at: '2026-03-19T20:11:13.000Z' },
    { type: 'output' as const, data: 'Chunk 2', at: '2026-03-19T20:11:14.000Z' },
    { type: 'output' as const, data: 'Chunk 3', at: '2026-03-19T20:11:15.000Z' },
    { type: 'output' as const, data: 'Chunk 4', at: '2026-03-19T20:11:16.000Z' },
  ];

  it('returns the newest output chunks by default', () => {
    const page = buildTranscriptPage(events, { limit: 2 });

    expect(page.totalItems).toBe(4);
    expect(page.items.map((item) => item.index)).toEqual([3, 4]);
    expect(page.items.map((item) => item.text)).toEqual(['Chunk 3', 'Chunk 4']);
    expect(page.hasMoreBefore).toBe(true);
    expect(page.hasMoreAfter).toBe(false);
  });

  it('pages older output when before is supplied', () => {
    const page = buildTranscriptPage(events, { before: 3, limit: 2 });

    expect(page.items.map((item) => item.index)).toEqual([0, 2]);
    expect(page.items.map((item) => item.text)).toEqual(['Chunk 1', 'Chunk 2']);
    expect(page.hasMoreBefore).toBe(false);
    expect(page.hasMoreAfter).toBe(true);
  });

  it('pages newer output when after is supplied', () => {
    const page = buildTranscriptPage(events, { after: 0, limit: 2 });

    expect(page.items.map((item) => item.index)).toEqual([2, 3]);
    expect(page.items.map((item) => item.text)).toEqual(['Chunk 2', 'Chunk 3']);
    expect(page.hasMoreBefore).toBe(true);
    expect(page.hasMoreAfter).toBe(true);
  });

  it('dedupes repeated output chunks', () => {
    const repeated = [
      { type: 'output' as const, data: 'Hello world', at: '2026-03-19T20:11:12.000Z' },
      { type: 'output' as const, data: 'Hello world', at: '2026-03-19T20:11:13.000Z' },
      { type: 'output' as const, data: 'Hello world\n', at: '2026-03-19T20:11:14.000Z' },
      { type: 'output' as const, data: 'Next thing', at: '2026-03-19T20:11:15.000Z' },
    ];

    const page = buildTranscriptPage(repeated);

    expect(page.totalItems).toBe(2);
    expect(page.items.map((item) => item.text)).toEqual(['Hello world', 'Next thing']);
  });

  it('dedupes near-identical redraws that only differ by ui chrome', () => {
    const repeated = [
      {
        type: 'output' as const,
        data: '\u001b[?25lStatus: running\nWorking on task\n[?12l',
        at: '2026-03-19T20:11:12.000Z',
      },
      {
        type: 'output' as const,
        data: 'Status: running\nWorking on task\n\u001b[?25h',
        at: '2026-03-19T20:11:13.000Z',
      },
      {
        type: 'output' as const,
        data: 'Status: done\nWorking on task\n\u001b[?25h',
        at: '2026-03-19T20:11:14.000Z',
      },
    ];

    const page = buildTranscriptPage(repeated);

    expect(page.totalItems).toBe(2);
    expect(page.items.map((item) => item.text)).toEqual([
      'Status: running Working on task',
      'Status: done Working on task',
    ]);
  });
});
