---
plan: 15-08
phase: 15-client-onboarding-provisioning
status: complete
autonomous: true
executed_by: orchestrator (live ops)
completed: 2026-07-14
---

# 15-08 SUMMARY — Ship the backend live

Orchestrator-driven live-ops plan (no source files change). Executed directly by the
execute-phase orchestrator using the Supabase MCP + CLI rather than a gsd-executor subagent,
because it performs live production operations requiring `.env` credentials.

## What shipped

### 1. Deployed all five new edge functions to prod (`fuuvdcvbliijffogjnwg`)
Deployed via `npx supabase functions deploy <name> --project-ref fuuvdcvbliijffogjnwg`
(access token sourced from `.env` `SUPABASE_ACCESS_TOKEN`), `verify_jwt=true` (platform
validates the JWT; each function additionally asserts role from the verified JWT):

- `admin-create-org`
- `admin-invite-first-admin`
- `admin-invites-lifecycle`
- `team-invite`
- `team-manage`

**Deploy-enabling fix:** the five functions shipped without a `deno.json`, so their
`import { createClient } from 'supabase'` bare specifier would not resolve. Added the standard
import map (`{"imports":{"supabase":"npm:@supabase/supabase-js@2"}}`) to each — commit `068726c`.

**Re-deploy after Wave 5:** plan 15-10 subsequently modified `team-invite/index.ts`,
`team-manage/index.ts`, and `_shared/invites.ts` (added `list_members`, `resend`/`revoke`
actions, and an exported helper). Re-deployed `team-invite`, `team-manage`,
`admin-invite-first-admin`, and `admin-invites-lifecycle` so prod == committed source.

### 2. Confirmed the Phase 14.3 prerequisite gate is deployed
Verified via `list_edge_functions`: `chat-with-jamo` (v20, `verify_jwt:true`),
`salesforce-oauth-initiate`, `salesforce-oauth-disconnect`, and `retrieve-context` are all
ACTIVE — the JWT-identity hardening gate is live (req: 14.3 must be deployed before Phase 15
introduces untrusted tenants).

### 3. Ran the bootstrap script live — super_admin now exists
`npx tsx scripts/bootstrap-super-admin.ts` against prod (creds from `.env`
`BOOTSTRAP_SUPER_ADMIN_EMAIL`/`BOOTSTRAP_SUPER_ADMIN_PASSWORD`, added by the user).

Live verification (`execute_sql`):
- `super_admins = 1` (email `aarondswoodbury@gmail.com`)
- org `jamo-internal` created, profile `is_active = true`
- bootstrap invites row `status = accepted`

The idempotency guard is confirmed by the script's own logic (skips if a super_admin exists).

## Self-Check: PASSED
- [x] All 5 functions deployed and ACTIVE
- [x] Prod function source == committed source (re-deployed after Wave 5 edits)
- [x] 14.3 JWT gate confirmed deployed
- [x] super_admin provisioned live and verified via SQL

## Notes / follow-ups
- **Pending human checkpoint (from 15-02):** Resend account, DNS (SPF/DKIM/DMARC), hosted-dashboard
  SMTP + redirect allow-list + rate limit are still required before invite/reset emails actually
  deliver. Bootstrap uses `auth.admin.createUser` (no email needed), so the super_admin works now,
  but inviting client admins by email needs the SMTP setup completed.
