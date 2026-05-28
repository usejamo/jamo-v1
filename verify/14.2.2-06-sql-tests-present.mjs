// Phase 14.2.2 — Plan 06 Task 3 verify: SQL test files present.
import { existsSync, readFileSync } from 'node:fs'

const files = [
  'supabase/tests/append_resolved_item.sql',
  'supabase/tests/resolved_items_rls.sql',
  'supabase/tests/concurrent_append.sql',
]

let failed = 0
for (const f of files) {
  if (!existsSync(f)) { console.error(`MISSING: ${f}`); failed++; continue }
  const src = readFileSync(f, 'utf8')
  if (!/append_resolved_item/.test(src)) {
    console.error(`FAIL: ${f} does not reference append_resolved_item`)
    failed++
  } else {
    console.log(`OK:   ${f}`)
  }
}
if (failed > 0) process.exit(2)
console.log('\nAll SQL test files present.')
