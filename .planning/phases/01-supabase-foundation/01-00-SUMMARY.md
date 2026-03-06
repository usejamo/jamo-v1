---
phase: 01-supabase-foundation
plan: "00"
subsystem: testing
tags: [vitest, testing-library, jsdom, react-testing, supabase-mock]

# Dependency graph
requires: []
provides:
  - "vitest configured with jsdom environment and @testing-library/react"
  - "Supabase client mock (chainable, all methods vi.fn()) at src/test/mocks/supabase.ts"
  - "npm run test:run exits 0 in under 15 seconds"
  - "Stub test files (RED/skipped) ready to be enabled in Plans 01-01 and 01-04"
affects: [01-01, 01-02, 01-03, 01-04, 01-05]

# Tech tracking
tech-stack:
  added: [vitest, "@vitest/coverage-v8", jsdom, "@testing-library/react", "@testing-library/jest-dom", "@testing-library/user-event"]
  patterns:
    - "vi.mock for Supabase client — import mock from src/test/mocks/supabase.ts"
    - "it.skip for stub tests that target files not yet created"
    - "Chainable mock query builder using vi.fn().mockReturnThis()"

key-files:
  created:
    - vitest.config.ts
    - src/test/setup.ts
    - src/test/mocks/supabase.ts
    - src/lib/__tests__/supabase-client.test.ts
    - src/context/__tests__/proposals-context.test.ts
  modified:
    - package.json

key-decisions:
  - "Used it.skip instead of failing stubs to keep test:run green before implementation files exist — avoids Vite import resolution errors on non-existent modules"
  - "Removed dynamic import() inside it.skip (Vite resolves all imports at transform time, even inside skipped tests) — stub imports mock directly"
  - "No --coverage on test:run to keep runtime under 15 seconds per VALIDATION.md"

patterns-established:
  - "Test mock pattern: import { supabase } from '../../test/mocks/supabase' for chainable query builder"
  - "All future test files use vi.mock to swap src/lib/supabase with the mock"

requirements-completed: [REQ-7.1]

# Metrics
duration: 8min
completed: 2026-03-05
---

# Phase 01 Plan 00: Test Infrastructure Summary

**Vitest + jsdom + @testing-library wired with a chainable Supabase mock and skipped stub tests — `npm run test:run` exits 0 in 1.28s**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-05T23:49:20Z
- **Completed:** 2026-03-05T23:57:20Z
- **Tasks:** 3
- **Files modified:** 6

## Accomplishments
- Installed vitest, @vitest/coverage-v8, jsdom, @testing-library/react/jest-dom/user-event as devDependencies
- Created vitest.config.ts with jsdom environment, globals, and setupFiles wired to src/test/setup.ts
- Built chainable Supabase mock at src/test/mocks/supabase.ts covering .from(), .auth, and .storage
- Created two stub test files with it.skip — ready to be enabled in Plans 01-01 and 01-04

## Task Commits

Each task was committed atomically:

1. **Task 1: Install vitest + testing-library and wire package.json scripts** - `859162c` (chore)
2. **Task 2: Create vitest.config.ts, setup file, and Supabase mock** - `f58ed50` (chore)
3. **Task 3: Create stub test files (skipped state)** - `9eee282` (test)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `package.json` - Added test:run and test:watch scripts, new devDependencies
- `vitest.config.ts` - jsdom environment, globals: true, setupFiles: ['./src/test/setup.ts']
- `src/test/setup.ts` - Imports @testing-library/jest-dom matchers globally
- `src/test/mocks/supabase.ts` - Chainable mock: from/select/insert/update/delete/eq/is/order/single/then + auth + storage
- `src/lib/__tests__/supabase-client.test.ts` - Stub (1 skipped test) for Supabase singleton
- `src/context/__tests__/proposals-context.test.ts` - Stub (2 skipped tests) for ProposalsContext

## Decisions Made
- Used `it.skip` instead of pending/failing tests: Vite's import analysis resolves all imports at transform time, so even code inside `it.skip` blocks triggers "file not found" errors if the target doesn't exist yet. Using the mock directly in stub tests avoids this.
- Removed `--coverage` from `test:run` to keep runs under 15 seconds.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed Vite import resolution error in supabase-client stub test**
- **Found during:** Task 3 (stub test file creation)
- **Issue:** The plan's stub used `await import('../supabase')` inside `it.skip`. Vite's import analysis plugin tries to resolve ALL imports at transform time — even those inside skipped tests — resulting in "Failed to resolve import '../supabase'" error that failed the test suite.
- **Fix:** Replaced the dynamic import of the non-existent `../supabase` module with a direct import from `../../test/mocks/supabase`. The skip comment explains it will test the real singleton once Plan 01-01 creates the file.
- **Files modified:** src/lib/__tests__/supabase-client.test.ts
- **Verification:** `npm run test:run` exits 0, 3 skipped, 1.28s
- **Committed in:** 9eee282 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug in plan's code sample)
**Impact on plan:** Fix was necessary for correctness. The stub test still serves its purpose — skipped, referencing the mock, ready to be updated when Plan 01-01 creates src/lib/supabase.ts.

## Issues Encountered
- Vite resolves imports at transform time regardless of whether the enclosing test is skipped — a subtle difference from Jest's lazy evaluation. Handled via Rule 1 auto-fix.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Test infrastructure is fully operational
- `npm run test:run` can be run after every task in Plans 01-01 through 01-05
- Stub tests in src/lib/__tests__/supabase-client.test.ts and src/context/__tests__/proposals-context.test.ts need their `it.skip` changed to `it` once the real implementations exist
- No blockers

---
*Phase: 01-supabase-foundation*
*Completed: 2026-03-05*
