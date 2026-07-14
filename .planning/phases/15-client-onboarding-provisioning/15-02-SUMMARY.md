---
phase: 15-client-onboarding-provisioning
plan: 02
subsystem: auth
tags: [supabase, config.toml, auth, smtp, resend, redirect-allowlist, rate-limit]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning (Plan 01)
    provides: invites table + handle_new_user trigger rewrite (identity binding this SMTP flow will email into)
provides:
  - Committed config.toml with signup permanently disabled (no local/prod divergence)
  - Resend SMTP block wired via env(RESEND_SMTP_PASSWORD) reference (no committed secret)
  - Three auth-flow redirect routes (/accept-invite, /forgot-password, /reset-password) allow-listed for local + prod (app.usejamo.com)
  - Raised auth email rate limit (2 -> 100/hr)
  - Vitest static guard (config-signup-disabled.test.ts) preventing regression
affects: [15-04 (invite acceptance + set-password), 15-05 (org-admin teammate invites), 15-08 (password reset), any future plan sending Supabase Auth email]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "config.toml secrets via env(VAR_NAME) reference, never literal — same convention as existing SUPABASE_SERVICE_ROLE_KEY usage in edge functions"

key-files:
  created:
    - src/__tests__/config-signup-disabled.test.ts
  modified:
    - supabase/config.toml

key-decisions:
  - "Production redirect domain: used https://app.usejamo.com (matches the existing ALLOWED_SETTINGS_ORIGINS convention found in 12-REVIEW.md / salesforce-oauth code) since no other authoritative prod domain constant exists yet in the repo."
  - "admin_email placeholder set to notifications@usejamo.com pending the human's actual Resend-verified sender address; must be corrected once the human completes domain verification if a different address is used."

patterns-established:
  - "Auth config test convention: static fs.readFileSync assertion tests for config.toml under src/__tests__/, no Supabase CLI/runtime dependency, <1s runtime."

requirements-completed: [15-01, 15-09, 15-05, 15-10]

# Metrics
duration: 12min
completed: 2026-07-14
---

# Phase 15 Plan 02: Auth Lockdown + Resend SMTP Config Summary

**Signup permanently disabled in committed config.toml (both occurrences), Resend custom SMTP wired via env-var reference, three auth-flow routes allow-listed for local + prod, rate limit raised to 100/hr — code portion complete, human dashboard/DNS/Resend steps deferred per explicit user instruction.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-14T01:07:00Z
- **Completed:** 2026-07-14T01:19:00Z
- **Tasks:** 2 of 3 (Task 3 is the human-action checkpoint — deferred, see below)
- **Files modified:** 2

## Accomplishments
- Both `enable_signup = true` occurrences ([auth] and [auth.email]) flipped to `false` — closes req 1's local/prod divergence
- `[auth.email.smtp]` block uncommented and pointed at Resend (`smtp.resend.com:465`, user `resend`, `pass = "env(RESEND_SMTP_PASSWORD)"`) — no literal secret committed
- `additional_redirect_urls` extended with `/accept-invite`, `/forgot-password`, `/reset-password` for both `http://127.0.0.1:3000` and `https://app.usejamo.com`
- `auth.rate_limit.email_sent` raised from 2 to 100
- New Vitest suite (`config-signup-disabled.test.ts`, 5 assertions) guards all of the above against regression

## Task Commits

Each task was committed atomically:

1. **Task 1: Disable signup, wire Resend SMTP, redirect URLs, and rate limit in config.toml** - `8b42757` (feat)
2. **Task 2: Static test asserting signup is disabled in committed config** - `d5a9d8f` (test)

**Task 3 (checkpoint:human-action, gate="blocking"):** NOT executed by this agent — per explicit `CHECKPOINT_HANDLING_OVERRIDE` instruction, the human has chosen to defer this step and continue building. See "PENDING HUMAN CHECKPOINT" below.

## Files Created/Modified
- `supabase/config.toml` - signup disabled (both sections), Resend SMTP block, redirect allow-list, raised rate limit
- `src/__tests__/config-signup-disabled.test.ts` - static guard test (5 assertions, reads config.toml as text)

## Decisions Made
- Chose `https://app.usejamo.com` as the production redirect domain — this string was already used as a trusted origin in `12-REVIEW.md`'s `ALLOWED_SETTINGS_ORIGINS` list for the Salesforce OAuth flow, and no other authoritative "the prod domain" constant exists elsewhere in the repo/config. If the actual production domain differs, the human must update both `config.toml`'s `additional_redirect_urls` and the hosted dashboard's Redirect URLs allow-list to match during the Task 3 checkpoint.
- Set `admin_email = "notifications@usejamo.com"` as a placeholder sender address — this is NOT a secret (email addresses aren't sensitive), but it IS a placeholder that must be corrected to the human's actual Resend-verified sender if different.

## Deviations from Plan

None — plan executed exactly as written for Tasks 1 and 2. Task 3 was intentionally not executed per explicit orchestrator override (see below), not a deviation rule.

## Issues Encountered

None.

## PENDING HUMAN CHECKPOINT

**Type:** human-action (gate="blocking" in the plan; deferred by explicit user instruction — build continues without waiting)

The following steps require a human because they need account creation, domain ownership verification, or hosted-dashboard access no CLI/API credential in this environment can complete:

1. **Create a Resend account** and add the sending domain (e.g. `usejamo.com`). Add the SPF, DKIM, and DMARC DNS records Resend provides to the domain's DNS host, and wait for Resend to show the domain as "Verified".
2. **Create a Resend API key** and put it in `.env` as `RESEND_SMTP_PASSWORD=re_...` — never commit this value. (Committed `config.toml` already references it via `env(RESEND_SMTP_PASSWORD)`, so once the env var is set locally/in the hosted project's function secrets, no further code change is needed.)
3. **Confirm the verified sender address** — if it differs from the placeholder `notifications@usejamo.com` used in `config.toml`'s `admin_email`, update that value (or leave as a placeholder to be corrected by whoever completes this checkpoint — it does not block Supabase config validity, only actual delivery).
4. **Configure Supabase Dashboard custom SMTP** for hosted project `fuuvdcvbliijffogjnwg`: Authentication -> Emails/SMTP -> host `smtp.resend.com`, port 465, user `resend`, password = the Resend API key, sender = the verified address, sender name `Jamo`.
5. **Add the three redirect routes to the hosted dashboard's allow-list**: Authentication -> URL Configuration -> Redirect URLs -> add `/accept-invite`, `/forgot-password`, `/reset-password` for BOTH the local origin (`http://127.0.0.1:3000`) and the production domain (confirm it is `https://app.usejamo.com` or correct if different).
6. **Raise the hosted dashboard's email rate limit**: Authentication -> Rate Limits -> "Emails sent" -> raise to ~100/hour (matches the `config.toml` value already committed).
7. **Verify live delivery**: send one test invite (or use Supabase's "send test email") and confirm it arrives from the Resend sender, not from inbucket/the Supabase default sender.

Resume signal (per the original plan): once a test email delivers from the Resend sender and the three redirect URLs are allow-listed on the hosted dashboard, this checkpoint can be marked resolved. Until then, `must_haves` truth #4 ("Live invite + reset emails deliver from the Resend sender") remains UNVERIFIED — the code-side truths (1-3) are satisfied and test-guarded.

## User Setup Required

See "PENDING HUMAN CHECKPOINT" above — no separate USER-SETUP.md was generated; the plan's own `<task type="checkpoint:human-action">` block is the source of truth for these steps and is reproduced above with full detail.

## Next Phase Readiness

- Code-side auth lockdown is complete and test-guarded; downstream plans (15-04 invite acceptance, 15-05 org-admin invites, any plan sending Auth email) can proceed on the assumption that `config.toml` is correctly shaped.
- BLOCKER for live email verification only: every email-dependent requirement (reqs 4, 5, 8, 9, 10 per 15-RESEARCH.md) will send through inbucket/no-op locally and will fail to deliver in the hosted project until the human completes the Resend/DNS/dashboard steps above. This does not block further code-writing plans, only live end-to-end email verification.

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

- FOUND: supabase/config.toml
- FOUND: src/__tests__/config-signup-disabled.test.ts
- FOUND: commit 8b42757
- FOUND: commit d5a9d8f
