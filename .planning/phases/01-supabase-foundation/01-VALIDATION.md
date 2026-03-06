---
phase: 1
slug: supabase-foundation
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-05
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (already in project via Vite) |
| **Config file** | `vitest.config.ts` — Wave 0 installs |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `npm run test:run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run`
- **After every plan wave:** Run `npm run test:run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 1-01-01 | 01 | 0 | REQ-7.1 | unit | `npm run test:run -- supabase-client` | ⬜ pending |
| 1-01-02 | 01 | 1 | REQ-7.1 | integration | manual — verify Supabase dashboard shows connected | ⬜ pending |
| 1-02-01 | 02 | 2 | REQ-7.2 | integration | manual — `supabase db diff` shows 0 drift | ⬜ pending |
| 1-02-02 | 02 | 2 | REQ-7.3 | unit | `npm run test:run -- rls-policies` | ⬜ pending |
| 1-02-03 | 02 | 2 | REQ-7.4 | unit | `npm run test:run -- schema` | ⬜ pending |
| 1-03-01 | 03 | 2 | REQ-7.5 | integration | manual — upload file, verify only org path accessible | ⬜ pending |
| 1-03-02 | 03 | 2 | REQ-7.6 | unit | `npm run test:run -- pgvector` | ⬜ pending |
| 1-04-01 | 04 | 3 | REQ-7.9 | unit | `npm run test:run -- usage-tracking` | ⬜ pending |
| 1-04-02 | 04 | 3 | REQ-7.10 | unit | `npm run test:run -- feature-flags` | ⬜ pending |
| 1-05-01 | 05 | 3 | REQ-7.1 | unit | `npm run test:run -- proposals-context` | ⬜ pending |
| 1-05-02 | 05 | 3 | REQ-7.1 | unit | `npm run test:run -- deleted-context` | ⬜ pending |
| 1-05-03 | 05 | 3 | REQ-7.1 | unit | `npm run test:run -- archived-context` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `vitest.config.ts` — configure vitest for React + TypeScript
- [x] `src/test/setup.ts` — vitest setup file (jsdom environment, mocks)
- [x] `src/test/mocks/supabase.ts` — Supabase client mock for unit tests
- [x] `src/lib/__tests__/supabase-client.test.ts` — stub for REQ-7.1 client singleton
- [x] `src/context/__tests__/proposals-context.test.ts` — stub for Supabase-backed context
- [x] `package.json` scripts — add `test:run` and `test:watch` scripts

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| RLS org isolation | REQ-7.3 | Requires two real Supabase sessions | Create two orgs, insert a proposal under org A, verify org B's service key cannot SELECT it |
| Storage bucket RLS | REQ-7.5 | Requires live Supabase Storage | Upload file to `documents/org-a-id/test.pdf`, attempt access with org B token — should 403 |
| pgvector HNSW index active | REQ-7.6 | Requires `EXPLAIN ANALYZE` on live DB | Run `EXPLAIN ANALYZE SELECT * FROM regulatory_chunks ORDER BY embedding <=> '[...]' LIMIT 5` — verify `Index Scan using ... hnsw` |
| Supabase Realtime working | REQ-7.1 | Requires live subscription test | Open two browser tabs, create proposal in tab 1, verify tab 2 updates within 2s |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
