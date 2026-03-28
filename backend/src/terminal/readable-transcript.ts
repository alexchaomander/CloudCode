const ANSI_ESCAPE_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g
const LEADING_SIERRA_RE = /^\[?[0-9;]*[mK]/
const BOX_DRAWING_RE = /[▄▀╭╮╰╯─│║|◇]/

function normalizeLine(line: string): string {
  if (!line) return ''

  let clean = line.replace(ANSI_ESCAPE_RE, '')

  clean = clean
    .replace(/\\\[[0-9;]*[mK]/g, '')
    .replace(/\[[0-9;]*[mK]/g, '')
    .replace(/\[?38;5;[0-9]+m/g, '')
    .replace(/\[?39m/g, '')
    .replace(/\(B/g, '')
    .replace(LEADING_SIERRA_RE, '')

  clean = clean.replace(BOX_DRAWING_RE, ' ')

  return clean
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .replace(/\uFFFD+/g, '')
    .replace(/[\u2800-\u28FF]/g, '')
    .replace(/\r/g, '')
}

export function isUiChromeLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false

  // Technical escape sequences or internal UI identifiers
  if (trimmed.includes(';2c0;276;0c')) return true
  if (trimmed.includes('[?12l') || trimmed.includes('[?25h') || trimmed.includes('[>c')) return true
  
  // Project path noise and internal IDs
  if (trimmed.includes('cc-') || trimmed.includes('projects/')) return true

  // NEVER strip lines that look like Markdown structural elements (lists, headers, etc)
  if (isMarkdownStructuralLine(trimmed)) return false

  const lowered = trimmed.toLowerCase()
  
  // Headers and repetitive status bars that aren't useful in a static transcript
  const chrome = [
    'shift+tab', 'shortcuts', 'no sandbox'
  ]

  if (chrome.some((needle) => lowered.includes(needle))) return true

  // Hide standalone progress percentages or short numeric noise (e.g. " 10.5% ") 
  // but ONLY if they aren't part of a Markdown structure.
  if (/^[0-9.% ]+$/.test(trimmed) && trimmed.length < 8) return true

  return false
}

function isMarkdownStructuralLine(line: string): boolean {
  return (
    /^#{1,6}\s+\S/.test(line) ||
    /^>\s?\S/.test(line) ||
    /^[-*+]\s+\S/.test(line) ||
    /^\d+\.\s+\S/.test(line) ||
    /^-\s+\[[ xX]\]\s+\S/.test(line) ||
    /^---+$/.test(line) ||
    /^\|.*\|$/.test(line)
  )
}

function isLikelyHeading(line: string): boolean {
  return (
    line.length > 3 &&
    line.length < 80 &&
    line === line.toUpperCase() &&
    /[A-Z]/.test(line) &&
    !/[`{}[\]()]/.test(line)
  )
}

function isLikelyCodeLine(line: string): boolean {
  return (
    /^\s{2,}\S/.test(line) ||
    /^[\t]+/.test(line) ||
    /^[{[]/.test(line) ||
    /^(const|let|var|function|class|return|if|for|while|import|export|async|await|try|catch|switch|case)\b/.test(line) ||
    /\bconsole\.(log|error|warn|info)\b/.test(line) ||
    /[;{}=<>()[\]]/.test(line)
  )
}

function flushParagraph(paragraph: string[], out: string[]): void {
  if (paragraph.length === 0) return
  out.push(paragraph.join(' '))
  paragraph.length = 0
}

function flushInferredCodeBlock(codeBlock: string[], out: string[]): void {
  if (codeBlock.length === 0) return
  out.push('```text')
  out.push(...codeBlock)
  out.push('```')
  codeBlock.length = 0
}

export function formatReadableTranscript(rawText: string): string {
  const lines = rawText.split('\n')
  const out: string[] = []
  const paragraph: string[] = []
  const inferredCodeBlock: string[] = []
  let inCodeFence = false

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine)
    const trimmed = line.trimEnd()

    if (!trimmed.trim()) {
      if (inCodeFence) {
        out.push('')
        continue
      }

      flushParagraph(paragraph, out)
      flushInferredCodeBlock(inferredCodeBlock, out)
      if (out.length > 0 && out[out.length - 1] !== '') {
        out.push('')
      }
      continue
    }

    if (isUiChromeLine(trimmed)) continue

    if (/^```/.test(trimmed.trim())) {
      flushParagraph(paragraph, out)
      flushInferredCodeBlock(inferredCodeBlock, out)
      out.push(trimmed.trim())
      inCodeFence = !inCodeFence
      continue
    }

    if (inCodeFence) {
      out.push(trimmed)
      continue
    }

    const compact = trimmed.trim()

    if (isMarkdownStructuralLine(compact)) {
      flushParagraph(paragraph, out)
      flushInferredCodeBlock(inferredCodeBlock, out)
      out.push(compact)
      continue
    }

    if (isLikelyHeading(compact)) {
      flushParagraph(paragraph, out)
      flushInferredCodeBlock(inferredCodeBlock, out)
      out.push(`## ${compact}`)
      continue
    }

    if (isLikelyCodeLine(compact)) {
      flushParagraph(paragraph, out)
      inferredCodeBlock.push(compact)
      continue
    }

    flushInferredCodeBlock(inferredCodeBlock, out)
    paragraph.push(compact)
  }

  flushParagraph(paragraph, out)
  flushInferredCodeBlock(inferredCodeBlock, out)

  const collapsed: string[] = []
  for (const line of out) {
    if (line === '' && collapsed[collapsed.length - 1] === '') continue
    collapsed.push(line)
  }

  return collapsed.join('\n').trim()
}
