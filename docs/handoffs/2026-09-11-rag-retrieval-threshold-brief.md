# RAG retrieval returns nothing for natural-language questions — external review brief

**Date:** 2026-09-11
**Status:** diagnosed, not fixed. Seeking a recommendation before changing anything.
**Audience:** external reviewer with no access to this repo. Everything needed is inline.

---

## 1. What the system is

Jamo is a CRO proposal-writing tool. Users upload an RFP and supporting documents for a
proposal; the documents are chunked and embedded into a `chunks` table. Two consumers
retrieve from it:

- **Generation** — drafts proposal sections.
- **Chat sidebar** — a Claude-powered assistant answering questions about the proposal
  and proposing edits.

Both call one Supabase edge function, `retrieve-context`, which does hybrid retrieval
(pgvector + Postgres full-text search) over two corpora: **regulatory** (ICH guidance
PDFs) and **proposal** (the org's own proposal documents).

## 2. The symptom

The chat sidebar cannot answer questions whose answers are demonstrably in the
proposal's own uploaded documents.

Concrete, reproduced against production:

- Proposal `4014dbff` ("Vericel BioPharma — Stage 4 pancreatic cancer"), a `draft`,
  has **14 own chunks, all embedded**.
- Its RFP chunk contains verbatim: `RFP Reference: VBP-2025-ADVANCE-301`.
- Asked *"What is the RFP reference number for this study, and which EDC system does
  the sponsor say they prefer?"*, the deployed assistant replied:

  > "There is no RFP reference number mentioned anywhere in the available proposal
  > documents or approved assumptions — it has not been provided."

- `retrieve-context` for that query returned:
  ```json
  {"regulatoryChunks":[],"proposalChunks":[],
   "retrievalMeta":{"regulatoryCount":0,"proposalCount":0,
                    "belowThreshold":true,"regulatoryRelaxationLevel":2}}
  ```

Note `regulatoryCount: 0` even at relaxation level 2 — the regulatory corpus (5 ICH
documents, seeded and present) also returns nothing. So this is not proposal-specific.

**This is a separate defect from one already fixed today.** A prior bug made chat
structurally unable to see its own proposal at all (it omitted `proposalId`, so a
`c.proposal_id = NULL` comparison could never match). That is fixed, deployed and
verified — own-proposal chunks went 0 → 3 for a query that clears retrieval. The
problem described here remains and is independent.

## 3. The relevant code, verbatim

**Constants** (`retrieve-context/index.ts`):
```ts
const RETRIEVAL_K_REGULATORY = 5
const RETRIEVAL_K_PROPOSALS  = 5
const RETRIEVAL_SIMILARITY_THRESHOLD = 0.65
```

**Vector arm** — threshold applied in SQL:
```sql
1 - (c.embedding <=> query_embedding) >= similarity_threshold
```
Embeddings are OpenAI `text-embedding-3-small` (1536-dim), same model for documents
and queries.

**FTS arm** (`match_chunks_fts_proposals`):
```sql
ts_rank(c.search_vector, plainto_tsquery('english', query_text))::float AS text_score
...
AND c.search_vector @@ plainto_tsquery('english', query_text)
```

**Hybrid merge** (`mergeHybridResults`) — note it does NOT require a vector hit; an
FTS-only result is kept with `vector: 0`:
```ts
final_score: 0.7 * s.vector + 0.3 * s.text
// sorted desc, sliced to k
```

## 4. Measured evidence

### 4a. Vector arm — measured cosine similarity against the 14 real chunks

Queries embedded with the same model, compared to the stored embeddings:

| query | best cosine | chunks ≥ 0.65 |
|---|---|---|
| "What is the RFP reference number for this study, and which EDC system does the sponsor say they prefer?" | **0.603** | 0 |
| "What is the planned enrollment for this trial?" | **0.571** | 0 |
| "Who is the sponsor and what is the compound?" | **0.356** | 0 |
| "RFP reference EDC system preference" (keyword style) | **0.449** | 0 |
| verbatim text copied out of the document | **0.722** | 1 |

Full top-10 for the first question: `0.603, 0.566, 0.553, 0.531, 0.529, 0.522, 0.521,
0.520, 0.515, 0.507`.

The threshold of **0.65 sits above where every realistic question scores**, and below
only near-verbatim document text. The relevant chunk for question 1 is in that list —
it is retrievable, just under the cutoff.

### 4b. FTS arm — `plainto_tsquery` AND semantics

Calling `match_chunks_fts_proposals` directly, same org, same proposal:

| `query_text` | rows |
|---|---|
| the full 19-word question | **0** |
| `EDC Medidata Veeva` | 3 |
| `VBP-2025-ADVANCE-301` | 2 |

`plainto_tsquery` ANDs all terms, so a conversational question requires every
non-stopword to co-occur in one chunk. It effectively never matches.

**Both arms therefore fail simultaneously, for the same class of input — the phrasing
users actually type.** The vector arm is filtered out by the threshold; the FTS arm
matches nothing. Result: empty context, and the model correctly reports it cannot find
something that is sitting in the corpus.

## 5. Explicitly ruled out

- **Missing embeddings** — 181/181 chunks in the org have one.
- **Scoping/permissions** — the same chunks return when the query clears retrieval.
- **The merge dropping keyword-only hits** — checked the implementation; FTS-only
  results are retained with `vector: 0`. (This was an early hypothesis of mine and it
  was wrong.)
- **The already-fixed `proposalId` bug** — fixed, deployed, verified separately.
- **Retrieval being broken outright** — verbatim document text retrieves 5 chunks fine.

## 6. What we want a recommendation on

1. **Is lowering `RETRIEVAL_SIMILARITY_THRESHOLD` the right lever, and to what?**
   The measured question scores cluster at 0.50–0.60. A threshold near 0.45–0.50 would
   admit them — but we have not measured the false-positive cost, and the same constant
   governs the regulatory corpus, where precision matters more (this is clinical
   regulatory content; a confidently wrong citation is worse than no citation).

2. **Is a fixed cosine floor the right design at all?** Alternatives we have not
   evaluated: take top-k by score and drop the floor entirely; use a relative cutoff
   (e.g. within X of the best hit); or apply the floor only to the regulatory corpus.

3. **Should the FTS arm use `websearch_to_tsquery` or an OR-based query instead of
   `plainto_tsquery`?** That alone might rescue keyword-ish questions ("RFP reference
   number") without touching the vector threshold.

4. **Is question/document embedding asymmetry the real culprit, and is the fix a
   different retrieval strategy?** `text-embedding-3-small` is symmetric; short
   questions against long document chunks score low by construction. Options might
   include HyDE, a query-rewriting step, an asymmetric/instruct embedding model, or
   chunk-level summaries embedded alongside the raw text. Which is worth the
   complexity here?

5. **Does the 0.7/0.3 vector/text weighting still make sense** if the FTS arm is
   repaired and starts contributing real signal?

## 7. Constraints

- Postgres + pgvector on Supabase; retrieval is two SQL RPCs plus a TS merge.
- Embedding model is `text-embedding-3-small`; **re-embedding the corpus is possible but
  not free** — changing model means re-embedding everything.
- One threshold constant currently serves both corpora.
- Both chat and generation share this path; a change affects drafting quality as well as
  chat answers.
- Corpus is small (hundreds of chunks per org), so recall matters more than latency.
- Regulatory answers are clinical-compliance content where a wrong citation is costly;
  proposal-history answers are lower-stakes.

## 8. What would be most useful back

A recommendation on (1) and (3) with reasoning, a view on whether (4) is warranted at
this corpus size, and — if you suggest a threshold number — what evidence we should
gather to confirm it rather than adopting it blind.
