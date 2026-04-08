---
phase: 8
slug: section-workspace-rich-text-editor
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` (or `vite.config.ts` test block) |
| **Quick run command** | `npm run test -- --run` |
| **Full suite command** | `npm run test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run`
- **After every plan wave:** Run `npm run test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 0 | REQ-5.1 | unit | `npm run test -- --run src/components/editor` | ❌ W0 | ⬜ pending |
| 8-01-02 | 01 | 0 | REQ-5.1 | migration | `npm run test -- --run` | ❌ W0 | ⬜ pending |
| 8-02-01 | 02 | 1 | REQ-5.1 | unit | `npm run test -- --run src/components/editor/SectionEditor` | ❌ W0 | ⬜ pending |
| 8-02-02 | 02 | 1 | REQ-5.2 | unit | `npm run test -- --run src/components/editor/SectionToolbar` | ❌ W0 | ⬜ pending |
| 8-03-01 | 03 | 2 | REQ-5.3 | unit | `npm run test -- --run src/components/editor/LockToggle` | ❌ W0 | ⬜ pending |
| 8-03-02 | 03 | 2 | REQ-5.4 | unit | `npm run test -- --run src/components/editor/VersionHistory` | ❌ W0 | ⬜ pending |
| 8-04-01 | 04 | 2 | REQ-5.5 | unit | `npm run test -- --run src/components/editor/SectionNav` | ❌ W0 | ⬜ pending |
| 8-04-02 | 04 | 3 | REQ-5.6 | unit | `npm run test -- --run src/components/editor/ComplianceFlags` | ❌ W0 | ⬜ pending |
| 8-05-01 | 05 | 3 | REQ-5.7 | unit | `npm run test -- --run src/components/editor/ConsistencyCheck` | ❌ W0 | ⬜ pending |
| 8-05-02 | 05 | 3 | REQ-5.8 | unit | `npm run test -- --run src/components/editor` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Install TipTap v3 packages: `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`
- [ ] Supabase migration: create `proposal_section_versions` table
- [ ] Supabase migration: add `last_saved_content` column to `proposal_sections`
- [ ] Test stub files in `src/components/editor/__tests__/` for each major component
- [ ] Verify vitest config handles TipTap DOM requirements (happy-dom or jsdom)

*Existing vitest infrastructure covers project — only stubs and migrations are new.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| TipTap editor renders and accepts keyboard input | REQ-5.1 | DOM interaction requires real browser | Open proposal, click section, type text, verify it appears |
| AI content injection updates editor without cursor jump | REQ-5.8 | Real streaming behavior hard to mock | Trigger Generate, watch content stream into TipTap editor |
| Cross-section consistency check UI | REQ-5.7 | Requires full proposal state + Edge Function call | Complete all sections, trigger consistency check, verify banner appears |
| Version history restore overwrites editor content | REQ-5.4 | Requires Supabase + TipTap integration | Save 2 versions, restore v1, verify editor shows v1 content |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
