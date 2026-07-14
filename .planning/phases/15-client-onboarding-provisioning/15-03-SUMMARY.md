---
phase: 15
plan: 03
subsystem: auth-pages
tags: [auth, supabase, invite, password-reset, react-router]
dependency-graph:
  requires: []
  provides:
    - "src/pages/AcceptInvite.tsx (set-initial-password page)"
    - "src/pages/ForgotPassword.tsx (reset request page)"
    - "src/pages/ResetPassword.tsx (set-new-password page)"
  affects:
    - "plan 11 (route wiring for /accept-invite, /forgot-password, /reset-password)"
    - "Login.tsx (req 13 signup cleanup adds a 'Forgot password?' link to /forgot-password)"
tech-stack:
  added: []
  patterns:
    - "Route-identified auth flows: session existence checked via supabase.auth.getSession() on mount, never onAuthStateChange event type"
    - "Login card chrome reused verbatim (bg-gray-50 shell, bg-white rounded-xl shadow-lg card, text-2xl font-semibold h1, jamo-500 primary button)"
key-files:
  created:
    - src/pages/AcceptInvite.tsx
    - src/pages/ForgotPassword.tsx
    - src/pages/ResetPassword.tsx
    - src/pages/__tests__/ResetPassword.test.tsx
  modified: []
decisions:
  - "AcceptInvite and ResetPassword both call supabase.auth.getSession() on mount to distinguish a valid implicit-flow session (show form) from an invalid/expired link (show static error copy) — this is a session-EXISTENCE check, not an event-type branch, so it does not violate Pitfall 1/2's 'never inspect onAuthStateChange' rule."
  - "ForgotPassword always shows the same static confirmation regardless of resetPasswordForEmail's outcome (success or thrown error) — prevents user enumeration per UI-SPEC and threat T-15-10."
metrics:
  duration: "~25 min"
  completed: 2026-07-14
---

# Phase 15 Plan 03: Standalone Auth Pages (Accept-Invite, Forgot-Password, Reset-Password) Summary

Three route-identified, Login-chrome-matching auth pages built directly against `supabase.auth` (no new edge function): `/accept-invite` and `/reset-password` both call `updateUser({ password })` to force a set-password step before an implicit-flow session is treated as authenticated, and `/forgot-password` calls `resetPasswordForEmail` with a `redirectTo` pointed at `/reset-password`.

## What Was Built

- **`src/pages/AcceptInvite.tsx`** — Full-screen centered card matching `Login.tsx` chrome. On mount, calls `supabase.auth.getSession()` to check for an active implicit-flow session (established the instant the invite link is clicked, per RESEARCH Pitfall 1). If present: renders "Set Your Password" form (password + confirm inputs, "Set Password" button) that validates match, calls `updateUser({ password })`, navigates to `/` on success. If absent: renders the UI-SPEC invalid-link copy with no self-serve resend (D-06/D-08).
- **`src/pages/ResetPassword.tsx`** — Identical shell/logic to AcceptInvite, headed "Set New Password" / "Set New Password" button, invalid-link copy links back to `/forgot-password`.
- **`src/pages/ForgotPassword.tsx`** — Login-style card, single email input, "Send Reset Link" button calling `resetPasswordForEmail(email, { redirectTo: \`${origin}/reset-password\` })`. Always shows the static "If an account exists for that email, a reset link is on its way." confirmation regardless of outcome — no user enumeration (threat T-15-10).
- **`src/pages/__tests__/ResetPassword.test.tsx`** — Vitest + Testing Library, mocks `../../lib/supabase` (`auth.updateUser`, `auth.getSession`). Covers: (1) form renders password input + "Set New Password" button once session check resolves, (2) mismatched passwords show a validation error and `updateUser` is NOT called, (3) matching passwords call `updateUser` exactly once with the new password.

Both set-password pages use `text-2xl font-semibold text-gray-900` for their h1 (not `font-bold`, which stays Login-only per the UI-SPEC 2-weight budget). Flow identification is entirely route-based — neither page reads or branches on `onAuthStateChange` event type; the only auth-state read is a one-time `getSession()` existence check used to choose between "show form" and "show invalid-link copy."

## Verification

- `npm run build` — passes, no errors, all three new pages compile.
- `npm run test:run -- ResetPassword` — 3/3 tests passing.
- Grep acceptance criteria (all satisfied):
  - `updateUser` present in both AcceptInvite.tsx and ResetPassword.tsx
  - `font-bold` count = 0 in both files
  - "Set Your Password" in AcceptInvite.tsx, "Set New Password" in ResetPassword.tsx
  - `onAuthStateChange` count = 0 in AcceptInvite.tsx
  - `resetPasswordForEmail` with `redirectTo` containing `reset-password` in ForgotPassword.tsx
  - "if an account exists" confirmation copy present in ForgotPassword.tsx

## Deviations from Plan

None — plan executed exactly as written. One implementation addition not explicitly spelled out in the plan's action text but required to satisfy the plan's own acceptance criteria and threat mitigation T-15-09 (pages must present the set-password form only when a session truly exists, and show invalid-link copy otherwise): both AcceptInvite and ResetPassword call `supabase.auth.getSession()` once on mount to gate which view renders. This is a session-existence check (not an event-type branch) and is explicitly compatible with Pitfall 1/2 — logged for transparency, not a Rule 1-4 deviation since the plan's own acceptance criteria (invalid/expired copy shown when no session) required *some* way to detect session absence.

## Known Stubs

None. All three pages are fully wired to live `supabase.auth` calls; no mock/placeholder data paths remain in shipped code (mocks exist only in the test file, as expected).

## Threat Flags

None — no new surface introduced beyond what `<threat_model>` in the plan already covers (T-15-09, T-15-10, T-15-11 all directly addressed by the implementation above).

## Self-Check: PASSED

- FOUND: src/pages/AcceptInvite.tsx
- FOUND: src/pages/ForgotPassword.tsx
- FOUND: src/pages/ResetPassword.tsx
- FOUND: src/pages/__tests__/ResetPassword.test.tsx
- FOUND commit 1d2bccb (Task 1: AcceptInvite.tsx + ResetPassword.tsx)
- FOUND commit 695acfc (Task 2: ForgotPassword.tsx + ResetPassword.test.tsx)

Note: Live invite/reset email delivery (reqs 5/10 end-to-end) is human-verified in plan 02's checkpoint + the phase gate — not re-verified here. Route wiring (`/accept-invite`, `/forgot-password`, `/reset-password` registered in `App.tsx`) happens in plan 11; these pages are currently unrouted leaf components.
