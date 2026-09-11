import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, resolve, relative } from 'path'

// A fence, not a description.
//
// "Jamo" is the product name and is always capitalised in user-facing copy. A
// one-off sweep fixes today's instances; this keeps them fixed, because the
// next lowercase "jamo" will arrive in a string nobody diffs closely.
//
// It scans JSX text and the copy-bearing attributes (title/placeholder/alt/
// aria-label) of every .tsx under src/ and fails on a standalone lowercase
// "jamo". Technical identifiers are NOT copy and are allowed: Tailwind classes
// (jamo-500), the aurora animation classes, the chat-with-jamo function name,
// storage keys (jamo-wizard-state, jamo_debug_mode), the jamo-demo org slug,
// imported symbols such as jamoLogo, and anything inside an import statement.
//
// Verified non-vacuous: reverting any one of the eight fixes in the 2026-09-11
// sweep makes this fail naming that file and line.

const SRC = resolve(__dirname, '..')

function tsxFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__') continue
      tsxFiles(full, acc)
    } else if (entry.endsWith('.tsx')) {
      acc.push(full)
    }
  }
  return acc
}

/** Identifiers that legitimately contain a lowercase "jamo". */
const ALLOWED = [
  /jamo-(?:aurora|fast|\d{2,3})/,     // css + tailwind: jamo-aurora, jamo-500
  /chat-with-jamo/,                    // edge function name
  /jamo-wizard-state/,                 // sessionStorage key
  /jamo_debug_mode/,                   // localStorage key
  /jamo-demo/,                         // org slug
  /jamoLogo/,                          // imported asset symbol
  /jamo-v1/,                           // repo name
  /@jamo/,                             // email domains in fixtures
  /jamo\.com/,
]

function offendingLines(source: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = []
  source.split('\n').forEach((line, i) => {
    if (line.trimStart().startsWith('import ')) return
    if (line.trimStart().startsWith('//')) return
    if (!/\bjamo\b/.test(line)) return

    // Strip the allowed identifiers, then see if a bare "jamo" survives.
    let stripped = line
    for (const pattern of ALLOWED) stripped = stripped.replace(new RegExp(pattern, 'g'), '')
    if (/\bjamo\b/.test(stripped)) out.push({ line: i + 1, text: line.trim().slice(0, 100) })
  })
  return out
}

describe('product name capitalisation', () => {
  it('never renders a lowercase "jamo" in user-facing copy', () => {
    const violations: string[] = []
    for (const file of tsxFiles(SRC)) {
      const found = offendingLines(readFileSync(file, 'utf8'))
      for (const v of found) {
        violations.push(`${relative(SRC, file).replace(/\\/g, '/')}:${v.line}  ${v.text}`)
      }
    }
    expect(violations, `Capitalise "Jamo" in user-facing copy:\n${violations.join('\n')}`).toEqual([])
  })

  it('still allows technical identifiers that contain lowercase jamo', () => {
    // Guards the guard: these must NOT be reported, or the fence would push
    // people into renaming CSS classes and storage keys.
    const sample = [
      `<div className="jamo-aurora rounded-2xl" />`,
      `<span className="text-jamo-500" />`,
      `fetch('/functions/v1/chat-with-jamo')`,
      `localStorage.getItem('jamo_debug_mode')`,
      `const SESSION_KEY = 'jamo-wizard-state'`,
      `export const DEMO_ORG_SLUG = 'jamo-demo'`,
      `<img src={jamoLogo} alt="Jamo" />`,
    ].join('\n')
    expect(offendingLines(sample)).toEqual([])
  })

  it('does catch a real lowercase usage', () => {
    // Non-vacuity: the fence must actually fire. The lowercase "jamo" below is
    // the fixture under test — do NOT "fix" its capitalisation, that would make
    // this assertion prove the opposite of what it says.
    const lowercase = ['ja', 'mo'].join('')
    expect(offendingLines(`<p>Ask ${lowercase} to edit...</p>`)).toHaveLength(1)
  })
})
