---
phase: 04-regulatory-knowledge-base-rag
plan: "02"
subsystem: regulatory-ingestion
tags: [chunker, embeddings, cli, tdd, deno, tiktoken]
dependency_graph:
  requires:
    - 04-00 (stub scaffolding)
    - 04-01 (chunks table migration)
  provides:
    - src/lib/chunker.ts (chunkDocument function)
    - scripts/ingest-regulatory.ts (CLI seeder)
    - embedBatch (testable export)
  affects:
    - 04-03 (retrieve-context Edge Function — imports chunker pattern)
tech_stack:
  added:
    - js-tiktoken (cl100k_base BPE token counting)
  patterns:
    - TDD (RED/GREEN) for chunker module
    - denoSpecifierStubPlugin in vitest.config.ts for jsr:/npm: compat
    - Deno CLI with import.meta.main guard for Vitest isolation
key_files:
  created:
    - src/lib/chunker.ts
    - scripts/ingest-regulatory.ts
    - regulatory-docs/ICH/.gitkeep
    - regulatory-docs/FDA/.gitkeep
    - regulatory-docs/EMA/.gitkeep
    - regulatory-docs/README.txt
  modified:
    - src/lib/chunker.test.ts (stubs -> real tests)
    - scripts/ingest.test.ts (stubs -> real tests)
    - vitest.config.ts (denoSpecifierStubPlugin added)
decisions:
  - "js-tiktoken exports getEncoding (camelCase), not get_encoding — corrected from plan spec"
  - "vitest.config.ts denoSpecifierStubPlugin stubs jsr:/npm: specifiers — vite-ignore comments alone insufficient"
  - "Test data for section-split test requires >=400 tokens per section to avoid merge; test updated accordingly"
metrics:
  duration: "~12 minutes"
  completed_date: "2026-03-20"
  tasks_completed: 2
  files_created: 9
  files_modified: 3
  tests_added: 7
  test_result: "47/47 passing"
---

# Phase 04 Plan 02: Regulatory Ingestion Pipeline Summary

Built the regulatory document ingestion pipeline: a chunker module (importable by both Node/Vitest and Deno) and a Deno CLI script that processes PDFs from `/regulatory-docs`, embeds them via OpenAI text-embedding-3-small, and seeds the chunks table.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Build chunker module with TDD | 1b4bc85 | src/lib/chunker.ts, src/lib/chunker.test.ts |
| 2 | Build CLI ingestion script and regulatory-docs directory | 4f6e24d | scripts/ingest-regulatory.ts, scripts/ingest.test.ts, regulatory-docs/*, vitest.config.ts |

## What Was Built

**src/lib/chunker.ts** — `chunkDocument(text, source): Chunk[]`
- Splits regulatory text at section heading boundaries (regex: `/^(\d+\.[\d.]*)\s+\S/m`)
- Segments under 400 tokens merge with the next segment
- Segments over 600 tokens get sliding-window chunking with ~100-token overlap
- Token counting via js-tiktoken cl100k_base (matches text-embedding-3-small)
- Exports: `chunkDocument`, `Chunk` interface

**scripts/ingest-regulatory.ts** — Deno CLI seeder
- `--org-id`, `--agency`, `--dir` required flags; `--dry-run`, `--therapeutic-area` optional
- Walks PDF files recursively; extracts text via pdf-parse; chunks via chunkDocument
- `embedBatch(texts, openai)` exported for testing: batches at 100, asserts 1536-dim, exponential backoff on 429 (1s/2s/4s)
- Bulk inserts into chunks table via Supabase service-role client (bypasses RLS)
- `import.meta.main` guard ensures CLI code never runs under Vitest

**regulatory-docs/** directory
- ICH/, FDA/, EMA/ subdirectories with .gitkeep and README.txt instructions

## Deviations from Plan

**1. [Rule 1 - Bug] js-tiktoken export name correction**
- Found during: Task 1 (GREEN phase)
- Issue: Plan spec referenced `get_encoding` (snake_case) but the npm package exports `getEncoding` (camelCase)
- Fix: Updated import in chunker.ts to `import { getEncoding } from 'js-tiktoken'`
- Files modified: src/lib/chunker.ts
- Commit: 1b4bc85

**2. [Rule 1 - Bug] Test data too small for section-split test**
- Found during: Task 1 (GREEN phase — 3/4 pass)
- Issue: Test used 5 repetitions of a short sentence per section (~40 tokens), below MIN_TOKENS=400, causing both sections to merge into one chunk. Test expected 2 chunks.
- Fix: Updated test data to 30 repetitions per section (~420 tokens each) so both sections remain separate
- Files modified: src/lib/chunker.test.ts
- Commit: 1b4bc85

**3. [Rule 3 - Blocking] `@vite-ignore` insufficient for jsr:/npm: specifiers**
- Found during: Task 2 (ingest test run)
- Issue: Vite resolves all dynamic `import()` calls at transform time even with `@vite-ignore`; `jsr:` and `npm:` specifiers caused transform failure
- Fix: Added `denoSpecifierStubPlugin()` to vitest.config.ts — intercepts `jsr:` and `npm:` specifiers and returns empty stubs so Vitest can import the script without executing Deno-only code
- Files modified: vitest.config.ts
- Commit: 4f6e24d

## Self-Check: PASSED

- src/lib/chunker.ts: FOUND
- scripts/ingest-regulatory.ts: FOUND
- regulatory-docs/ICH/.gitkeep: FOUND
- Commit 1b4bc85: FOUND
- Commit 4f6e24d: FOUND
