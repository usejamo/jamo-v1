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

## START HERE: Task 1 is already done — start at Task 2

**Task 1 was completed on 2026-09-14. Do not redo it.** Read its block in the plan for
the results, then begin at Task 2.

What it established, against the live project:

- `{{ .TokenHash }}` is real — `POST /auth/v1/admin/generate_link` returns a populated
  `hashed_token`. It also returns `email_otp`, so the deferred 6-digit fallback is
  available whenever it is wanted.
- The emailed link genuinely is the verify endpoint: `action_link` is
  `https://<ref>.supabase.co/auth/v1/verify?…`.
- **The bug was reproduced deterministically.** One plain `fetch` GET on that link — no
  browser, no JavaScript, no redirect following — flipped the probe user from
  `confirmed_at: null` / 0 sessions / token present to confirmed, 1 session, token
  cleared. That is the exact state the real client's account was in.

**No human, inbox, or Microsoft 365 mailbox is needed anywhere in this plan.**
`generate_link` produces links without sending mail, and a scanner is just a GET.

## The diagnosis is PROVEN — but the fix is not

The scanner diagnosis started circumstantial (an Azure IP on Windows, while the invited
user was on a Mac) and is now demonstrated by the reproduction above. You do not need to
re-litigate the cause.

What is still unproven is that **the fix works**. Task 6 Step 5 replays that same GET —
plus a redirect-following GET, plus a headless browser that renders the page and runs our
JavaScript — against the NEW flow, and requires the token to survive all three. Every
test before it only proves the happy path survived. If any level spends the token, stop
and reopen the spec rather than patching.

Known residual gap, recorded in the spec and not closed by this work: a gateway that
*strips* links entirely would still defeat this. Link *rewriting* (Safe Links wrapping
URLs) does not.

This codebase has a history of confident wrong diagnoses. In the session that produced
this plan alone: a "frontend-only" bug turned out to need an RLS migration, and a
"double-click" theory for this very issue was wrong until session IPs were checked. The
lesson is not to distrust this diagnosis — it is to run the experiment rather than argue.

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
2. Confirm the working tree is clean and you are on `master`.
3. Invoke `superpowers:subagent-driven-development`.
4. **Start at Task 2.** Task 1 is done; its block in the plan is now a recipe for making
   probe invite links without sending email, which Task 6 Step 5 depends on.

Useful trap, learned the hard way while building that recipe: `invites.invited_by` FKs to
`auth.users(id)`, NOT `user_profiles.id`, and it is nullable — omit it. A pending
`invites` row must exist before an auth user can be created at all, or `handle_new_user`
rejects it with `no pending invite for <email>`.
