# Phase 8: Section Workspace & Rich Text Editor - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the read-only `ProposalDraftRenderer` with a full TipTap v2 editing workspace. Delivers: per-section TipTap editor blocks, a per-section action toolbar (Generate/Regenerate/Expand/Condense/Rewrite), lock/unlock toggle, version history panel, section navigation with status indicators, inline compliance flags, cross-section consistency check after generation, and a programmatic injection API consumed by Phase 9 (Jamo AI chat).

Not in scope: Jamo AI chat panel logic (Phase 9), DOCX export (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### AI Action Result UX
- **D-01:** All per-section AI actions (Expand, Condense, Rewrite, Generate, Regenerate) stream into a **preview area** — editor content is never overwritten until the user explicitly accepts.
- **D-02:** A **snapshot of the current section content is taken before the stream starts**, stored as a pre-action version. This happens regardless of whether the user ultimately accepts or rejects.
- **D-03:** **Expand / Condense** — inline preview below/beside the section with Accept / Reject buttons.
- **D-04:** **Rewrite** — before/after diff view before committing. Rewrite is the most destructive action and intentionally carries the most friction.
- **D-05:** Accepted content **must be injected via TipTap's command API** (`insertContent` / `setContent` on the correct node). Never via direct document mutation. This is required for Cmd+Z to work — TipTap only registers reversible transactions when its command API is used. Bypassing the command API silently breaks undo.
- **D-06:** Cmd+Z restores previous section content even after the user accepts an AI action, because the accepted content is a registered TipTap transaction.

### Version History
- **D-07:** `proposal_section_versions` stores **AI action snapshots only** — pre-action state (before) and post-accept result (after). This table is an AI audit trail, not a general document version history. Do not snapshot manual edits here.
- **D-08:** Manual edits are covered by two separate mechanisms: TipTap's in-memory undo stack (Cmd+Z, short-term) and a **periodic autosave to a `last_saved_content` column on the `proposal_sections` row** (durability). This is a single overwriting column with `updated_at` — not a versions table. Autosave as a version trigger (flooding `proposal_section_versions`) is explicitly ruled out.
- **D-09:** Version history UI is an **overlay panel** (fixed position, semi-transparent backdrop — not a layout-shifting drawer). Safe on narrow editor layouts.
- **D-10:** The panel shows each version as a **diff against the current live section content**, not raw snapshot text in isolation. Label each entry with the triggering action and timestamp (e.g. "Before Rewrite — Mar 26, 2:14pm").
- **D-11:** Restore follows the same accept flow as any AI action: snapshot pre-restore state first, inject via TipTap command API, undoable with Cmd+Z. A restore is just another state transition — no special case.

### Cross-Section Consistency Check (REQ-5.7)
- **D-12:** Consistency check **auto-triggers after full generation completes** (all sections done). No manual trigger needed. Flags surface after generation without user action.

### Compliance Flags (REQ-5.8)
- **D-13:** Compliance flags are triggered **on accept** (not on stream complete, not on generation complete). Checking streaming or just-landed content that the user may immediately rewrite is wasted API calls and noisy flags.
- **D-14:** **Two-pass approach on accept:**
  1. **Rule-based checks first** (free, instant): minimum word count, required headings present, placeholder text detected (`[PLACEHOLDER: ...]`). Catches obvious gaps at zero cost.
  2. **Haiku compliance call** fires only if the section passes basic rules. Uses a **narrow structured prompt** with the specific requirements list for that section type (e.g. ICH E6 safety reporting criteria). Returns structured JSON: `{ compliant: boolean, flags: string[] }`. General review prompts are explicitly ruled out — ask specific questions, get actionable answers.
- **D-15:** Compliance flags render **inline in the editor margin** as the user works through sections. Section-by-section, not a flood of flags after full generation.

### Phase 9 Injection Contract
- **D-16:** Jamo AI chat injects content into TipTap via **ref-based editor command**: `editorRef.current.commands.insertContentAt()`. Same pattern as all other AI actions — snapshot before inject, insert via TipTap command API, undoable with Cmd+Z. No special case.
- **D-17:** **Targeting — two layers:**
  - **Primary**: Each section has a "Chat about this section" entry point that pre-targets and locks the editor ref for that chat session. The chat panel header persistently displays the active target (e.g. "Editing: Section 4.2 — Adverse Events") with a clear unlock/retarget mechanism.
  - **Secondary (fallback)**: If chat is already open and the user clicks into or scrolls to a different section, the active section tracker updates the target automatically.
  - No explicit in-chat section picker — too much friction for how CRO writers work.

### Claude's Discretion
- Exact TipTap extension set (bold, italic, lists, headings — standard prose editing; no special-purpose extensions unless needed)
- Toolbar layout within each section card (floating vs. fixed header)
- Autosave debounce interval for `last_saved_content`
- Maximum versions to retain per section in `proposal_section_versions` (suggest 10–20, prune oldest)
- Specific section-type requirements lists used in compliance Haiku prompts (derive from `cro-proposal-generator.js` section definitions and ICH E6/FDA guidance already in the knowledge base)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing editor and renderer
- `src/components/ProposalDraftRenderer.tsx` — Current component being replaced/extended. Has `DraftNav` (left panel, sticky, intersection observer for active tracking), review mode (static blocks), and streaming mode (SectionStreamCard). Phase 8 adds a third mode: editing (TipTap blocks).
- `src/components/SectionStreamCard.tsx` — Phase 7 streaming card, superseded by TipTap blocks in Phase 8.
- `src/components/SuggestedChange.tsx` — Existing accept/reject diff component. Reuse pattern for Expand/Condense inline preview.

### Generation and section types
- `cro-proposal-generator.js` — Defines all 10 section names, content expectations, and system prompt. Use section definitions to derive per-section compliance requirement lists for Haiku calls.

### Schema
- `supabase/migrations/` — `proposal_sections` table (Phase 8 adds `last_saved_content` column via migration). `proposal_section_versions` table needs to exist or be created — check migrations for whether it was seeded in Phase 1.

### Type contracts
- `src/types/generation.ts` — `GenerationState`, `getWaveSections()` — Phase 8's editor layout follows the same wave/section key structure.
- `src/types/draft.ts` — `DraftSection`, `ContentBlock` — existing block types; TipTap content will replace these for edited sections.

### Established patterns
- `src/context/` — React Context + `useReducer` pattern (Phase 5). Phase 8 workspace state should follow this pattern.
- `supabase/functions/extract-assumptions/index.ts` — Haiku API call pattern for compliance checks.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProposalDraftRenderer.tsx`: `DraftNav` component (left panel, sticky, intersection observer for active section tracking) is directly reusable. Extend rather than replace.
- `SuggestedChange.tsx`: Accept/reject diff UI — reuse for Expand/Condense inline preview and for the Rewrite before/after diff view.
- `SectionStreamCard.tsx`: Phase 7 streaming cards — these are superseded, but their status indicator logic may be reusable for the section nav status (complete / needs review / missing).
- `framer-motion`: Already installed, used in `ProposalDraftRenderer` for popover animations. Use for overlay panel entrance/exit.

### Established Patterns
- Tailwind CSS for all styling (no additional styling libs).
- `useReducer` for complex local state (established in wizard, Phase 5).
- TipTap command API for all content mutations (required for undo — see D-05).
- Haiku-tier (`claude-haiku-4-5-20251001`) for lightweight AI calls (compliance, consistency, anchor extraction — Phase 7 precedent).

### Integration Points
- `ProposalDraftRenderer` renders inside `ProposalDetail` — Phase 8 replaces/extends it there.
- `proposal_sections` table: add `last_saved_content` column for autosave durability.
- `proposal_section_versions` table: verify it exists in migrations; Phase 8 writes pre/post AI action snapshots here.
- Phase 9 (`AIChatPanel`) will call into Phase 8's editor refs via the two-layer targeting contract defined in D-16/D-17.

</code_context>

<specifics>
## Specific Ideas

- The TipTap command API constraint (D-05) applies universally: AI actions, restore, and Phase 9 injection all use the same insertion pattern. This is a cross-cutting architectural rule, not a per-feature decision.
- Version history panel design: overlay (not layout drawer), diff against live content, action-labelled entries. The restore flow is identical to accepting an AI action — the planner should not treat it as a special case.
- Compliance two-pass is deliberate: rule-based catches the obvious, Haiku catches the semantic. Haiku only fires if basic rules pass — this keeps the token cost proportional to need.
- Phase 9 targeting: "Chat about this section" is the primary entry point (section-initiated, locks target). Active section tracker is the fallback (chat already open). No in-chat picker.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-section-workspace-rich-text-editor*
*Context gathered: 2026-03-26*
