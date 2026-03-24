---
phase: 6
slug: ai-assumption-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vite.config.ts |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test -- --run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run`
- **After every plan wave:** Run `npm test -- --run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 0 | REQ-3.1 | unit | `npm test -- --run src/tests/extract-assumptions.test.ts` | ❌ W0 | ⬜ pending |
| 6-01-02 | 01 | 1 | REQ-3.1 | integration | `npm test -- --run` | ❌ W0 | ⬜ pending |
| 6-02-01 | 02 | 1 | REQ-3.2 | unit | `npm test -- --run src/tests/AssumptionCard.test.tsx` | ❌ W0 | ⬜ pending |
| 6-02-02 | 02 | 1 | REQ-3.3 | unit | `npm test -- --run src/tests/AssumptionCard.test.tsx` | ❌ W0 | ⬜ pending |
| 6-02-03 | 02 | 1 | REQ-3.4 | unit | `npm test -- --run src/tests/AssumptionCard.test.tsx` | ❌ W0 | ⬜ pending |
| 6-03-01 | 03 | 2 | REQ-3.5 | unit | `npm test -- --run src/tests/wizard-step3.test.tsx` | ❌ W0 | ⬜ pending |
| 6-03-02 | 03 | 2 | REQ-3.6 | unit | `npm test -- --run src/tests/wizard-step3.test.tsx` | ❌ W0 | ⬜ pending |
| 6-04-01 | 04 | 2 | REQ-3.7 | unit | `npm test -- --run src/tests/proposal-assumptions.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/tests/extract-assumptions.test.ts` — stubs for REQ-3.1 (edge function input/output shape)
- [ ] `src/tests/AssumptionCard.test.tsx` — stubs for REQ-3.2–3.4 (card UI interactions)
- [ ] `src/tests/wizard-step3.test.tsx` — stubs for REQ-3.5–3.6 (wizard step integration)
- [ ] `src/tests/proposal-assumptions.test.ts` — stubs for REQ-3.7 (DB persist and serialize)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Extraction quality from real PDF text | REQ-3.1 | Requires live Anthropic API + real document content | Upload a sample CRO proposal PDF, trigger extraction, review returned assumptions for relevance and accuracy |
| Confidence badge visual accuracy | REQ-3.2 | Visual regression; badge color/text tied to CSS classes | Inspect rendered cards at high/medium/low confidence levels in browser |
| Missing info fill-in prompts UX | REQ-3.6 | UX judgment call | Verify missing fields show clear prompts and can be filled in naturally |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
