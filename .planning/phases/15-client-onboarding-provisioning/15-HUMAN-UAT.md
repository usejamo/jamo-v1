---
status: partial
phase: 15-client-onboarding-provisioning
source: [15-VERIFICATION.md, 15-02-SUMMARY.md]
started: 2026-07-14
updated: 2026-07-14
---

## Current Test

[awaiting human testing]

## Tests

### 1. Live invite email delivery (reqs 4/8)
expected: A super_admin invites a client's first admin from /admin; the invitee receives a Resend-delivered email, follows the link to /accept-invite, sets a password, and lands authenticated in their own org.
result: [pending — blocked on 15-02 Resend/DNS/dashboard SMTP setup]

### 2. Live password-reset email delivery (req 10)
expected: A user clicks "Forgot password?" on /login, receives a reset email, follows the link to /reset-password, sets a new password, and can log in.
result: [pending — blocked on 15-02 Resend/DNS/dashboard SMTP setup]

### 3. req-12 adversarial tamper test against the live DB
expected: Running supabase/migrations/verify/15-12-tamper.sql (or equivalent) confirms handle_new_user binds org/role ONLY from the invites table — a createUser with hostile raw_user_meta_data cannot self-assign org/role, and no auth user can be created without a matching pending invite.
result: [pending]

### 4. AdminPanel end-to-end click-through (15-09 checkpoint)
expected: Logged in as the super_admin (aarondswoodbury@gmail.com), /admin loads; create-org (name+plan, live slug), invite-first-admin, and per-row Resend/Revoke all work against the deployed admin-* functions.
result: [pending]

### 5. Settings > Team tab end-to-end click-through (15-10 checkpoint)
expected: As an org admin, Settings shows the Team tab (hidden for role=user); invite teammate (admin/user only), change role, deactivate/reactivate, and own-org resend/revoke all work against the deployed team-* functions; a deactivated user cannot authenticate.
result: [pending]

## Summary

total: 5
passed: 0
issues: 0
pending: 5
skipped: 0
blocked: 0

## Gaps

(none recorded yet — populate if a test fails)

## Pending human setup (prerequisite for tests 1 & 2)

From plan 15-02 (deferred by user decision):
- Create Resend account; verify sending domain DNS (SPF / DKIM / DMARC).
- Configure hosted Supabase dashboard: SMTP (Resend), redirect allow-list
  (/accept-invite, /forgot-password, /reset-password for the prod app origin),
  and the email rate limit.
- The committed supabase/config.toml already reflects these settings for local;
  the hosted dashboard must be set to match.
