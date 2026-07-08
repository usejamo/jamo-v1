---
created: 2026-07-08T05:19:11.009Z
title: Complete the RAG loop — 0 chunks despite 35 extracted docs
area: general
files:
  - supabase/functions/retrieve-context/index.ts
  - supabase/functions/extract-document/index.ts
  - "public.chunks (empty), public.document_extracts (35), public.proposal_documents (35)"
---

## Problem

RAG retrieval is deployed and healthy but returns nothing because the vector store is empty.
Confirmed live during Phase 14.3-05 verification (2026-07-07):

- `public.chunks` has **0 rows project-wide** (both `doc_type='regulatory'` and `'proposal'`).
- Yet `proposal_documents` = 35 and `document_extracts` = 35 (only 1 org has docs, `…0001`).
- So documents were uploaded AND extracted, but the **extract → chunk → embed** step never
  populated `chunks`. The pipeline stops after extraction.
- `retrieve-context` itself works: user-path probe (usera JWT + own org `…0001`) returns HTTP 200
  with a well-formed `{regulatoryChunks:[], proposalChunks:[], systemPromptBlock, retrievalMeta}`
  — embedding + `match_chunks_vector` RPC run, they just find nothing.

Net effect: chat-with-jamo's `answer_with_citations` / RAG context is always empty, and the
14.3 internal-RAG check could only prove the pipeline is *wired*, not that it *returns chunks*.

## Solution

TBD — investigation first:
1. Find where chunking + embedding is supposed to happen (an edge function, a DB trigger, or a
   client hook). Candidates: `extract-document`, a dedicated embed/ingest function, or the
   regulatory-KB ingestion path (Phase 04 `regulatory-knowledge-base-rag`).
2. Determine why 0 chunks exist: step is broken / never deployed (cf. the 14.3 "committed-not-
   deployed" pattern) / never triggered / writes to a table that no longer exists.
3. Fix it, then **backfill**: re-run chunk+embed over the 35 existing `document_extracts` and the
   regulatory KB.
4. Verify end-to-end: re-run the `retrieve-context` user-path probe (POST `/functions/v1/
   retrieve-context` with body `{orgId:'…0001', query:'clinical trial safety monitoring'}` using
   usera's JWT + anon apikey) and confirm **non-zero** `regulatoryChunks` / `proposalChunks`.

Note: `chunks` columns = id, org_id, doc_type, source, content, embedding, agency,
guideline_type, therapeutic_area, search_vector, metadata, created_at. Embedding model in
retrieve-context = OpenAI `text-embedding-3-small`.
