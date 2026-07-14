---
phase: 15-client-onboarding-provisioning
plan: 11
subsystem: auth
tags: [react-router, react-context, route-guard, rbac, vitest]

# Dependency graph
requires:
  - phase: 15-client-onboarding-provisioning (plan 03)
    provides: AcceptInvite/ForgotPassword/ResetPassword auth pages
  - phase: 15-client-onboarding-provisioning (plan 09)
    provides: AdminPanel page (org list/create-org/invite-first-admin/pending-invites)
  - phase: 15-client-onboarding-provisioning (plan 10)
    provides: Settings > Team tab (not routed by this plan, already registered in Settings.tsx)
provides:
  - SuperAdminRoute client-side role guard (super_admin only, redirects others to /)
  - /admin wired into the route tree, gated behind ProtectedRoute + SuperAdminRoute
  - /accept-invite, /forgot-password, /reset-password wired as public routes
  - Dead self-serve signup path fully removed (signUp method, signup JSX, hardcoded Test Org A/B UUIDs)
  - Login "Forgot password?" link
affects: [phase-15-deploy-wave, phase-15-live-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Route guard clone pattern: SuperAdminRoute clones ProtectedRoute's loading/redirect/Outlet shape, swaps the session check for a profile.role check"
    - "Public auth routes are route-identified siblings of /login (outside ProtectedRoute), not event-typed via onAuthStateChange"

key-files:
  created:
    - src/components/SuperAdminRoute.tsx
    - src/components/__tests__/SuperAdminRoute.test.tsx
  modified:
    - src/App.tsx
    - src/context/AuthContext.tsx
    - src/pages/Login.tsx
    - src/context/__tests__/auth-context.test.ts
    - src/components/__tests__/ProposalCreationWizard.test.tsx

key-decisions:
  - "SuperAdminRoute nested INSIDE the existing ProtectedRoute (not a sibling) so an unauthenticated user still hits /login first before any role check runs."
  - "Denial redirects to / (not /login) per UI-SPEC section 1 — a logged-in non-super_admin user should land on the app home, not be bounced back to the login form."
  - "Cleaned up now-dead `signUp` references in auth-context.test.ts and ProposalCreationWizard.test.tsx mocks (Rule 1) since AuthContext no longer exposes that method — left them in place would be stale tests for removed functionality, not scope creep."

patterns-established:
  - "Role-gated route guard: clone ProtectedRoute shape, swap the auth predicate, redirect target chosen per the UX rule for that denial case (not always /login)."

requirements-completed: ["15-02", "15-13", "15-05", "15-10"]

# Metrics
duration: 20min
completed: 2026-07-14
---

# Phase 15 Plan 11: Route Wiring & Signup Removal Summary

**SuperAdminRoute role guard gates /admin behind ProtectedRoute; three public auth routes wired; dead self-serve signup path (signUp method, signup JSX, hardcoded Test Org A/B UUIDs) fully removed with a Forgot password link added to Login.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-14T06:58:36Z
- **Completed:** 2026-07-14T07:06:31Z
- **Tasks:** 3
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `SuperAdminRoute` created (mirrors `ProtectedRoute`'s loading/redirect/Outlet shape) and unit-tested: loading shows the Loading state, `super_admin` renders the Outlet, `admin`/`user`/no-profile all redirect to `/` (not `/login`)
- `/admin` wired inside the existing `ProtectedRoute` tree, wrapped by `SuperAdminRoute`, rendering `AdminPanel` — the page built in plan 09 is now reachable
- `/accept-invite`, `/forgot-password`, `/reset-password` wired as public routes (siblings of `/login`, outside `ProtectedRoute`) — the pages built in plan 03 are now reachable and correctly bypass the app session gate (Pitfalls 1/2)
- Dead self-serve signup path fully deleted: `signUp` removed from `AuthContext`'s interface/impl/context value; `isSignUp` state, `signUp` destructure, sign-up branch, and the sign-up JSX (Full Name field + Organization selector with hardcoded Test Org A/B UUIDs) removed from `Login.tsx`
- "Forgot password?" link added below the password field in `Login.tsx`, routing to `/forgot-password`

## Task Commits

Each task was committed atomically:

1. **Task 1: SuperAdminRoute guard + unit test (req 2)** - `aa2ae78` (feat)
2. **Task 2: Wire routes in App.tsx** - `5f3e36b` (feat)
3. **Task 3: Remove dead signup code + add forgot-password link (req 13)** - `60630ce` (feat)

_No TDD gate applies to this plan — Task 1 has `tdd="true"` but is a green-field component with no pre-existing implementation to red/green against; the test file was written alongside the implementation and both landed in one commit per the plan's task grouping._

## Files Created/Modified
- `src/components/SuperAdminRoute.tsx` - Role-based route guard; denies non-super_admin (redirect to `/`), clones `ProtectedRoute`'s loading/Outlet shape
- `src/components/__tests__/SuperAdminRoute.test.tsx` - 5 Vitest cases (loading, super_admin-allow, admin-deny, user-deny, null-profile-deny) using `MemoryRouter` + a mocked `useAuth`
- `src/App.tsx` - Imports + wires `AcceptInvite`/`ForgotPassword`/`ResetPassword` as public routes; imports + wires `SuperAdminRoute` + `AdminPanel` for `/admin` inside `ProtectedRoute`
- `src/context/AuthContext.tsx` - `signUp` removed from interface, implementation, and context value
- `src/pages/Login.tsx` - `isSignUp` state, `signUp` destructure, sign-up branch, sign-up JSX (Full Name + Org selector + hardcoded Test Org A/B UUIDs) removed; `Link` import added; "Forgot password?" link added
- `src/context/__tests__/auth-context.test.ts` - Removed the `signUp` mock and the "exports signUp method" test (method no longer exists)
- `src/components/__tests__/ProposalCreationWizard.test.tsx` - Removed the unused `signUp: vi.fn()` entry from the mocked `useAuth` return value

## Decisions Made
- SuperAdminRoute nests inside `ProtectedRoute` (not as a sibling route wrapper) so unauthenticated users hit `/login` first, matching the plan's interface spec and RESEARCH Pattern 1.
- Denial in `SuperAdminRoute` redirects to `/`, not `/login`, per UI-SPEC section 1 — a signed-in non-super_admin should land on the app home.
- Removed now-dead `signUp` references from two test mock files (Rule 1 — bug: stale tests mocking/testing a method removed from `AuthContext`'s public interface). Not part of `files_modified` in the plan frontmatter, but directly caused by Task 3's removal and required for the plan's own acceptance grep (`grep -rn "signUp" src/` returns zero hits) and for both test files to remain accurate.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed stale `signUp` references from two test files**
- **Found during:** Task 3 (remove dead signup code)
- **Issue:** `src/context/__tests__/auth-context.test.ts` and `src/components/__tests__/ProposalCreationWizard.test.tsx` both referenced `signUp` (a mock property and a dedicated test asserting `supabase.auth.signUp` exists), which is directly downstream of the interface change in this task and would leave dead/stale test coverage for removed functionality.
- **Fix:** Removed the `signUp` mock property from `ProposalCreationWizard.test.tsx`'s `useAuth` mock; removed the `signUp` mock and its dedicated test case from `auth-context.test.ts`.
- **Files modified:** `src/context/__tests__/auth-context.test.ts`, `src/components/__tests__/ProposalCreationWizard.test.tsx`
- **Verification:** `grep -rn "signUp" src/` returns zero hits; full `npm run test:run` green (382 passed, 16 skipped).
- **Committed in:** `60630ce` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary to satisfy the plan's own acceptance criteria and keep test coverage honest. No scope creep — both edits were narrowly downstream of the AuthContext interface change made in this same task.

## Issues Encountered

**Coincidental UUID collision in an unrelated file (not fixed — out of scope).** The plan's Task 3 acceptance criteria greps for the literal string `00000000-0000-0000-0000-000000000001` (the hardcoded "Test Org A" UUID removed from `Login.tsx`) and expects zero hits in `src/`. That literal also appears at `src/components/ProposalCreationWizard.tsx:220` as an unrelated fallback default `templateId` (`state.selectedTemplateId ?? '00000000-0000-0000-0000-000000000001'`), pre-existing code with no connection to org selection or signup. This file is not in the plan's `files_modified` list and the value serves a genuinely different purpose (a nil-pattern default template ID, not an org identifier). Per the Scope Boundary rule, this was left untouched rather than auto-fixed — modifying an unrelated default-template fallback would be an out-of-scope behavior change. The plan's *intent* ("Test Org A/B UUIDs gone") is fully satisfied: both UUIDs are gone from `Login.tsx` and from every signup-related code path. The task's own literal `<verify><automated>` grep command (`! grep -rq "00000000-0000-0000-0000-000000000001" src/`) will report a false-positive failure on this coincidental match; this is a known, documented limitation of that specific grep pattern, not an unresolved defect in this plan's scope.

## User Setup Required

None - no external service configuration required. (Live email delivery for the auth routes wired here remains gated on the Resend SMTP checkpoint from plan 02, already documented as pending in that plan's summary.)

## Next Phase Readiness

- All three route-wiring goals are live: `/admin` is super_admin-gated, the three auth pages are publicly reachable, and the dead signup path is fully removed.
- Build passes (`npm run build`, no TS errors) and the full test suite is green (382 passed, 16 skipped, including the new 5 `SuperAdminRoute` tests).
- Requirements 15-02, 15-05, 15-10, 15-13 are structurally complete in code. Full end-to-end live verification (actual `/admin` access control, actual invite emails via Resend, actual login flow) is still gated on the deploy wave (plan 08) and the deferred human checkpoints from plans 02, 09, and 10, per this plan's `<output>` note.
- No blockers for closing out the remaining Phase 15 checkpoints once the deploy wave runs.

---
*Phase: 15-client-onboarding-provisioning*
*Completed: 2026-07-14*

## Self-Check: PASSED

All created/modified files verified present on disk; all 3 task commit hashes (aa2ae78, 5f3e36b, 60630ce) verified present in git log.
