---
created: 2026-09-10T00:00:00.000Z
title: UI/UX + bug batch (12 items, priority-ordered)
area: general
files: []
---

## Working list

Priority order as given by Aaron on 2026-09-10. Check off as shipped.
Each item gets its own skill treatment (brainstorming for features,
systematic-debugging for bugs) when we pick it up.

- [x] **1. Proposal wizard dropdowns — add options + "Other" freetext**
  Study phase dropdown: add **"Drug Discovery"**. Add **"Other"** -> selecting it
  reveals a text box to enter a custom study phase.
  Therapeutic Area: add **"Other"** -> same pattern, reveals a text field for
  custom input.
  _Type: feature - frontend (proposal wizard)_

- [x] **2. Styled export not applying template styles**
  Most recent test: exported proposal did NOT use the styles from the chosen
  styled template. Styled exporting guide needs to actually work.
  _Type: bug - systematic debug - export pipeline_

- [x] **3. Assumption type selector**
  "Add new assumption" should let you pick a type (Scope, Budget, etc.).
  Make it clickable/changeable after creation - likely a dropdown.
  _Type: feature - frontend + data model (assumptions)_
  Shipped 2026-09-11 (`8380ec6`, `ea20c98`, merged `956f8b4`, pushed; edge fns
  deployed). Category is a select on every Step 3 card, backed by a shared
  `ASSUMPTION_CATEGORIES` union in `src/types/wizard.ts`. Not display-only: it
  is interpolated into the LLM prompt as `- [category] content`.
  Three adjacent defects found and fixed in the same pass: the 2->3 write was
  an unmatched upsert that duplicated rows and never recorded rejections
  (now replace-the-set, `src/lib/assumptionPersistence.ts`); `generateSection`
  skipped assumption enrichment so "regenerate section" ran with none; stale
  category taxonomy comments. 17 duplicate approved rows cleaned from prod.
  See `docs/handoffs/2026-09-11-assumption-category-investigation.md`.

- [ ] **4. Align Expand / Condense / Rewrite buttons**
  Buttons on the section panel shift position depending on section name length.
  Pin them so they stay aligned regardless of title length.
  _Type: polish - frontend (proposal editor panel)_

- [x] **5. Jamo AI Chat sidebar disconnected from context / RAG**
  Chat sidebar doesn't appear to see Context & Documents or the original
  assumptions. Determine whether chat can access source material / RAG
  retrieval, or why it's disconnected, then wire it up (or document the reason).
  _Type: investigation - chat + RAG (chat-with-jamo / retrieve-context)_
  Shipped 2026-09-11 (`852d34f`, merged `6e72515`, pushed; chat-with-jamo v24
  deployed). TWO distinct causes, both fixed:
  (a) `chat-with-jamo/index.ts` called `fetchRagContext` without `proposal_id`,
  so retrieve-context forwarded `current_proposal_id => NULL`. The RPC clause
  `c.proposal_id = current_proposal_id OR (p.status <> 'draft' AND ...)` can
  never match on `= NULL`, and the proposal being edited is almost always a
  draft, so chat was STRUCTURALLY unable to retrieve any chunk from the
  proposal in front of the user. Generation passed it and worked.
  (b) Assumptions were never sent to chat in any form — approved ones are now
  fetched server-side into the system prompt.
  Verified live: same query, only `proposalId` varying — own-proposal chunks
  went 0 -> 3. Chat now cites approved assumptions unprompted.
  NOTE: a second, independent defect was found while verifying — see 5.1. #5 is
  complete as scoped; the sidebar is no longer structurally blind, but 5.1 still
  limits how often retrieval fires for real questions.

- [~] **5.1 RAG similarity threshold rejects ordinary questions** — steps 1-3 SHIPPED
  Found while verifying #5, not part of it. `RETRIEVAL_SIMILARITY_THRESHOLD` in
  retrieve-context is high enough that natural-language questions retrieve
  nothing, while verbatim document text retrieves fine.
  Evidence (prod, 2026-09-11, proposal `4014dbff`, 14 own chunks, all embedded):
  - "What is the RFP reference number ... which EDC system ...?" ->
    `{regulatoryCount: 0, proposalCount: 0, belowThreshold: true}` — yet the
    same text hits 3 rows calling `match_chunks_fts_proposals` DIRECTLY, and the
    answer (`VBP-2025-ADVANCE-301`) is present in chunk `83a29979`.
  - Verbatim chunk text as the query -> 5 proposal chunks, 3 from this proposal.
  - `regulatoryCount: 0` even at `regulatoryRelaxationLevel: 2`, so the 14.6 ICH
    corpus is not coming back either. Embeddings are NOT the problem: 181/181
    chunks in the org have one.
  Affects the generation path equally, not just chat. Do NOT guess a new number:
  measure the score distribution for realistic questions first, and check whether
  FTS-only hits are being dropped by the hybrid merge before retuning the
  vector threshold.
  SHIPPED 2026-09-11 (`961963e`, merged `a529857`, pushed; migration
  20260911000001 applied; retrieve-context deployed). Root cause was NOT a
  mistuned number — measured relevant 0.445-0.539 vs irrelevant 0.323-0.571,
  bands OVERLAP, so no cosine floor separates them; 0.65 rejected 100% of real
  hits. Fixed: per-corpus floors at 0.2 (sanity guards, not relevance
  decisions) + k 5->10; FTS rebuilt to OR lexemes with ts_rank_cd and coverage
  weighting (plainto_tsquery ANDs everything, so conversational questions
  matched nothing); merge replaced with Reciprocal Rank Fusion (the old
  `0.7*vector + 0.3*text` was ~98/2 in practice because cosine ~0.5 vs ts_rank
  ~0.05, so keyword hits could never surface). Telemetry now logs query + top-10
  fused scores per call.
  Result: proposal chunks 0->10, regulatory 0->10, belowThreshold true->false,
  relaxation level 2->0. Remaining work is precision, not recall: see 13-15.
  _Type: investigation / tuning - RAG retrieval (retrieve-context)_

- [ ] **6. Proposal status popover clipped by list container**
  Clicking status opens the Draft/Lost/Submitted/etc. menu, but it's hidden
  behind the proposal-list container when few proposals are listed (no room to
  render). Needs portal / overflow fix so it always shows.
  _Type: bug - frontend (proposal list, overflow/z-index/portal)_

- [ ] **7. Archive / delete / permanent-delete don't update list immediately**
  Archived proposal stays in Active AND Archive until page refresh.
  Delete / permanent-delete are finicky and unreliable. Proposal should move to
  its correct list immediately and disappear from the old one at the same time.
  _Type: bug - frontend state / cache invalidation_

- [ ] **8. Debug button visible to admins - restrict to super_admin only**
  Admin users can currently see the debug button. It should be visible ONLY to
  super_admins. Remove for clients/admins.
  _Type: bug / access-control - frontend gating_

- [ ] **9. Resume button when generation is stopped**
  While generating, if Stop is pressed, swap the Stop button for a **Resume**
  button in the same spot. (Assess whether this is an easy change.)
  _Type: feature - frontend + generation backend_

- [ ] **10. Capitalize "Jamo" everywhere**
  Audit all user-facing copy - "Jamo" should always be capitalized.
  _Type: polish - global copy sweep_

- [ ] **11. Replace Jamo AI rainbow-square icon with Jamo rocket**
  Swap the rainbow/gradient AI square icon for the Jamo rocket mark.
  _Type: polish - frontend asset_

- [ ] **12. Generation continues when navigating away from page**
  While a proposal is generating, allow navigating away (e.g. to Settings) and
  back with generation still running or completed. Assess feasibility -
  likely needs server-side / background generation rather than client-driven.
  _Type: feature - architecture (generation lifecycle)_

- [ ] **13. RAG golden set — BLOCKED on where the questions come from**
  The measurement instrument for 14/15/16. `scripts/rag-eval.ts` is BUILT and
  works: give it `(question, expected_chunk_ids)` pairs and it reports
  recall@5/10/20, breakdowns by corpus/style/provenance, per-corpus threshold
  sweep, and which questions missed entirely. What is missing is the pairs.
  The reviewed plan said mine 30-50 from real chat transcripts. That is not
  possible: of 220 real user messages, 67 are edit commands, 57 CTA snapshots,
  35 acks, 49 other and only **12 are question-shaped** — five of which are the
  same message repeated, and nearly all ask about editor state ("Explain this
  section", "What gaps should I address?") rather than document content.
  Likely because retrieval never worked, so nobody learned to ask it things.
  Options, undecided: (a) synthesise questions from documents and label
  `provenance=synthetic_from_document` — fast, but a question written while
  looking at its answer inherits that document's vocabulary and so dodges the
  vocabulary mismatch that causes real misses; treat its recall as an UPPER
  BOUND, not an estimate. (b) collect real questions now that retrieval works
  and `retrieval_telemetry` logs every query. (c) hybrid: synthetic now,
  re-run against real later and compare to quantify the optimism. (d) Aaron
  writes the questions.
  _Type: investigation / eval infrastructure - RAG_

- [ ] **14. RAG reranker — the actual precision fix**
  Step 5 of the reviewed plan, and the reason 13 exists. Cross-encoder rerank
  (Cohere Rerank or LLM-as-reranker) over ~20 RRF-fused candidates. Reranker
  scores ARE calibrated to relevance, unlike cosine — so the regulatory
  abstention threshold belongs HERE, not on the retrieval floors, which are
  deliberately set to 0.2 as sanity guards only. Also require the model to cite
  a supporting chunk per claim and say "unsupported" otherwise.
  Motivating evidence from the live check after steps 1-3: asked for the RFP
  reference, chat answered `VBP-ADV-301` (the Protocol Number) when the RFP
  Reference is `VBP-2025-ADVANCE-301`. Both strings are in the retrieved chunk,
  so retrieval succeeded and discrimination failed. Blocked by 13.
  _Type: feature - RAG precision_

- [ ] **15. Contextual retrieval — ONLY if recall@20 is still the constraint**
  Step 6. Prepend a short generated context blurb to each chunk before
  embedding ("From the Vericel BioPharma RFP, data management section: ...")
  and re-embed. Cheap at hundreds of chunks per org. Do NOT start this before
  13 says recall is the binding constraint — if recall@20 is already high,
  the problem is precision (14) and this is wasted effort and spend.
  _Type: feature - RAG recall_

- [ ] **16. Query rewriting for coreference in chat**
  Independent of the retrieval work and needed regardless. Follow-ups like
  "what about their EDC preference?" or "expand on that" are sent to retrieval
  verbatim, so they retrieve against pronouns. Rewrite the query against chat
  history before embedding.
  _Type: feature - chat + RAG_

- [ ] **17. Citations stripped from chat answers**
  Observed twice during 5/5.1 verification, before AND after the retrieval fix:
  `"warning": "N citation(s) removed — source not found in retrieved documents"`,
  with `citations: []` in an otherwise correct answer. So the model cites
  something that does not match the retrieved set, and the citation is silently
  dropped — the user sees an uncited claim. Independent of retrieval recall.
  Find where the stripping happens and why the ids mismatch before assuming 14
  fixes it.
  _Type: bug - chat citations_
