# Phase 5: Proposal Creation Wizard - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the existing `ProposalEditorModal` with a 3-step guided intake wizard (Step 3 — Assumption Review — is deferred to Phase 6). The wizard collects study data, documents, and triggers proposal generation. On completion, a new proposal record is created in Supabase and the user is navigated to the ProposalDetail page.

</domain>

<decisions>
## Implementation Decisions

### Wizard structure
- 3 steps in Phase 5: (1) Study Info → (2) Document Upload → (3) Template & Generate
- Step 3 (Assumption Review) is **skipped entirely** in Phase 5 — no placeholder, no dead UI
- Phase 6 will insert Assumption Review as a step between Document Upload and Template & Generate
- When Phase 6 adds it, the step auto-unlocks after documents are uploaded in Step 2

### Step navigation
- Free backward navigation — users can click any prior step indicator to revisit it
- Forward navigation requires per-step validation (hard required fields must pass)
- Step indicator: numbered steps with labels below each number (e.g., "1 · Study Info")

### Skip to Fast Draft
- Available from Step 1 onward
- Jumps directly to Step 3 (Template & Generate) — no confirmation dialog
- Step 3 shows a **passive context indicator** summarizing what data is and isn't present (e.g., "Study info ✓ · Documents: none · Output quality: limited")
- Does not block the user — just makes the quality trade-off visible

### Step 1 — Required vs optional fields
- **Hard required (gates advancement):** Sponsor name, Therapeutic Area, Indication, Study Phase
- **Optional with completeness indicator:** Countries/regions, Proposal due date, Services requested
- Completeness indicator is subtle — not a warning. Signals that more context produces better output without treating partial input as an error.

### Services Requested UI
- Displayed as **pill toggles** (click to select/deselect) — visually filled/colored when selected, outlined when not
- Grouped by category with a header label per group; pills in a wrapping flex row per category
- `AVAILABLE_SERVICES` constant in `cro-proposal-generator.js` must be restructured from a string array to objects with `label` and `category` properties
- Categories and groupings are derived from the constant — no separate hardcoded grouping logic

### Step 2 — Document Upload
- Reuses the `FileUpload` component from Phase 3
- No additional decisions needed here — Phase 3 already defined upload behavior

### Step 3 — Template & Generate
- **No template picker UI in Phase 5** — "Default Template" is pre-selected silently, no visible choice presented
- Template selection UI is wired in Phase 10
- Generate button: creates the proposal record in Supabase with all collected wizard data, then navigates to `ProposalDetail` page
- Generation itself (AI content) happens in Phase 7 — Phase 5 only creates the record

### Wizard state
- `useReducer` for wizard state management
- `sessionStorage` persistence across step navigation and page refreshes
- Preserves existing `ProposalModalContext` open/close pattern and Framer Motion modal animation

</decisions>

<specifics>
## Specific Ideas

- The passive context indicator on Step 3 (when arriving via Skip to Fast Draft) should feel informational, not alarming — something like a quiet summary row, not a warning banner
- Services pill toggles: filled/colored = selected, outlined = unselected — selection state must be visually unambiguous at a glance
- The completeness indicator on optional Step 1 fields should feel like a gentle nudge, not validation feedback — similar to a progress signal, not an error state

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ProposalEditorModal.tsx`: Existing modal to replace — preserve its Framer Motion animation and backdrop pattern
- `src/components/FileUpload.tsx`: Reuse directly for Step 2 document upload
- `src/context/ProposalModalContext.tsx`: Manages `isOpen` state — wizard slots into the same open/close pattern
- `cro-proposal-generator.js`: Contains `AVAILABLE_SERVICES`, `THERAPEUTIC_AREAS`, `STUDY_PHASES` constants — needs restructuring for services grouping

### Established Patterns
- Modal-first interaction: modals open/close via context, not route changes
- `sessionStorage` already used for draft generation persistence — same pattern for wizard state
- Framer Motion (12.34.3) already installed and used for panel/modal animations
- React Context for state management (no Redux/Zustand) — `useReducer` fits this pattern

### Integration Points
- `ProposalsContext.createProposal()` — will need to accept full wizard payload and write to Supabase
- `ProposalModalContext` — wizard replaces the modal content, open/close stays the same
- Supabase `proposals` table — wizard completion creates the record
- React Router — on Generate success, navigate to `/proposals/:id`

</code_context>

<deferred>
## Deferred Ideas

- Assumption Review step (Step 3 in final flow) — Phase 6
- Template selection UI in Step 3 — Phase 10
- AI proposal generation from wizard data — Phase 7

</deferred>

---

*Phase: 05-proposal-creation-wizard*
*Context gathered: 2026-03-23*
