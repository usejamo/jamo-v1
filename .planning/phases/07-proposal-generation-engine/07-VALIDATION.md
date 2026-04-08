---
phase: 7
slug: proposal-generation-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.4 (client) + Deno built-in (Edge Functions) |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run`
- **After every plan wave:** Run `npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | REQ-4.2, 4.3, 4.6, 4.7, 4.8, 4.9 | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ W0 | ⬜ pending |
| 7-01-02 | 01 | 0 | REQ-4.5 | unit | `deno test supabase/functions/generate-proposal-section/test.ts` | ❌ W0 | ⬜ pending |
| 7-01-03 | 01 | 0 | UI card status | unit | `npm run test:run -- src/components/SectionStreamCard.test.tsx` | ❌ W0 | ⬜ pending |
| 7-02-01 | 02 | 1 | REQ-4.1, REQ-4.4, REQ-4.5 | unit+manual | `npm run test:run` | ❌ W0 | ⬜ pending |
| 7-03-01 | 03 | 1 | REQ-4.2, REQ-4.3, REQ-4.7 | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ W0 | ⬜ pending |
| 7-04-01 | 04 | 2 | REQ-4.6 | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ W0 | ⬜ pending |
| 7-05-01 | 05 | 2 | REQ-4.8, REQ-4.9 | unit | `npm run test:run -- src/hooks/useProposalGeneration.test.ts` | ❌ W0 | ⬜ pending |
| 7-06-01 | 06 | 3 | REQ-4.10 | manual | manual smoke test | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/hooks/useProposalGeneration.test.ts` — stubs for REQ-4.2, 4.3, 4.6, 4.7, 4.8, 4.9
- [ ] `supabase/functions/generate-proposal-section/test.ts` — stubs for REQ-4.5 (writeSection helper + payload parsing)
- [ ] `src/components/SectionStreamCard.test.tsx` — stubs for streaming card status display
- [ ] `src/types/generation.ts` — SectionStatus, GenerationState type contracts (not a test file, but required by Wave 0 tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SSE tokens arrive incrementally (not buffered) | REQ-4.4 | Requires live Edge Function + Anthropic API; cannot mock stream timing in unit tests | Open proposal in browser, trigger generation, observe character-by-character text appearing in streaming card |
| `[PLACEHOLDER: ...]` markers preserved in output | REQ-4.10 | Requires live Anthropic response with intentional placeholders; content depends on prompt adherence | Trigger generation for a section with known missing fields; verify output contains `[PLACEHOLDER: ...]` format strings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
