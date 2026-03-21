import { describe, expect, it } from 'vitest';
import { formatReadableTranscript } from './readable-transcript.js';

describe('formatReadableTranscript', () => {
  it('preserves markdown structure and strips terminal chrome', () => {
    const raw = [
      'cc-12345/projects/demo',
      'IMPLEMENTATION PLAN',
      '- Update the login flow',
      '- Add tests',
      '',
      'const answer = 42',
      'console.log(answer)',
      '',
      'DONE',
    ].join('\n');

    const formatted = formatReadableTranscript(raw);

    expect(formatted).toContain('## IMPLEMENTATION PLAN');
    expect(formatted).toContain('- Update the login flow');
    expect(formatted).toContain('- Add tests');
    expect(formatted).toContain('```text');
    expect(formatted).toContain('const answer = 42');
    expect(formatted).toContain('console.log(answer)');
    expect(formatted).toContain('## DONE');
    expect(formatted).not.toContain('cc-12345');
  });
});
