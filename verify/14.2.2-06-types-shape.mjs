// Phase 14.2.2 — Plan 06 Task 2 verify: regenerated types shape.
import { readFileSync, existsSync } from 'node:fs'

const path = 'src/types/database.types.ts'
if (!existsSync(path)) {
  console.error(`MISSING: ${path}`)
  process.exit(1)
}
const src = readFileSync(path, 'utf8')
const checks = [
  { name: 'append_resolved_item entry present', re: /append_resolved_item\b/ },
  { name: 'p_proposal_id arg', re: /p_proposal_id/ },
  { name: 'p_user_id arg', re: /p_user_id/ },
  { name: 'p_org_id arg', re: /p_org_id/ },
  { name: 'p_entry arg', re: /p_entry/ },
]
let failed = 0
for (const c of checks) {
  if (!c.re.test(src)) { console.error(`FAIL: ${c.name}`); failed++ }
  else console.log(`OK:   ${c.name}`)
}
if (failed > 0) process.exit(2)
console.log('\nAll types-shape checks passed.')
