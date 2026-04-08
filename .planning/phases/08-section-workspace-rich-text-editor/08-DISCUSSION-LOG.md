# Phase 8: Section Workspace & Rich Text Editor - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-26

---

## Area 1: AI Action Result UX

**Q: When a per-section AI action runs, how should the result land in the editor?**

Options presented:
- Stream in-place (overwrite immediately)
- Accept/reject diff first (using SuggestedChange component)

**User clarification:** Neither option exactly. Stream into a preview area — never overwrite editor content directly. Snapshot current content before stream starts. Expand/Condense: inline preview with Accept/Reject. Rewrite: before/after diff (most destructive = most friction). Cmd+Z should restore previous content even post-accept.

**Further precision:** Accepted content must go through TipTap's command API (`insertContent`/`setContent`). Direct document mutation bypasses TipTap's transaction history and silently breaks undo. This is a hard constraint, not a preference.

**Decision:** Preview area pattern with action-specific friction levels. TipTap command API mandatory for all insertions. See D-01 through D-06.

---

## Area 2: Version History

**Q: What triggers a version snapshot?**

Options presented:
- AI actions only
- AI actions + manual save (Cmd+S)
- AI actions + autosave (debounced)

**User clarification:** The right answer depends on what `proposal_section_versions` is for. Two separate concerns, two separate mechanisms:
- `proposal_section_versions` = AI audit trail (AI actions only — pre/post snapshot)
- Manual edit durability = autosave to `last_saved_content` on section row (single overwriting column, not a versions table)
- Autosave as a version trigger is the worst of both worlds — noisy and still insufficient for true granular history.

**Decision:** AI actions only for versions table. Autosave to flat column for manual durability. See D-07, D-08.

**Q: How should version history be surfaced in the UI?**

Options presented:
- Slide-in side panel
- Inline dropdown / popover
- Modal with diff view

**User clarification:** Slide-in panel (option 1), but the panel must show a diff against the current live section — not raw snapshot content. Without diff, the user has to mentally compare. Also: overlay panel (fixed position, semi-transparent backdrop) not a layout-shifting drawer, for narrow screen safety. Restore must follow the same accept flow as AI actions — snapshot pre-restore, TipTap command API, Cmd+Z undoable. Restore is just another state transition.

**Decision:** Overlay panel with live diff. Restore = accept flow. See D-09 through D-11.

---

## Area 3: Consistency Check & Compliance Flags

**Q: When should the cross-section consistency check run?**

Options presented:
- Auto after full generation
- Manual trigger button

**User selection:** Auto after full generation. Decision: D-12.

**Q: How should inline compliance flags be generated?**

Options presented:
- AI call per section on complete (Haiku)
- Rule-based static checks
- Single AI call after full generation

**User clarification:** Recommended option (AI per section) is right but needs refinement:
1. Trigger on **accept**, not on generation complete. Checking streaming or just-landed content wastes tokens on content the user may discard.
2. AI call should use a **narrow structured prompt** with a specific requirements list for that section type, not a general review. Returns `{ compliant: boolean, flags: string[] }`.
3. Rule-based static checks should run first as a free pass (word count, headings, placeholder detection). AI call only fires if basic rules pass.
4. Single AI call after full generation is explicitly the worst UX option — floods flags at the end like a report card.

**Decision:** Two-pass on accept — rule-based first, Haiku second if basic rules pass. Inline in editor margin. See D-13 through D-15.

---

## Area 4: Phase 9 Injection Contract

**Pre-discussion clarification from user:** Before choosing the injection API, the user surfaced a prerequisite: how does the chat know which section to target? Injecting at cursor position doesn't work when the editor may not be focused (chat is in a side panel).

Three targeting models discussed:
- A: Active section tracking (implicit, based on scroll/focus)
- B: Explicit in-chat section picker
- C: Section-initiated chat ("Chat about this section" entry point, locks target)

**User decision on targeting:** C first (primary), A as fallback. No in-chat picker (B) — too much friction for CRO writers. Locked target displayed persistently in chat panel header ("Editing: Section 4.2 — Adverse Events") with clear unlock/retarget mechanism.

**Q: How should Phase 9 inject content into TipTap?**

Options presented:
- Ref-based editor command (`insertContentAt`)
- React state / context update
- Supabase Realtime event

**User decision:** Ref-based editor command (`editorRef.current.commands.insertContentAt()`). Same snapshot-before / TipTap command API / Cmd+Z-undoable flow as every other AI action. No special case.

React state update explicitly ruled out — bypasses TipTap command API, undo broken. Supabase Realtime not used for same-page injection.

**Decision:** D-16, D-17.
