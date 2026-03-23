---
phase: 5
slug: proposal-creation-wizard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.4 |
| **Config file** | vite.config.ts |
| **Quick run command** | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/components/__tests__/ProposalWizard.test.tsx`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 0 | REQ-1.1 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | REQ-1.1 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-02-02 | 02 | 1 | REQ-1.2 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-02-03 | 02 | 1 | REQ-1.3 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-02-04 | 02 | 1 | REQ-1.4 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-03-01 | 03 | 1 | REQ-1.5 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-03-02 | 03 | 1 | REQ-1.6 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-04-01 | 04 | 2 | REQ-1.7 | unit | `npx vitest run src/components/__tests__/ProposalWizard.test.tsx` | ❌ W0 | ⬜ pending |
| 5-04-02 | 04 | 2 | REQ-9.4 | manual | — | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/__tests__/ProposalWizard.test.tsx` — stubs for REQ-1.1 through REQ-1.7, REQ-9.4

*Existing infrastructure (vitest + jsdom) covers all phase requirements — no new installs needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wizard preserves existing modal animation and visual design | REQ-9.4 | Visual/animation fidelity cannot be asserted in jsdom | Open app, create new proposal via wizard, verify slide-in animation matches the old ProposalEditorModal behavior |
| sessionStorage persistence across refresh | REQ-1.7 | Browser refresh simulation is unreliable in jsdom | Open wizard, fill Step 1, refresh page, verify form data is restored |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
