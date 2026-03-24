# Phase 6: AI Assumption Extraction - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Run a structured Claude extraction pass on uploaded RFP documents and present results for user review in the wizard's new Step 3. Approved assumptions are saved to `proposal_assumptions` and serialized into `ProposalInput` for generation. Creating proposals, uploading documents, and generating proposals are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Extraction trigger
- When ALL `proposal_documents` for the proposal reach `parse_status === 'complete'`, immediately invoke `extract-assumptions` as fire-and-forget from Step 2
- This simultaneously unblocks the Step 2 "Next" button (which is disabled while any doc is `pending` or `extracting`)
- Step 3 renders assumption results when ready — no hard loading gate, but a lightweight spinner fallback for the edge case where the user navigates before extraction finishes
- Extraction does NOT re-trigger on subsequent Step 3 visits if assumptions already exist in WizardState

### Assumption card UX
- **Controls:** Approve (✓) and Reject (✗) toggle buttons on each card. Clicking the value text makes it editable inline.
- **Approved state:** Green border
- **Rejected state:** Card stays visible, grayed out with strikethrough text — un-rejectable by clicking ✓ again
- **Confidence badges:** Three-tier — High (≥0.8, green), Medium (0.5–0.79, yellow), Low (<0.5, red). Matches StatusBadge pattern already in the codebase.
- **Manual add:** "＋ Add assumption" button at the bottom of the list creates a blank card with category and value fields. User fills in and approves.

### Missing info presentation
- **Layout:** Separate "⚠ Missing Information (N)" section at the top of Step 3, styled amber/yellow, above the extracted assumptions list
- **Fill-in UX:** Each missing item has an inline text field labeled with the field name. User fills in and saves.
- **On save:** Filled missing items become approved assumption cards with `source: 'user-provided'`. Same table, same serialization path as AI-extracted assumptions.
- **Skippable:** No hard gate. Proceed ("Next") button shows an inline count badge when items remain unfilled: e.g., "Next (3 missing)". Unfilled items produce `[PLACEHOLDER: field_name]` markers at generation time (Phase 7 concern, but format established here).

### Wizard step expansion
- **Step type:** Expand `step: 0 | 1 | 2` → `step: 0 | 1 | 2 | 3`
  - 0 = Study Info, 1 = Document Upload, 2 = Assumption Review (new), 3 = Template & Generate
- **WIZARD_STEPS constant:** Add `'Assumption Review'` between `'Document Upload'` and `'Template & Generate'`
- **Skip to Fast Draft:** Update dispatch target from `step: 2` to `step: 3`. Update button tooltip/helper text to reflect that both Upload and Assumption Review are bypassed. The Generation step's context indicator must show document count = 0 and assumption count = 0 when arriving via Fast Draft.
- **Assumption state in sessionStorage:** Add an `assumptions` array to `WizardState` (AI-extracted + user-added, with per-item status: approved/rejected/pending). SessionStorage persists automatically via existing `useEffect`. If user goes back to Step 2 and adds a document, re-entering Step 3 re-runs extraction and overwrites the assumptions array.

</decisions>

<specifics>
## Specific Ideas

- The Next button on Step 3 shows an inline missing-item count rather than a blocking dialog or silent proceed — non-intrusive but not invisible
- The generation step context indicator (currently shows study info + document count quality signal) should be extended to show assumption count as part of the quality assessment

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `FileUpload` (`src/components/FileUpload.tsx`): has `onUploadComplete(documentId)` callback; already fires `extract-document` fire-and-forget on each upload
- `DocumentList` (`src/components/DocumentList.tsx`): polls `parse_status` every 2s while docs are pending/extracting — same polling pattern can detect when all docs are `complete` to trigger `extract-assumptions`
- `StatusBadge` in `DocumentList`: color-coded pill badge pattern (green/blue/gray/red) — reuse for confidence badges with High/Medium/Low tiers
- `WizardStepIndicator` (`src/components/wizard/WizardStepIndicator.tsx`): needs a 4th step added
- `Step3Generate` (`src/components/wizard/Step3Generate.tsx`): rename/move to `Step4Generate`; new `Step3AssumptionReview` is created for this phase

### Established Patterns
- `useReducer` + `sessionStorage` for wizard state (`ProposalCreationWizard.tsx`) — extend with `assumptions` field and new action types (`SET_ASSUMPTIONS`, `UPDATE_ASSUMPTION`, `ADD_ASSUMPTION`, `SET_EXTRACTION_STATUS`)
- `step: 0 | 1 | 2` union type in `WizardState` — extend to `0 | 1 | 2 | 3`; all `SET_STEP` dispatches with step `2` (generate) update to `3`
- Tailwind color classes: `jamo-500` for primary actions, `green-*`, `yellow-*`, `red-*` for status, `amber-*` for warnings
- `supabase.functions.invoke(...)` fire-and-forget pattern already used in `FileUpload`

### Integration Points
- `proposal_assumptions` table already exists (migration `20260305000008_proposal_assumptions.sql`) — no new migration needed for storage
- `extract-assumptions` Edge Function: new function to create; input is array of `document_extracts` texts for the proposal; output is `{ assumptions: [{ category, value, confidence, source }], missing: [{ field, description }] }`
- `WizardState.proposalId` is set in Step 2 after proposal creation — available when firing `extract-assumptions` from Step 2's document upload flow
- `Step4Generate` (renamed from Step3Generate): context summary component will need to read assumption count from `WizardState.assumptions` to update quality signal

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-ai-assumption-extraction*
*Context gathered: 2026-03-23*
