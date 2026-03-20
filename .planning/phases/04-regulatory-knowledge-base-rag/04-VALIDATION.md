---
phase: 4
slug: regulatory-knowledge-base-rag
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-20
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.0.4 |
| **Config file** | `vite.config.ts` (vitest config inline) |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run`
- **After every plan wave:** Run `npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 4-xx-01 | chunker | 1 | REQ-7.8 | unit | `npm run test:run -- src/lib/chunker.test.ts` | ❌ W0 | ⬜ pending |
| 4-xx-02 | ingest | 1 | REQ-7.8 | unit (mock OpenAI) | `npm run test:run -- scripts/ingest.test.ts` | ❌ W0 | ⬜ pending |
| 4-xx-03 | retrieve-context | 2 | REQ-4.9 | integration (Deno) | `deno test supabase/functions/retrieve-context/test.ts` | ❌ W0 | ⬜ pending |
| 4-xx-04 | hybrid merge | 2 | REQ-4.9 | unit | `npm run test:run -- src/lib/retrieval.test.ts` | ❌ W0 | ⬜ pending |
| 4-xx-05 | doc ingestion | 3 | REQ-7.7 | smoke (manual) | CLI `--dry-run` + DB count check | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/chunker.test.ts` — stubs for REQ-7.8 chunking logic (section-boundary splits, 400–600 tokens, 100-token overlap)
- [ ] `src/lib/retrieval.test.ts` — stubs for REQ-4.9 hybrid merge and 70/30 score weighting
- [ ] `scripts/ingest.test.ts` — stubs for REQ-7.8 embedding batch (1536-dimension vector assertions, mock OpenAI)
- [ ] `supabase/functions/retrieve-context/test.ts` — stubs for REQ-4.9 Edge Function top-K retrieval

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Regulatory docs present in chunks table after ingestion | REQ-7.7 | Requires real regulatory PDF files and live Supabase connection | Run CLI with `--dry-run`, then run with real docs and check `SELECT count(*) FROM chunks WHERE doc_type = 'regulatory'` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
