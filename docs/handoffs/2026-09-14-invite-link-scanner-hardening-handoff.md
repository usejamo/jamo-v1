# Handoff — execute the invite/recovery link scanner hardening plan

**Written:** 2026-09-14, at the end of the session that diagnosed the problem.
**Repo:** `C:\Users\aaron\VS Code Projects\Jamo\jamo-v1`, branch `master`, clean and
pushed at `ff1e29f`. (`.claude/settings.local.json` shows modified — it was already
dirty before that session, not part of this work. Leave it.)

## What you are doing

Executing a written, approved plan:

- **Plan:** `docs/superpowers/plans/2026-09-14-invite-link-scanner-hardening.md`
- **Spec:** `docs/superpowers/specs/2026-09-14-invite-link-scanner-hardening-design.md`

Read both before touching anything. The plan is 6 tasks / 31 steps and is meant to be
run task-by-task with `superpowers:subagent-driven-development` — a fresh subagent per
task, review between tasks.

## Why this exists (one paragraph)

On 2026-09-14 the first client onboarding broke. The invited user clicked his invitation
two minutes after it was sent and was told it had expired; a password-reset link sent as
a workaround died within 73 seconds. Cause: a Supabase invite link **is** the verify
endpoint, so a plain GET spends the one-time token — and Microsoft Defender Safe Links
pre-fetches every URL in an inbound email. The scanner spends the token; the human gets
"expired". The fix stops putting the verify endpoint in the email: link to our own page
carrying `{{ .TokenHash }}`, keep that page inert on load, and call `verifyOtp` only on
the password submit, so the token can only be spent by a request carrying a typed
password.

## START HERE: Task 1 needs a human

**Task 1 is a gate and you cannot complete it alone.** It sends a real invite email and
requires someone to open an inbox and report what a probe line rendered. Ask Aaron to
do the send/read half. Do not skip it, do not "reason" your way past it, and do not
start Task 2 until the probe confirms `{{ .TokenHash }}` renders as a real hex string.

If it renders literally or empty, **stop**. The design's core assumption is wrong and
the right move is to reopen the spec, not to patch around it.

Task 1 also creates a real `auth.users` row — clean it up (Step 4) or it pollutes the org.

## DO NOT TRUST THE STATED CAUSE — INCLUDING MINE

The scanner diagnosis is strong but **circumstantial**: the session that consumed the
invitation came from `57.155.170.192` (a Microsoft Azure IP) on **Windows** 61 seconds
after send, while the invited user was on a **Mac**. That is compelling, not proven.

**Task 6 Step 5 is the only step that proves the fix works**: invite a Microsoft 365
mailbox and verify the token is STILL unspent before any human clicks. Every test before
it only proves the happy path survived. If the token is spent before the human clicks,
the design is defeated — stop and reopen the spec.

This codebase has a history of confident wrong diagnoses. In the session that produced
this plan alone: a "frontend-only" bug turned out to need an RLS migration, and a
"double-click" theory for this very issue was wrong until session IPs were checked.

## Environment traps that cost real time

- **`supabase db push` does NOT work here** (migration history diverged). Run SQL via
  `POST https://api.supabase.com/v1/projects/fuuvdcvbliijffogjnwg/database/query` with
  the `sbp_` token from the `SUPABASE_ACCESS_TOKEN` line of `.env`.
- **`.env` must contain only `KEY=VALUE` lines** or every Supabase CLI call dies with a
  confusing parse error.
- **`auth.audit_log_entries` is EMPTY on this project.** Do not reach for it. Auth
  forensics come from `auth.sessions` (it carries `ip` and `user_agent`) and the token
  columns on `auth.users` (`confirmation_token`, `recovery_token`, `recovery_sent_at`).
- **Management API reads lag writes by ~20s.** After any `PATCH /config/auth`, wait
  before verifying. Send **only** `mailer_*` keys in these PATCHes — never include
  `uri_allow_list` in a partial payload, it has been clobbered that way before.
- **Netlify prod can run stale.** Do not assume a push deployed. Task 6 Step 1 greps the
  live JS bundle for a string unique to the new code; use it.
- **Baselines — compare counts, do not chase them:** `npx vitest run` = 671 passed / 16
  skipped. `npx tsc --noEmit` = **303 pre-existing errors**. Keep your own files clean;
  the 303 are not yours to fix.
- **jsdom cannot prove any of this.** It cannot prove a link scanner does anything.
- **Dev server:** `npm run dev`, port varies — read it from the log. Kill stale servers
  first; an old tab on a stale port caused a false bug report in a previous session.
  Login: `usera@jamo.com` / `password123` (org `00000000-0000-0000-0000-000000000001`).

## Hard constraints — do not violate these

1. **Do NOT delete the `Bioduro US` org or the `max@usejamo.com` user.** Aaron's explicit
   instruction. The client is still using that account and will move to his own in his
   own time. Nothing gets cleaned up until Aaron says so.
2. **No edge-function changes.** `{{ .TokenHash }}` and `{{ .SiteURL }}` are
   template-native, so `supabase/functions/_shared/invites.ts` stays untouched and
   nothing deploys to Supabase Functions. If you find yourself wanting to change it,
   you have drifted from the plan.
3. **Never "fix" an expired link by resending the invite.** `inviteUserByEmail` rejects
   an already-registered address, and the shared helper then revokes the row it just
   created. That is what made today worse. Unblock a stuck user by setting a password
   via the Admin API (`PUT /auth/v1/admin/users/<id>`, service-role key) and sharing it
   out of band.
4. **Rollout order is frontend → templates → `mailer_otp_exp`.** Templates before the
   frontend breaks every new invite, because the live templates would point at a page
   that cannot yet read `token_hash`.

## Context you will otherwise have to rediscover

- **There is a deploy backlog.** Commits `54bd8e9` and `8cf5a06` (proposal list state +
  archived-detail fixes) are pushed. Prod was confirmed serving `54bd8e9`; `8cf5a06` and
  `public/email-logo-wordmark.png` were not yet verified live. Task 6 Step 1 deploys and
  checks both — the logo matters because the new email templates reference it and will
  render a broken image if it 404s.
- **The email templates already exist and are already branded** (`supabase/templates/`,
  committed in `63c0d4a`) but have **never been applied to the live project** — the
  hosted project still sends Supabase's stock boilerplate. `supabase/config.toml` drives
  only the local stack. Task 6 Step 2 applies all four.
- **`mailer_otp_exp` is currently 3600** (1 hour). Task 6 Step 4 raises it to 86400. This
  was NOT the cause of the onboarding failure — that link was ~60 seconds old — but a
  91-hour-old invite did also die of it earlier the same day.
- **Matt (`matt.troskey@bioduro.com`)** has a working account in the `Bioduro` org, admin,
  with a password set manually via the Admin API. He may still be using the workaround
  account under `max@usejamo.com` in `Bioduro US`. Both stay as they are.
- Related open todos in `.planning/todos/pending/2026-09-10-ui-ux-bug-batch.md`: **#28**
  (personalize the invite with org/inviter name — deliberately out of scope here because
  it needs the edge-function change this plan avoids) and **#29** (email logo weight).

## Suggested opening moves

1. Read the spec, then the plan. They argue from each other.
2. Confirm the repo is at `ff1e29f` and the working tree is clean.
3. Invoke `superpowers:subagent-driven-development`.
4. Do Task 1 **with Aaron** — you send/prepare, he reads the inbox and reports the probe
   line verbatim. Get the actual rendered string, not a paraphrase.
5. Only then start Task 2.
