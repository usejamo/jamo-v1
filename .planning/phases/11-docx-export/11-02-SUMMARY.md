---
phase: 11
plan: "02"
subsystem: export
tags: [docx, export, modal, ui]
dependency_graph:
  requires: [11-01]
  provides: [export-ui, export-blocked-modal]
  affects: [ProposalDetail]
tech_stack:
  added: [docx@npm]
  patterns: [error-boundary-catch, modal-overlay, prop-drilling]
key_files:
  created:
    - src/components/ExportBlockedModal.tsx
  modified:
    - src/pages/ProposalDetail.tsx
    - vite.config.js
    - package.json
decisions:
  - "ExportDropdown takes sections+proposalTitle as props; no context hook to avoid cross-proposal data access"
  - "Force export de-emphasized as plain text link per plan spec"
  - "docx installed into root package.json; optimizeDeps.include ensures Vite pre-bundles it"
metrics:
  duration: "~20 min"
  completed: "2026-04-29"
  tasks_completed: 2
  tasks_total: 2
---

# Phase 11 Plan 02: Wire ExportDropdown to exportDocx — SUMMARY

## One-liner

ExportDropdown wired to real exportDocx with ExportBlockedModal placeholder-blocking UX and force-export escape hatch.

## What Was Built

- `ExportBlockedModal` component: modal overlay grouping unresolved placeholders by section, "Resolve →" dismiss links, de-emphasized "Force export anyway" text link, Cancel button
- `ProposalDetail.tsx` ExportDropdown: replaced stub handler with real `exportDocx()` call; catches `ExportBlockedError` to open modal; `handleForceExport` calls `exportDocx({ force: true })`; removed "Export to PowerPoint" item; call site passes `sections={proposalSections}` and `proposalTitle={proposal?.title ?? ''}`
- `vite.config.js`: removed broken `resolve.modules` block (not supported in Vite 7/Rollup); kept `optimizeDeps.include: ['docx']`
- `docx` npm package installed (was missing from project)

## Tasks

| # | Name | Status | Commit |
|---|------|--------|--------|
| 1 | Create ExportBlockedModal | Done | 181f98e |
| 2 | Wire ExportDropdown + vite fix + install docx | Done | c185263 |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vite.config.js resolve.modules not supported in Vite 7**
- **Found during:** Task 2 build verification
- **Issue:** `resolve.modules` is a webpack concept; Vite 7/Rollup ignores it silently during dev but fails production build with "failed to resolve import docx"
- **Fix:** Removed `resolve.modules` block and unused `path`/`fileURLToPath` imports; kept `optimizeDeps.include: ['docx']` which is the correct Vite mechanism
- **Files modified:** `vite.config.js`
- **Commit:** c185263

**2. [Rule 3 - Blocking] docx package not installed**
- **Found during:** Task 2 build verification (`npm run build` failed — Rollup could not resolve "docx")
- **Issue:** `docx` was referenced in `src/lib/exportDocx.ts` but not present in `node_modules`
- **Fix:** Ran `npm install docx` in project root
- **Files modified:** `package.json`, `package-lock.json`
- **Commit:** c185263 (package.json change included in same commit via worktree shared node_modules)

## Known Stubs

None. Export wiring is fully functional end-to-end.

## Self-Check

- [x] `src/components/ExportBlockedModal.tsx` — created, commit 181f98e
- [x] `src/pages/ProposalDetail.tsx` — modified, commit c185263
- [x] `vite.config.js` — fixed, commit c185263
- [x] `npm run build` exits 0

## Self-Check: PASSED
