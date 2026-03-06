---
phase: 02-authentication-routing
plan: 03
subsystem: auth-ux
tags: [logout, profile, role-visibility, ux]

dependency-graph:
  requires:
    - 02-01-SUMMARY.md (AuthContext.signOut, AuthContext.profile)
  provides:
    - Logout button in Sidebar
    - User profile display in Settings (role, org_id visible)
  affects:
    - src/components/Sidebar.tsx
    - src/pages/Settings.tsx

tech-stack:
  added: []
  patterns:
    - Auth hook consumption (useAuth)
    - Role awareness UI foundation

key-files:
  created: []
  modified:
    - src/components/Sidebar.tsx: Added logout button with signOut handler
    - src/pages/Settings.tsx: Added Profile tab with role/org display

decisions: []

metrics:
  duration: 219s
  tasks_completed: 2
  files_modified: 2
  commits: 2
  completed_date: 2026-03-06
---

# Phase 02 Plan 03: Logout & Profile Display Summary

**One-liner:** Added logout button to Sidebar and user profile section in Settings displaying role and org ID for role awareness foundation.

## What Was Built

**Logout functionality:**
- Sidebar now includes a logout button below the Settings link
- Button calls `AuthContext.signOut()` and navigates to `/login`
- LogoutIcon component added with door-exit SVG
- Error handling logs to console if sign out fails

**Profile display:**
- Settings page now has Profile tab as first tab
- Profile section displays: name, email, role (as badge), organization ID (monospace)
- Read-only display (no editing in MVP)
- Explanatory text about role types (Admin, User, Super Admin)
- Role badge uses jamo brand colors (bg-jamo-100, text-jamo-800)

## Implementation Details

**Sidebar.tsx changes:**
- Imported `useNavigate` from react-router-dom and `useAuth` from AuthContext
- Added `handleSignOut` async function within Sidebar component
- Logout button positioned between Settings link and version info
- Consistent styling with other navigation items

**Settings.tsx changes:**
- Imported `useAuth` hook
- Updated `SUB_TABS` to include 'Profile' as first tab
- Created `ProfileTab` component consuming `user` and `profile` from AuthContext
- Profile set as default active tab
- Gray background panel groups profile fields for visual separation

## Deviations from Plan

None - plan executed exactly as written.

## Verification

**Automated:**
- TypeScript compilation: `npx tsc --noEmit` - passed with no errors

**Manual (to be performed):**
1. Log in → click Settings → see Profile tab as default
2. Profile shows correct email, role badge, org ID
3. Click Sign Out in Sidebar → redirects to /login
4. Log back in → profile data still correct

## Success Criteria

- [x] Sidebar has logout button below Settings
- [x] Logout button calls signOut and navigates to /login
- [x] Settings has Profile tab as first tab
- [x] Profile displays user email, name, role (as badge), org_id
- [x] Role awareness foundation in place (visible, not enforced yet — REQ-8.3)
- [x] TypeScript compiles without errors
- [x] All existing tabs/functionality preserved

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | f536098 | feat(02-03): add logout button to Sidebar |
| 2 | ce8718b | feat(02-03): add user profile section to Settings page |

## Foundation for Future Work

**REQ-8.3 role awareness:** Profile display establishes user visibility of their role and org context. Future phases will enforce role-based access control using this foundation.

**Role types visible:**
- **Admin:** Can manage organization settings and users (Phase 13+)
- **User:** Can create and manage proposals (current state)
- **Super Admin:** Platform-level access for Jamo staff (future)

This plan completes the basic authentication UX by giving users visibility into their account (who they are, what role they have) and the ability to sign out.

## Self-Check: PASSED

All files and commits verified:
- FOUND: src/components/Sidebar.tsx
- FOUND: src/pages/Settings.tsx
- FOUND: f536098
- FOUND: ce8718b
