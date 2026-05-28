// Phase 14.2.2 — Plan 05 Task 1 verify: edge function file shape.
// PowerShell-safe: no shell chaining, no `2>$null`, no escape-laden inline regex.
// Run: node verify/14.2.2-05-edge-fn-shape.mjs
import { readFileSync, existsSync } from 'node:fs'

const path = 'supabase/functions/analyze-proposal-gaps/index.ts'

if (!existsSync(path)) {
  console.error(`MISSING: ${path}`)
  process.exit(1)
}

const src = readFileSync(path, 'utf8')

const checks = [
  { name: 'select includes resolved_items', re: new RegExp(String.raw`\.select\(['"][^'"]*resolved_items[^'"]*['"]\)`) },
  { name: 'RESOLVED_ITEMS prompt header', re: /RESOLVED_ITEMS:/ },
  { name: 'content_unchanged_since_action flag', re: /content_unchanged_since_action/ },
  { name: 'content_changed_since_action flag', re: /content_changed_since_action/ },
  { name: 'EVOLVED-FINDING EXAMPLES block', re: /EVOLVED-FINDING EXAMPLES/ },
  { name: 'Example 1 partial fix', re: /Example 1 — partial fix/ },
  { name: 'Example 2 dismissed unchanged', re: /Example 2 — dismissed with unchanged content/ },
  { name: 'empty-array short-circuit', re: /annotatedResolved\.length === 0/ },
  { name: 'sha256Hex helper present', re: /sha256Hex\s*\(/ },
  { name: 'acceptance_summary mention', re: /acceptance_summary/ },
]

let failed = 0
for (const c of checks) {
  if (!c.re.test(src)) {
    console.error(`FAIL: ${c.name}`)
    failed++
  } else {
    console.log(`OK:   ${c.name}`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed in ${path}`)
  process.exit(2)
}
console.log('\nAll edge-fn shape checks passed.')
