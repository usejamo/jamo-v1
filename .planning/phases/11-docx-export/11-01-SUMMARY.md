---
phase: 11
plan: 01
subsystem: export
tags: [docx, export, utility, html-conversion]
dependency_graph:
  requires: []
  provides: [htmlToDocx, exportDocx]
  affects: [wave-2-react-wiring]
tech_stack:
  added: [docx@9.6.1]
  patterns: [DOMParser HTML walker, browser Blob download, placeholder sentinel pattern]
key_files:
  created:
    - src/lib/htmlToDocx.ts
    - src/lib/exportDocx.ts
  modified:
    - vite.config.js
    - package.json
decisions:
  - Used `Packer.toBlob()` (not `toBuffer`) — browser-only API, no Node.js buffer needed
  - Zero-row table guard returns empty Paragraph instead of `new Table({ rows: [] })` to avoid docx crash (GitHub issue #856)
  - `AlignmentType` imported in both files for numbering config alignment
metrics:
  duration: ~15m
  completed: 2026-04-29
---

# Phase 11 Plan 01: DOCX Export Utilities Summary

**One-liner:** Two pure-TypeScript DOCX utilities — DOMParser HTML walker (`htmlToDocx`) and DOCX orchestrator with placeholder guard (`exportDocx`) — using `docx@9.6.1` with Calibri font, bullet/numbered list config, and browser Blob download.

## What Was Built

- `src/lib/htmlToDocx.ts` — converts TipTap HTML to `docx` element arrays via DOMParser; handles h1/h2/h3, p, ul, ol, table, inline bold/italic/br, placeholder sentinels (force and blocked modes)
- `src/lib/exportDocx.ts` — orchestrates sections into a `docx.Document`, scans for placeholders, throws `ExportBlockedError` in blocked mode, prepends "Unresolved Placeholders" cover in force mode, triggers browser download via `Packer.toBlob()` + object URL anchor click
- `vite.config.js` — added `optimizeDeps.include: ['docx']` for cold-start pre-bundling

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install docx + vite config | (prior) | package.json, vite.config.js |
| 2 | Create htmlToDocx.ts | ab0e2a3 | src/lib/htmlToDocx.ts |
| 3 | Create exportDocx.ts | 8f3b154 | src/lib/exportDocx.ts |

## Deviations from Plan

None — plan executed exactly as written. The `AlignmentType` import was included in `exportDocx.ts` (used in the numbering config `levels[].alignment` field) matching the plan spec.

## Threat Mitigations Applied

- T-11-02: `slugify()` strips all non-alphanumeric chars — prevents path traversal or malicious filename characters
- T-11-04: `URL.revokeObjectURL()` called immediately after `.click()` — object URL invalidated after use

## Known Stubs

None — no hardcoded empty values or placeholder text that flows to UI. Wave 2 wiring (React component) not yet created, but that is the next plan.

## Self-Check

- [x] `src/lib/htmlToDocx.ts` exists and exports `PlaceholderSentinel`, `scanForPlaceholders`, `htmlToDocxChildren`
- [x] `src/lib/exportDocx.ts` exists and exports `ExportSection`, `ExportBlockedError`, `slugify`, `exportDocx`
- [x] `npm run build` exits 0 (600 modules transformed, no TS errors)
- [x] Commits ab0e2a3 and 8f3b154 exist in worktree history

## Self-Check: PASSED
