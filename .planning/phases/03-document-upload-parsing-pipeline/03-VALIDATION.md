---
phase: 3
slug: document-upload-parsing-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npm run test:run` |
| **Full suite command** | `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run` |
| **Estimated runtime** | ~15 seconds (quick), ~25 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run `npm run test:run`
- **After every plan wave:** Run `NODE_OPTIONS="--max-old-space-size=4096" npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | REQ-2.1 | unit | `npm run test:run` | ⬜ W0 | ⬜ pending |
| 03-01-02 | 01 | 1 | REQ-2.8 | integration | `npm run test:run` | ⬜ W0 | ⬜ pending |
| 03-02-01 | 02 | 1 | REQ-2.1 | integration | `npm run test:run` | ✅ | ⬜ pending |
| 03-03-01 | 03 | 2 | REQ-2.2 | unit | Edge Function test | ❌ W0 | ⬜ pending |
| 03-04-01 | 04 | 2 | REQ-2.2, 2.3, 2.4, 2.5 | integration | Edge Function test | ❌ W0 | ⬜ pending |
| 03-04-02 | 04 | 2 | REQ-2.6, 2.7 | integration | `npm run test:run` | ⬜ W0 | ⬜ pending |
| 03-05-01 | 05 | 2 | REQ-2.8 | integration | `npm run test:run` | ⬜ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

**UI Component Tests:**
- [ ] `src/components/__tests__/FileUpload.test.tsx` — Upload component rendering, drag-drop, file selection
- [ ] `src/components/__tests__/DocumentList.test.tsx` — Document list display, status indicators

**Edge Function Tests:**
- [ ] `supabase/functions/extract-document/test.ts` — Test harness for PDF/DOCX/XLSX/TXT extraction
- [ ] `supabase/functions/extract-document/fixtures/` — Test files (test-rfp.pdf, test-protocol.docx, test-budget.xlsx, corrupt.pdf)

**Integration Tests:**
- [ ] `src/lib/__tests__/document-upload.integration.test.ts` — Upload → Storage → RLS → Edge Function → DB flow

**Test Infrastructure:**
- Existing vitest config covers Phase 3 (no additional framework needed)
- Supabase Edge Function testing may require local Deno test runner

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Drag-and-drop visual feedback | REQ-2.1 | UI/UX visual verification | 1. Drag file over upload area<br>2. Verify hover state appears<br>3. Drop file, verify upload starts |
| File type icon display | REQ-2.7 | Visual correctness | 1. Upload PDF, DOCX, XLSX<br>2. Verify correct icon shows for each type |
| Extraction progress indicator | REQ-2.8 | Real-time UI updates | 1. Upload large PDF<br>2. Watch status change: uploading → extracting → complete<br>3. Verify timing is reasonable (<30s for 5MB PDF) |
| Error message clarity | REQ-2.8 | UX copy quality | 1. Upload corrupt PDF<br>2. Verify error message is user-friendly (not technical stack trace) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
