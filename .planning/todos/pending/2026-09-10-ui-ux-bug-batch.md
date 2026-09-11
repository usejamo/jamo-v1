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

- [ ] **5.1 RAG similarity threshold rejects ordinary questions**
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
