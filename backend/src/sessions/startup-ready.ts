export function hasPromptMarker(content: string): boolean {
  const lines = content
    .split('\n')
    .map((line) => line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trimEnd())
    .filter(Boolean);

  const lastLine = lines.at(-1)?.trim() ?? '';
  if (!lastLine) {
    return false;
  }

  if (/^[>❯$#]\s*$/.test(lastLine)) {
    return true;
  }

  if (/^[>❯$#]\s+\S+/.test(lastLine)) {
    return true;
  }

  return false;
}
