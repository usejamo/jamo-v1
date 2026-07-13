# Phase 14.2 — AI Chat Co-pilot
_Context doc for /gsd-discuss-phase. Do not generate plans until discuss is complete._
_Depends on: Phase 14.1 (AI Chat Foundation) — all tool schemas, `chat_sessions` table, diff infrastructure, and multi-model routing must be complete before this phase begins._

---

## Goal

Phase 14.2 has two sequenced parts:

**Part A — Inline Editor Diffs.** Close the UX gaps in 14.1's diff review before any proactive co-pilot behavior is built. Moves paragraph-level diff review from the chat panel into the section editor itself. This is a prerequisite for Part B: the walkthrough feature requires accepting paragraphs inline in the editor, and that mechanism must be solid before the AI starts driving it.

**Part B — Proactive Co-pilot.** Activate proactive behavior. The panel stops waiting for the user to know what to ask. It opens with a prioritized action queue, surfaces gaps and cross-section conflicts automatically, walks the user through complex drafting tasks step-by-step, and persists in-progress tasks across reloads.

The combined shift in product framing: **chat panel → proposal co-pilot with inline editing**.

---

## Non-Goals (explicit)

- New proposal generation or export features
- Salesforce integration changes
- Dashboard / lifecycle tracking changes
- Any changes to the underlying tool schemas (those are locked in 14.1)
- Performance optimization of the RAG pipeline beyond what 14.1 established

---

## Background

Phase 14.1 shipped:
- Structured tool use (`propose_edit`, `answer_with_citations`, `ask_user`, `set_focus`, `check_regulatory_compliance`)
- `chat_sessions` table with `active_task`, `pending_actions`, `resolved_items` columns
- Multi-model routing infrastructure (Haiku + Sonnet)
- Per-paragraph diff UI rendered inside the chat panel via `DiffPreview.tsx`

**Three problems emerged from the 14.1 diff UI in practice:**
1. **Cramped reading surface.** Multi-paragraph diffs in a 320–400px chat panel are hard to review.
2. **Accept scrolls chat to bottom.** Clicking Accept triggers the chat's scroll-to-bottom effect, preventing the user from advancing to the next pending paragraph naturally. Affects all tool result cards, not just `propose_edit`.
3. **Insertion order corruption.** `insertChainRef` only chains correctly when paragraphs are accepted in AI-proposed order. Out-of-order acceptance produces reversed or misplaced paragraphs.

These are symptoms of one architectural choice: rendering positional edits in a non-positional surface. Part A corrects this. `DiffPreview.tsx` and the `insertChainRef` mechanism are removed.

**What still needs building after 14.1:**
- Panel opens to an empty input — user must know what to ask
- Gap detection (`detectGaps()`) still runs client-side on simple rules
- No cross-section conflict detection
- No in-progress task concept — closing the panel loses task state
- `ask_user` tool exists but no multi-turn orchestration activates it automatically

Part B addresses all of these.

---

## Part A — Inline Editor Diffs

### Architectural Decisions (Locked — Do Not Reopen)

#### Rendering mechanism
**ProseMirror Decorations, not real document nodes.** A new `PendingEditsPlugin` holds the `ProposeEditChange[]` array in plugin state and renders ghost paragraphs as widget decorations at their computed positions.

Ghost content never appears in `editor.getHTML()`, never reaches autosave, never reaches the DB. The real-document-node approach was disqualified: `useAutosave` writes `editor.getHTML()` on every `onUpdate` event (1500ms debounce) with no filter for pending state — ghost nodes would silently autosave into `proposal_sections.content`.

#### Modification display: real paragraph + ghost immediately below
- The existing paragraph receives a **node decoration**: muted opacity + subtle amber left-border. Not strikethrough — regulatory text is hard to read struck through, and CRO reviewers need to compare proposed against original word-for-word to verify compliance language wasn't softened or dropped.
- The proposed replacement renders as a **widget decoration** immediately below, with ghost tinting and Accept/Reject affordances.
- **Accept:** one ProseMirror transaction replaces the existing paragraph's content with the proposed text, removes both decorations, tags the transaction with `aiApplied` meta so `PlaceholderMark`'s resolution plugin skips it.
- **Reject:** decorations removed, real paragraph untouched.

#### Insertions
All ghosts in a change set are materialized at once when the tool result arrives. Chains of insertions resolve to correct document positions visually before any user interaction. Accept commits the paragraph as a real node (fresh UUID from `UniqueID` extension). Reject removes the widget.

This eliminates `insertChainRef` entirely — positions are pre-resolved.

#### Deletions
Target paragraph receives a node decoration: muted + red left-border (distinct from modification's amber). Accept removes the paragraph. Reject removes the decoration.

#### Table cell modifications
A ghost row under a modified table cell is confusing. For paragraph nodes inside table cells, fall back to **inline replacement display**: replace the cell's rendered content with ghost-styled proposed text; original recoverable via an expandable affordance on the decoration. The plugin dispatches this decoration type explicitly based on parent node type. Encode in the plugin's decoration-dispatch logic, not as an afterthought.

#### Persistence and reload
**Ghost state is session-scoped. The chat summary card is the durable record.**

- `tool_data.payload.changes` and `tool_data.state.resolutions` (existing 14.1 schema) are the source of truth for what was proposed and what was accepted/rejected.
- On reload, the `EditSummaryCard` reads from `tool_data` and displays the change set with its preserved resolution state. The card is a meaningful history record on its own.
- Clicking "Review in editor →" on a card with remaining pending changes dispatches `SET_PENDING_EDITS` to the workspace reducer, which the plugin reads to re-materialize unresolved ghosts.
- The editor does not read chat state on mount. No ghost nodes in the DB.

#### State flow (one direction, no circular sync)
The workspace reducer is the single source of truth for pending edit state:

1. Chat receives `propose_edit` tool result → writes `tool_data` → dispatches `SET_PENDING_EDITS(section_key, changes[])` to workspace.
2. `PendingEditsPlugin` subscribes to workspace state → renders decorations.
3. User clicks Accept/Reject in editor → plugin dispatches `ACCEPT_PENDING_EDIT` or `REJECT_PENDING_EDIT` to workspace.
4. Reducer updates workspace state AND triggers `tool_data.state.resolutions` update on the chat message via the existing `persistToolDataState` mechanism.

Chat never reads ghost state from the editor. The editor never reads `tool_data` directly.

#### Scroll bug fix (broad)
Fix in this phase, scoped to all tool result cards. A `useRef<number>` tracks last-rendered message count; `scrollIntoView` fires only when count actually increases, not on every `messages` array change. This is ~5 lines in `AIChatPanel.tsx`.

#### Component scope
The new inline diff system is a **new pattern**, not an extension of `AIActionPreview.tsx`. `AIActionPreview` handles full-section replacement (toolbar-triggered Expand/Condense/Rewrite) and remains untouched.

Build as:
- `PendingEditsPlugin` — ProseMirror plugin registered alongside existing TipTap extensions in `SectionEditorBlock`
- `pending_edits: PendingEdit[]` — new slot on `SectionEditorState`, alongside (not replacing) `ai_action`
- New reducer actions: `SET_PENDING_EDITS`, `ACCEPT_PENDING_EDIT`, `REJECT_PENDING_EDIT`, `CLEAR_PENDING_EDITS`
- `EditSummaryCard` — replaces `DiffPreview` in chat; shows section name, change count, running tally, "Review in editor →" affordance, and an expandable list of individual changes with resolution state

### Part A Deliverables

1. **`PendingEditsPlugin`** registered in `SectionEditorBlock`. Reads pending edits from workspace state, renders decorations by change type and parent node context (paragraph vs. table cell). Dispatches accept/reject to workspace. Maps decorations through every transaction to keep positions correct as the user edits.
2. **Decoration styling:** amber-left-border + muted opacity for modification source; ghost tinting for proposed content; red-left-border for deletions; table-cell-inline variant for cell modifications. Accept/Reject affordances as widget decorations anchored to each pending change.
3. **Workspace reducer extensions:** `pending_edits` state slot, new action types, `tool_data.state.resolutions` sync side effect via `persistToolDataState`.
4. **Chat changes:** Replace `DiffPreview` rendering with `EditSummaryCard`. Remove `insertChainRef` and in-chat per-paragraph acceptance flow. Fix scroll bug.
5. **Section focus/scroll on tool result:** when `propose_edit` result arrives, editor scrolls target section into view. Same trigger fires from "Review in editor →".
6. **`check_regulatory_compliance` integration path:** extend `ComplianceIssue` in `chat.ts` with optional `changes?: ProposeEditChange[]`. Compliance cards with suggested fixes render "Review suggested fix" → materializes ghosts via `SET_PENDING_EDITS`. `compliance_flags` JSONB column and `ComplianceFlagList` untouched.
7. **Cleanup:** delete `DiffPreview.tsx`, remove `insertChainRef` from `AIChatPanel.tsx`, verify `applyParagraphPatch` is no longer called from chat.

### Part A Open Questions for Discuss

1. **Decoration update lifecycle.** When the user edits the document while pending edits exist, the plugin must recompute decoration positions via transaction mapping. What's the lift, and are there edge cases (e.g., user deletes a paragraph a ghost is anchored to)?

2. **Ghost-anchor staleness.** If the user edits or deletes the existing paragraph that a pending modification or deletion targets *before* resolving the ghost, what happens? Options: (a) auto-reject the stale change with a notice in the summary card, (b) show the ghost in a "stale" state with disabled Accept, (c) best-effort relocation. Recommendation is (a) — confirm.

3. **Decoration accept/reject UI density.** With 5 pending changes in a section, there are 5 sets of Accept/Reject affordances visible simultaneously. Is that manageable, or should the plugin render a single floating action bar that operates on the currently-focused ghost? Decide based on what the TipTap layout can support without crowding.

4. **`tool_data.state.resolutions` write granularity.** Each Accept/Reject triggers a DB write. For a 5-change set with rapid review, that's 5 writes. Acceptable? Or batch with a short debounce?

5. **Summary card terminal state.** Once all changes are accepted or rejected, the card transitions to a final state ("Accepted 4 of 5 changes"). The "Review in editor →" affordance hides. Is this the intended terminal state?

6. **Multiple concurrent edit sets.** Can the user have pending edits in two sections simultaneously? `pending_edits` on `SectionEditorState` already scopes per-section, so this may just work — verify the chat summary cards handle two in-flight cards cleanly.

7. **Decoration styling for accessibility.** Color alone (amber/red borders) is insufficient. Decorations need iconographic or label-based distinction. What does the existing design system offer?

### Part A Acceptance Criteria

- User issues a `propose_edit` request in chat. Editor scrolls to target section and renders ghost paragraphs inline with Accept/Reject affordances. Chat shows `EditSummaryCard`, not a diff.
- Accept commits the change as one ProseMirror transaction. No scroll-to-bottom in chat. Summary card tally updates.
- Reject removes the decoration. Section content untouched. Summary card tally updates.
- Accepting changes in any order produces document content matching the AI's intended structure — no reversed paragraphs, no misplaced inserts.
- Modifications display as muted-amber-bordered original + ghost replacement below. Table cell modifications display as inline replacement.
- Ghost content never appears in `editor.getHTML()`. Autosave is unaffected by ghost presence.
- Closing and reopening the tab preserves the summary card with full resolution history. Remaining pending changes not auto-rendered in editor; recoverable via "Review in editor →".
- Scroll bug fix means `ask_user` answers and `check_regulatory_compliance` dismissals no longer jump chat to the bottom.
- Editing the doc in unrelated areas while ghosts are pending does not displace or break ghost decorations. Editing/deleting a ghost's anchor paragraph triggers the agreed staleness behavior.

---

## Part B — Proactive Co-pilot

### Architectural Decisions (Inherited — Not for Re-debate)

1. **`chat_sessions` table is the state store for all co-pilot behavior.** `active_task`, `pending_actions`, `resolved_items` were created in 14.1 — this phase writes to all of them.
2. **Haiku 4.5 for all proactive analysis.** Background gap/conflict detection, action queue generation, routing decisions. Sonnet only when the user explicitly requests drafting or a tool call that requires it.
3. **`ask_user` is the multi-turn primitive.** Walkthroughs are a sequence of `ask_user` + `propose_edit` tool calls driven by the AI. No custom walkthrough state machine outside of `chat_sessions.active_task`.
4. **Resume-on-reload is non-negotiable.** Any in-progress task must survive a full page refresh. `active_task` JSONB in `chat_sessions` is the checkpoint.
5. **Action queue is server-generated, not client-generated.** `detectGaps()` in `chatContext.ts` is retired in favor of server-side Haiku analysis. The queue lives in `chat_sessions.pending_actions`.

### Part B Deliverables

#### 1. Action Queue UI

When the panel expands, instead of an empty message list, show a prioritized action queue:
- Each item: title, 1-line description, action type badge (`gap` / `conflict` / `compliance` / `missing`), primary CTA button ("Draft it" / "Fix it" / "Check it")
- Empty state: "Your proposal looks complete — ask me anything below"
- Clicking a CTA triggers the appropriate tool call as if the user had typed the request
- Free-text input available below the queue at all times

Action item data structure (stored in `chat_sessions.pending_actions`):
```json
[
  {
    "id": "uuid",
    "type": "gap | conflict | compliance | missing",
    "section_key": "string",
    "title": "string",
    "description": "string",
    "priority": 1,
    "cta_label": "string",
    "cta_tool": "propose_edit | check_regulatory_compliance | answer_with_citations",
    "cta_payload": {}
  }
]
```

**Open question for discuss:** Where does the action queue render — above the chat history, or as a separate tab? Above-history keeps context visible; a tab separates concerns more cleanly.

#### 2. Proactive Gap and Conflict Detection

**Trigger:** On section save/update (debounced ~3 seconds after last keystroke).

**Analysis (Haiku 4.5):**
- Thin/placeholder detection — replaces client-side `detectGaps()`
- Cross-section conflict detection (e.g., budget says 6 months, timeline says 12)
- Missing-but-implied content detection
- Fast compliance signals (not a full compliance check)

**Results:** Written to `chat_sessions.pending_actions`. Panel updates reactively when new actions arrive.

**Architecture options (open question for discuss):**
- **Option A — New edge function `analyze-proposal-gaps`:** Called from frontend after each section save. Recommended.
- **Option B — Database trigger / webhook:** More robust but adds infrastructure complexity.
- **Option C — Inline with section save:** Simplest but blocks save response on AI latency.

#### 3. Multi-Turn Section Walkthroughs

**Walkthrough flow:**
1. AI calls `set_focus` to lock attention on the target section
2. AI calls `ask_user` with clarifying questions
3. For each answer, AI may ask follow-up or proceed to drafting
4. AI calls `propose_edit` — user accepts/rejects paragraphs **inline in the editor** (via the Part A mechanism)
5. When all paragraphs are confirmed, AI marks the task complete

**State management (`chat_sessions.active_task`):**
```json
{
  "type": "walkthrough",
  "section_key": "string",
  "stage": "gathering_inputs | drafting | complete",
  "collected_inputs": { "primary_endpoint": "...", "phase": "..." },
  "pending_paragraph_ids": ["p1", "p2"],
  "accepted_paragraph_ids": ["p3"]
}
```
Note: `pending_paragraph_ids` here refers to change IDs tracked in `tool_data.state.resolutions`, not TipTap doc UUIDs. The editor does not read `active_task` directly.

**UI while walkthrough is active:**
- Panel header: "Working on: {section_title}" with progress indicator
- Action queue collapses
- "Cancel task" affordance always visible

#### 4. Resume-on-Reload

**On `AIChatPanel` mount:**
1. Fetch `chat_sessions` row for the current proposal
2. If `active_task` is non-null and stage is not `complete`:
   - Resume banner: "You were drafting {section_title} — continue where you left off?"
   - "Continue" → re-render last `ask_user` card or show `EditSummaryCard` for any unresolved ghosts
   - "Start over" → clear `active_task`, re-run gap detection

**Open question for discuss:** Should "continue" re-play the last AI message from DB or send a fresh `continue` message to the edge function?

#### 5. Retire Client-Side `detectGaps()`

- `detectGaps()` in `src/utils/chatContext.ts` removed (or kept as dev-only fallback)
- Gap injection in `AIChatPanel.tsx` (`injectGapMessages()`, `gapMessagesInjected`, `injectedGapCountRef`) removed
- `gapCount` prop and `onGapsConsumed` callback removed from `AIChatPanel` props
- `SpectrumSparkle` badge driven by `chat_sessions.pending_actions.length`

#### 6. Persistent Gap Messages

Gap messages from the action queue that surface as chat messages are stored in `proposal_chats` with `message_type: 'gap'`. (Was listed as 14.1 scope; belongs here since the gap source is being replaced.)

#### 7. Section-Scoped Threads Decision

Stay proposal-scoped, but add a section filter chip row above message history. Filter is cosmetic — all messages stored together, filter hides messages whose `section_target_id` doesn't match.

**Open question for discuss:** Worth the implementation cost, or is history short enough in practice?

### Part B Open Questions for Discuss

1. **Action queue placement.** Above history or separate tab?

2. **Proactive detection trigger.** After every section save, or on-demand when panel opens?

3. **Resume-on-reload: re-play vs. fresh call.** Reconstruct last state from DB, or send a fresh `continue` message?

4. **`ask_user` serialization for resume.** Should the full `ask_user` tool output be stored in `proposal_chats`? Or derived from `active_task.pending_questions`?

5. **Concurrent sessions.** Can two users on the same org work on the same proposal simultaneously? `chat_sessions` has one row per proposal — their actions would overwrite each other's `active_task`.

6. **Walkthrough cancel UX.** If the user cancels mid-way, what happens to partially accepted paragraph edits (already applied via Part A)? Restore original content, or leave accepted edits in place and just stop the walkthrough?

7. **Stale action queue.** If the user manually fixes a gap without using the AI, the queue item should clear. Options: (a) re-run Haiku analysis after each section save, (b) mark items as `manually_resolved` on significant content change, (c) user manually dismisses.

8. **Action queue ordering.** Who assigns priority? Type-based (`compliance > conflict > gap > missing`) or Haiku-scored?

9. **Queue item cap.** Show all items, or cap at N with "X more"? A 20-section proposal with all thin sections could produce a very long queue.

10. **Section-scoped thread filter.** Worth building, or defer to user feedback?

### Part B Acceptance Criteria

- Panel opens to an action queue with at least one item when the proposal has detectable gaps or conflicts. Empty state renders correctly.
- Clicking a queue CTA fires the appropriate tool call and result appears in chat.
- Haiku-detected cross-section conflict surfaces in the queue within 5 seconds of section save.
- "Draft from protocol" walkthrough: AI asks at least 2 clarifying questions via `ask_user`, then calls `propose_edit` with a paragraph-level draft — which renders as inline ghosts in the editor (Part A mechanism).
- Walkthrough state survives a full page refresh. Resume banner appears; "Continue" re-renders the last unanswered `ask_user` card.
- `detectGaps()` no longer called in production path. Gap badge driven by `chat_sessions.pending_actions.length`.
- Gap messages persisted to `proposal_chats`, survive reload.
- Canceling a walkthrough leaves accepted paragraph edits in place and clears `active_task`.
- `gapCount` prop and `onGapsConsumed` callback removed from `AIChatPanel` props signature.

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Decoration positions desync from document on rapid edits | Medium | Plugin must map decorations through every transaction's mapping — standard ProseMirror pattern, but must be specified explicitly in the plan |
| Reducer sync side effect creates a write storm (5 accepts → 5 DB writes) | Low | Profile during implementation; debounce if needed |
| TipTap 3.x has fewer community references for decoration plugin development than 2.x | Medium | Prototype the plugin against a minimal case (one insertion decoration, no styling) first; build styling on top of working skeleton |
| "Review in editor →" re-materialization is a different code path than initial materialization | Medium | Ensure both paths funnel through a single `materializePendingEdits(changes, resolutions)` entry point |
| Proactive Haiku analysis on every section save adds 1–3s latency | Medium | Fire-and-forget; update `pending_actions` async; panel subscribes for updates |
| `active_task` state diverges from editor state if user edits outside the walkthrough | Medium | At walkthrough resume, re-validate `pending_paragraph_ids` against `tool_data.state.resolutions`; if stale, offer restart |
| Cross-section conflict detection context window cost | Low | Send summaries only (first 300 chars each), not full content |
| Resume-on-reload causes confusing UX if `active_task` is months-old | Low | Auto-expire `active_task` if `last_updated` > 7 days |
| `detectGaps()` removal leaves no fallback if server-side detection is slow | Medium | Keep `detectGaps()` as client-side fallback behind feature flag; retire in follow-up cleanup |

---

## Files to Touch

| File | Change |
|---|---|
| `src/components/editor/SectionEditorBlock.tsx` | Register `PendingEditsPlugin`; wire section focus/scroll trigger |
| `src/components/AIChatPanel.tsx` | Replace `DiffPreview` with `EditSummaryCard`; remove `insertChainRef` and gap injection; fix scroll bug; add action queue section, resume banner, `active_task` status indicator |
| `src/context/SectionWorkspaceContext.tsx` | New `pending_edits` slot; new reducer actions; `tool_data.state.resolutions` sync side effect |
| `src/types/workspace.ts` | `SectionEditorState` shape; new action types; `PendingEdit` type |
| `src/types/chat.ts` | `ComplianceIssue.changes` optional field; new action queue item type; `active_task` types |
| `src/utils/chatContext.ts` | Remove or deprecate `detectGaps()`; adjust `buildContextPayload` to include `active_task` |
| `src/components/Sidebar.tsx` | Remove `gapCount`/`onGapsConsumed` from `AIChatPanel`; subscribe to `chat_sessions` for `pending_actions` count |
| `supabase/functions/chat-with-jamo/index.ts` | Read `active_task` from `chat_sessions` on each call for walkthrough continuation |

## Files to Create

| File | Purpose |
|---|---|
| `src/editor/plugins/pendingEdits/PendingEditsPlugin.ts` | ProseMirror plugin: holds change set in plugin state, renders decorations, dispatches accept/reject to workspace |
| `src/editor/plugins/pendingEdits/decorations.tsx` | Decoration construction: node decorations for source paragraphs, widget decorations for ghost content and affordances, table-cell-inline variant |
| `src/components/chat/EditSummaryCard.tsx` | Replaces `DiffPreview`; summary card with tally, expanded change list, "Review in editor →" affordance |
| `supabase/functions/analyze-proposal-gaps/index.ts` | Haiku-powered gap/conflict/missing content analysis; writes `pending_actions` |
| `src/components/chat/ActionQueue.tsx` | Prioritized action queue component |
| `src/components/chat/ActionItem.tsx` | Single queue item with CTA |
| `src/components/chat/ResumeTaskBanner.tsx` | Resume-on-reload prompt card |
| `src/components/chat/WalkthroughProgress.tsx` | Progress indicator while `active_task` is set |

## Files to Delete

| File | Reason |
|---|---|
| `src/components/chat/DiffPreview.tsx` | Replaced by `EditSummaryCard` + inline editor ghosts |

---

## Dependencies on 14.1

- [x] `chat_sessions` table exists with correct schema
- [x] `ask_user` tool implemented and rendering correctly
- [x] `set_focus` tool writes `current_focus_section` to `chat_sessions`
- [x] `tool_data` column on `proposal_chats` enables structured persistence
- [x] Multi-model routing infrastructure (Haiku client available in edge functions)
- [x] Paragraph-level diff working end-to-end (14.1's `DiffPreview` approach is the starting point Part A replaces)
