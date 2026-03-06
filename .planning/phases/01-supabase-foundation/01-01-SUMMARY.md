---
phase: 01-supabase-foundation
plan: "01"
subsystem: database
tags: [supabase, typescript, vite, env-vars, client-singleton]

# Dependency graph
requires:
  - phase: 01-supabase-foundation/01-00
    provides: vitest test infrastructure + Supabase mock + stub tests
provides:
  - Singleton Supabase client (src/lib/supabase.ts) typed with Database generic
  - TypeScript Database types placeholder (src/types/database.types.ts)
  - Supabase CLI linked to live project fuuvdcvbliijffogjnwg
  - db:types npm script for regenerating types after schema pushes
affects:
  - All subsequent plans in 01-supabase-foundation (import supabase from src/lib/supabase.ts)
  - All future phases that query the database

# Tech tracking
tech-stack:
  added:
    - "@supabase/supabase-js v2.98"
    - "supabase CLI (npx, v2.76.17)"
  patterns:
    - "Singleton client pattern — createClient called once in src/lib/supabase.ts, imported everywhere"
    - "Database generic pattern — createClient<Database>(...) for full TypeScript inference"
    - "Placeholder types pattern — empty Database interface until schema is pushed in Plans 02-03"
    - "vi.mock pattern — mock supabase module in tests so unit tests never hit real Supabase"

key-files:
  created:
    - src/lib/supabase.ts
    - src/types/database.types.ts
    - supabase/config.toml
  modified:
    - package.json
    - .gitignore
    - src/lib/__tests__/supabase-client.test.ts

key-decisions:
  - "Env vars live in .env (not .env.local) — both are gitignored; .env is the established pattern for this project"
  - "Database types placeholder uses Record<string, never> for Tables/Views/Functions/Enums until Plans 02-03 push real schema"
  - "vi.mock('../supabase') pattern in tests — test file mocks the real module, imports mock from src/test/mocks/supabase"

patterns-established:
  - "Singleton import: import { supabase } from 'src/lib/supabase' — no createClient() in components"
  - "Type regeneration: npm run db:types after any schema migration"

requirements-completed: [REQ-7.1]

# Metrics
duration: 20min
completed: 2026-03-06
---

# Phase 01 Plan 01: Supabase Client Singleton Summary

**@supabase/supabase-js installed, Supabase CLI linked to live project, singleton client typed with Database generic, placeholder types created, supabase-client test activated and green**

## Performance

- **Duration:** 20 min
- **Started:** 2026-03-06T00:10:00Z
- **Completed:** 2026-03-06T00:30:00Z
- **Tasks:** 1 auto (Task 1 was human-action, completed by user)
- **Files modified:** 7

## Accomplishments

- Installed @supabase/supabase-js and linked Supabase CLI to live project ref fuuvdcvbliijffogjnwg
- Created src/lib/supabase.ts as typed singleton using createClient<Database>() pattern
- Created src/types/database.types.ts placeholder with empty Database interface (ready for Plans 02-03 to populate)
- Added npm run db:types script for post-schema type regeneration
- Activated supabase-client test (removed it.skip, added vi.mock) — test passes using mock

## Task Commits

Each task was committed atomically:

1. **Task 1: Create Supabase project and retrieve credentials** - human action (user completed)
2. **Task 2: Install supabase-js, init CLI, link project, create client + types** - `20c66f3` (feat)

## Files Created/Modified

- `src/lib/supabase.ts` - Singleton Supabase client typed with Database generic, reads VITE_SUPABASE_* from env
- `src/types/database.types.ts` - TypeScript Database types placeholder (Json type + empty public schema)
- `supabase/config.toml` - Supabase CLI config with project_id = "jamo-v1", linked to fuuvdcvbliijffogjnwg
- `package.json` - Added @supabase/supabase-js dependency + db:types script
- `package-lock.json` - Updated lockfile
- `.gitignore` - Added supabase/.branches, supabase/.temp, .supabase entries
- `src/lib/__tests__/supabase-client.test.ts` - Activated test with vi.mock pattern

## Decisions Made

- Env vars are in `.env` (not `.env.local`) because that's the existing project pattern — both files are gitignored, Vite reads both
- Database types use a placeholder so `src/lib/supabase.ts` compiles now; real types generated after Plans 02-03 push schema via `npm run db:types`
- Test uses `vi.mock('../supabase')` returning the mock from `src/test/mocks/supabase` so unit tests never make real network calls

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed malformed shell command from .env**
- **Found during:** Task 2 (supabase link step)
- **Issue:** `.env` file contained a non-env-var line (`claude mcp add supabase -e ...`) that caused `supabase link` to fail with "unexpected character '-' in variable name"
- **Fix:** Moved the line to a comment in `.env` (prefixed with `#`) so the intent is preserved but env parsers skip it
- **Files modified:** `.env`
- **Verification:** `supabase link` completed successfully — "Finished supabase link."
- **Committed in:** `20c66f3` (Task 2 commit)

**2. [Rule 2 - Minor] Added Supabase local dev paths to .gitignore**
- **Found during:** Task 2 (after supabase init)
- **Issue:** `supabase init` creates local dev directories (.branches, .temp) that should not be committed
- **Fix:** Added `supabase/.branches`, `supabase/.temp`, `.supabase` to .gitignore
- **Files modified:** `.gitignore`
- **Verification:** Entries present in .gitignore
- **Committed in:** `20c66f3` (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing critical gitignore entries)
**Impact on plan:** Both auto-fixes necessary for task completion and clean repo state. No scope creep.

## Issues Encountered

- `.env` had malformed line from MCP setup notes — Supabase CLI env parser is stricter than Vite's, required fix before link could succeed

## Deferred Items

- Pre-existing TypeScript warning: `renderHook` declared but never read in `src/context/__tests__/proposals-context.test.ts` (unrelated to this plan)

## Next Phase Readiness

- `src/lib/supabase.ts` is ready to import in all subsequent plans
- Run `npm run db:types` after Plans 02 and 03 push schema to populate Database types with real table definitions
- `npm run test:run` green (1 passed, 2 skipped in unrelated stub tests)

---
## Self-Check: PASSED

- FOUND: src/lib/supabase.ts
- FOUND: src/types/database.types.ts
- FOUND: supabase/config.toml
- FOUND: 01-01-SUMMARY.md
- FOUND: commit 20c66f3 (feat(01-01))
- npm run test:run: 1 passed, 2 skipped (exit 0)

*Phase: 01-supabase-foundation*
*Completed: 2026-03-06*
