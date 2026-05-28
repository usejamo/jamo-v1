// Phase 14.2.2 — Plan 01 Task 2 verify: RPC migration file shape.
// PowerShell-safe: no shell chaining, no escape-laden inline regex.
// Run: node verify/14.2.2-01-rpc-shape.mjs
import { readFileSync, existsSync } from 'node:fs'

const path = 'supabase/migrations/20260528120000_append_resolved_item_rpc.sql'

if (!existsSync(path)) {
  console.error(`MISSING: ${path}`)
  process.exit(1)
}

const sql = readFileSync(path, 'utf8')

const checks = [
  { name: 'function declaration', re: /create or replace function public\.append_resolved_item/i },
  { name: 'SECURITY INVOKER', re: /security\s+invoker/i },
  { name: 'FOR UPDATE present', re: /for\s+update/i },
  { name: 'ON CONFLICT DO NOTHING', re: /on\s+conflict\s+\(proposal_id,\s*user_id\)\s+do\s+nothing/i },
  { name: 'cap-at-25 constant', re: /v_cap\s+int\s*:=\s*25/i },
  // String.raw avoids backslash-escape hell:
  { name: 'timestamp DESC sort', re: new RegExp(String.raw`order\s+by\s+\(elem->>'timestamp'\)::timestamptz\s+desc`, 'i') },
  { name: 'GRANT EXECUTE to authenticated', re: /grant\s+execute\s+on\s+function\s+public\.append_resolved_item.*to\s+authenticated/is },
  { name: 'REVOKE ALL from public', re: /revoke\s+all\s+on\s+function\s+public\.append_resolved_item.*from\s+public/is },
]

let failed = 0
for (const c of checks) {
  if (!c.re.test(sql)) {
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
console.log('\nAll RPC shape checks passed.')
