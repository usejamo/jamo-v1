# CONCERNS.md — Technical Debt, Issues, and Areas of Concern

## Summary

This is a React demo/prototype application. Most concerns stem from the demo nature of the codebase: hardcoded data, no persistence layer, no test coverage, and minimal error handling. These are expected tradeoffs for a prototype, but should be addressed before productionizing.

---

## Tech Debt

### TD-1: All State Is In-Memory (No Persistence)
- **Severity:** High (for production)
- **Location:** All context files in `src/context/`
- **Issue:** Proposals, archived items, deleted items all live in React state. Page refresh loses all data.
- **Impact:** Not viable for real users
- **Fix:** Add backend API or localStorage persistence layer

### TD-2: Hardcoded Demo/Seed Data Mixed Into Source
- **Severity:** Medium
- **Locations:**
  - `src/data/proposals.json` — seed proposals
  - `src/data/proposalDraftData.ts` — mock draft content
  - `src/data/demoCommands.ts` — fake AI commands
  - `src/data/documents.json` — static document fixtures
- **Issue:** Demo data is baked into the bundle. No way to separate prod/demo modes.
- **Fix:** Move demo data behind a feature flag or separate data-seeding layer

### TD-3: No Test Coverage
- **Severity:** High (for production)
- **Issue:** Zero tests exist. No framework installed.
- **Impact:** Regressions undetectable without manual testing
- **Fix:** Add Vitest + React Testing Library; prioritize context providers and lifecycle flows

### TD-4: No Path Aliases
- **Severity:** Low
- **Location:** `vite.config.js`, `tsconfig.json`
- **Issue:** All imports are relative (`../../context/ProposalsContext`). Deep imports become fragile.
- **Fix:** Add `@/` alias pointing to `src/`

### TD-5: Context Provider Nesting Depth
- **Severity:** Medium
- **Location:** `src/App.tsx:26-47`
- **Issue:** 5 nested context providers with no error boundaries. A throw in any provider crashes the entire app.
- **Fix:** Add `<ErrorBoundary>` wrappers around provider tree

---

## Known Bugs / Fragile Areas

### BUG-1: sessionStorage Draft State Has No Error Handling
- **Location:** `src/components/ProposalEditorModal.tsx` (draft persistence)
- **Symptom:** If sessionStorage is full or unavailable, silent failure
- **Fix:** Wrap sessionStorage calls in try/catch

### BUG-2: Direct DOM Access Without Null Checks
- **Location:** Components using `getElementById` or `querySelector`
- **Symptom:** Potential null reference errors if elements not in DOM
- **Fix:** Add null guards before DOM operations

### BUG-3: Settings Toggles Don't Persist
- **Location:** `src/pages/Settings.tsx`
- **Symptom:** Toggle state resets on navigation
- **Issue:** Toggles are local component state only
- **Fix:** Lift to context or persist to storage

### BUG-4: No Loading/Error States for Any Operation
- **Severity:** UX issue
- **Location:** All context providers
- **Issue:** No loading indicators or error feedback for any state mutation
- **Fix:** Add loading and error state to contexts

---

## Security Concerns

### SEC-1: No Authentication or Authorization
- **Severity:** High (for production)
- **Issue:** All routes are publicly accessible. No auth layer exists.
- **Fix:** Add auth provider (e.g., Clerk, Auth0, Supabase Auth) before any production deployment

### SEC-2: No Input Sanitization
- **Severity:** Medium
- **Location:** `ProposalEditorModal.tsx` form inputs
- **Issue:** User input is stored directly into state without sanitization
- **Risk:** If content is ever rendered as HTML, XSS is possible
- **Fix:** Sanitize inputs; avoid `dangerouslySetInnerHTML`

### SEC-3: Demo Data Includes Timestamps That Imply Real Usage
- **Severity:** Low
- **Location:** `src/data/proposals.json`
- **Issue:** Hardcoded dates may mislead users in a demo context

---

## Performance Concerns

### PERF-1: No Virtualization for Proposal Lists
- **Severity:** Medium (at scale)
- **Location:** `src/pages/ProposalsList.tsx`
- **Issue:** All proposals render into DOM simultaneously. At 100+ proposals, performance degrades.
- **Fix:** Add react-window or react-virtual

### PERF-2: Intersection Observers Without Memoization
- **Severity:** Low-Medium
- **Issue:** If Intersection Observers are created in render without `useMemo`/`useRef`, they recreate on every render
- **Fix:** Stabilize observer references with refs

### PERF-3: No Memoization on Context Values
- **Severity:** Medium
- **Location:** `src/context/*.tsx`
- **Issue:** Context values created inline trigger re-renders in all consumers on every provider render
- **Fix:** Wrap context values in `useMemo`

---

## Architecture Concerns

### ARCH-1: No API Layer Abstraction
- **Issue:** Data fetching patterns don't exist yet. When a backend is added, all data access will need to be retrofitted.
- **Fix:** Introduce a `src/services/` layer now, even if it returns static data

### ARCH-2: AI Integration Is All Mock/Demo
- **Location:** `src/data/demoCommands.ts`, `src/components/AIChatPanel.tsx`
- **Issue:** AI chat panel uses hardcoded demo responses — no real AI integration
- **Fix:** Replace demo commands with actual API calls when ready

### ARCH-3: Proposal Types May Be Incomplete
- **Location:** `src/types/proposal.ts`, `src/types/draft.ts`
- **Issue:** Types represent current demo data. Adding real features may require significant type evolution.
- **Recommendation:** Review types before adding persistence or API integration

---

## Priority Matrix

| Issue | Severity | Effort | Address Before Production? |
|-------|----------|--------|---------------------------|
| No persistence | High | High | Yes |
| No auth | High | High | Yes |
| No tests | High | Medium | Yes |
| Context error boundaries | Medium | Low | Yes |
| Settings don't persist | Medium | Low | Yes |
| No list virtualization | Medium | Medium | At scale |
| No input sanitization | Medium | Low | Yes |
| Context value memoization | Medium | Low | Yes |
| Path aliases | Low | Low | Optional |
| Demo data separation | Medium | Medium | Yes |
