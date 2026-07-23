// Heuristic capture-time WARNING (never a block). Catches the most common unbracketed
// self-instruction phrasings the model leaves in prose instead of using [PLACEHOLDER: …].
// A read of every section before capture remains the real safeguard; this converts the
// frequent phrasings from invisible to flagged.
const PROSE_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'insert …', re: /\binsert\s+[a-z]/i },   // "insert X"; "insertion" (no space) is safe
  { label: 'to be confirmed', re: /to be confirmed/i },
  { label: 'to be determined', re: /to be determined/i },
  { label: 'TBD', re: /\bTBD\b/ },
  { label: '[citation', re: /\[citation/i },
]

export function scanPlaceholderProse(content: string): string[] {
  return PROSE_PATTERNS.filter((p) => p.re.test(content)).map((p) => p.label)
}
