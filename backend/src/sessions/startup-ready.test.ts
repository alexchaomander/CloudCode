import { describe, expect, it } from 'vitest';
import { hasPromptMarker } from './startup-ready.js';

describe('hasPromptMarker', () => {
  it('ignores help text that appears before the actual prompt', () => {
    const content = [
      'Welcome to Gemini CLI',
      'type your message or @path/to/file',
      '? for shortcuts',
      '',
    ].join('\n');

    expect(hasPromptMarker(content)).toBe(false);
  });

  it('detects a ready prompt on the last line', () => {
    expect(hasPromptMarker('> ')).toBe(true);
    expect(hasPromptMarker('❯ ')).toBe(true);
    expect(hasPromptMarker('> Refactor the login flow')).toBe(true);
  });
});
