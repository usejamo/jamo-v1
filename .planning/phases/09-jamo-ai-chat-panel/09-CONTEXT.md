# Phase 9: Jamo AI Chat Panel - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Upgrade the existing `AIChatPanel` component from demo to a live AI assistant. Delivers: a `chat-with-jamo` Supabase Edge Function with streaming responses, proactive gap analysis (surfaced via pulsing rail badge — not auto-open), TipTap edit injection via the Phase 8 accept flow, intent-based RAG for document questions, "Explain this section" source-tracing in chat, and chat history persisted to `proposal_chats`.

Not in scope: DOCX export (Phase 11), template management (Phase 10), new TipTap extensions for margin annotations.

</domain>

<decisions>
## Implementation Decisions

### Gap Surfacing — Proactive Analysis
- **D-01:** After generation completes, gap analysis scans for `[PLACEHOLDER]` markers and thin sections. Results are **not** auto-opened — the chat panel stays collapsed.
- **D-02:** The **rail icon pulses with a badge count** (e.g. "3") to signal gaps exist. CRO writers will open the panel when ready. Auto-open is reserved for blocking errors only — gaps are important but not blocking. Pull, not push.
- **D-03:** When the user opens the panel after a pulse, Jamo **skips the greeting** and opens mid-context: *"I found 3 things worth addressing before you finalize this."* The pulse already set expectations; the opening confirms them.
- **D-04:** Jamo surfaces gaps as **sequential messages, capped at 3**, each ending in a direct question. Each message has optional shortcut chips attached (e.g. "Fill this now", "Skip").
- **D-05:** If more than 3 gaps exist, the **third message consolidates the remainder**: *"There are also a few smaller gaps — want me to walk through those next?"*

### Edit Proposal Flow
- **D-06:** When the user asks Jamo to edit content, Jamo **streams the proposed edit into the chat bubble**. Accept/Reject buttons appear when streaming completes. This is identical to the Phase 8 per-section action pattern — no new mental model.
- **D-07:** On Accept: snapshot the target section → inject via `editorRef.current.commands.insertContentAt()` → undoable with Cmd+Z. Never stream directly into the editor; editor content is never modified until explicit Accept.
- **D-08:** The **chat panel header always shows the active target**: "Editing: Section 4.2 — Adverse Events". The user knows exactly where content will land before they accept.
- **D-09:** Default scope is **targeted section only** — the section currently locked in the panel header. Jamo never touches other sections silently.
- **D-10:** If Jamo detects that a requested edit has cross-section implications, it **asks first**: *"This change might also affect Section 6 — want me to update that too?"* Never expands scope without confirmation.
- **D-11:** Multi-section edits (when explicitly requested) are **multiple discrete proposals** — one preview bubble and one Accept/Reject per section. Never bundle a multi-section change into a single Accept. Each section change is an independent transaction with independent undo.

### Context Building — Edge Function Payload
- **D-12:** Each `chat-with-jamo` call sends:
  - Full plain-text content of the **locked/targeted section** (HTML/TipTap nodes stripped)
  - **Section title and type** of the target as a separate field (not embedded in content)
  - **Truncated summaries** of all other sections (first ~200 chars each), labeled by section title
  - **Chat history** via token-budget sliding window (see D-14)
- **D-13:** Never send full content of all sections on every call. If a specific other section's full content is needed mid-conversation (e.g. "make this consistent with section 6"), that is a targeted follow-up fetch — not a change to the default payload. Build lean, expand on demand.
- **D-14:** Chat history uses a **token-budget sliding window** (budget: ~2000 tokens). Walk backwards from the most recent message, including messages until the budget is exhausted. If a message doesn't fit, drop it entirely — never truncate mid-content. System message and current section content are **fixed overhead**, not part of the sliding window budget.
- **D-15:** RAG retrieval is **intent-based** — fires only when the user's message is about uploaded documents. Intent detection happens **in the Edge Function** (not the client) via keyword matching: "protocol", "RFP", "SOW", "according to", "based on", "what does the". Use AI classification only for genuinely ambiguous cases.
- **D-16:** When RAG fires, retrieved chunks are appended as a **clearly labeled block** separate from section content. The system prompt must explicitly distinguish retrieval chunks from live proposal content.

### "Explain This Section"
- **D-17:** Triggered via a **quick chip** in the chat panel bottom bar: "Explain this section". Chip is visible when a section is targeted; hidden (or replaced with a prompt) when no section is locked.
- **D-18:** Natural language intent ("explain this", "where did this come from") also triggers explain — in addition to the chip, not instead of it. The chip teaches discoverability.
- **D-19:** Output appears as a **chat bubble** with inline doc references. Format: short explanation text with citations inline (e.g. *"This draws from Protocol Section 4.2"*) followed by a 1–2 sentence quoted passage. No margin annotations, no separate overlay panel.
- **D-20:** Citations reference the **source document name and chunk/section identifier**, not just a quoted passage. Keep quoted passages short — enough to confirm the source, not reproduce the document.

### Claude's Discretion
- System prompt structure for `chat-with-jamo` (how proposal context, section summaries, and RAG chunks are assembled)
- Model choice for the chat Edge Function (Sonnet 4.6 is the established pattern for generation; Haiku may be appropriate for intent detection classification)
- `proposal_chats` table schema (columns: `id`, `proposal_id`, `role`, `content`, `created_at`, `section_target_id` at minimum)
- Quick chip set beyond "Explain this section" (context-aware vs. static chips, what replaces the demo `DEMO_COMMANDS`)
- Token counting approach for the sliding window (approximate char-based estimate is acceptable)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing chat component
- `src/components/AIChatPanel.tsx` — Current demo component being upgraded. Has aurora border, rail (collapsed) view, message bubbles, ⌘J toggle, quick chips, thinking indicator, and Framer Motion animations. The UI shell is complete — backend wiring is entirely missing. Do not rebuild the shell; wire it up.

### Phase 8 injection contract (locked decisions)
- `.planning/phases/08-section-workspace-rich-text-editor/08-CONTEXT.md` — D-16 and D-17 define the injection API (`editorRef.current.commands.insertContentAt()`), snapshot-before requirement, and section targeting. Phase 9 is a consumer of this API — follow it exactly.

### Existing Edge Function patterns
- `supabase/functions/extract-assumptions/index.ts` — Establishes Deno Edge Function conventions: `serve()` handler, CORS, Supabase client init, Anthropic streaming pattern, error handling shape.
- `supabase/functions/generate-proposal-section/index.ts` — Streaming SSE pattern used for section generation. `chat-with-jamo` should follow the same streaming approach.
- `supabase/functions/retrieve-context/index.ts` — Existing RAG retrieval function. `chat-with-jamo` calls this when RAG intent is detected.

### Section and proposal types
- `src/types/generation.ts` — `GenerationState`, section keys. Chat panel needs to know section identifiers.
- `cro-proposal-generator.js` — Section names and content expectations. Use for system prompt context in `chat-with-jamo`.

### Schema
- `supabase/migrations/` — Check existing migrations for `proposal_chats` table (none found at discuss time — needs to be created in Phase 9).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/AIChatPanel.tsx` — Full UI shell: aurora border animation, rail/expanded toggle, message list with `AnimatePresence`, thinking indicator (3-dot bounce), quick chips bar, input with send button, ⌘J keyboard shortcut. All of this is complete and should be preserved. Only the `handleSubmit` logic (currently demo/mock) needs to be replaced with real streaming calls.
- `supabase/functions/retrieve-context/index.ts` — RAG retrieval already built. Chat function calls it on intent match.
- `supabase/functions/section-ai-action/index.ts` — Most recent Edge Function (Phase 8). Check for updated Deno/Anthropic patterns before using older functions as reference.

### Established Patterns
- Streaming SSE: Edge Function streams → client reads via `ReadableStream` / `EventSource`. Pattern established in Phase 7 (`generate-proposal-section`) and Phase 8 (`section-ai-action`).
- Accept/Reject preview: Phase 8 `AIActionPreview` component. Phase 9 edit proposals follow the same pattern — stream into preview, accept injects via TipTap command API.
- Context + `useReducer`: `src/context/SectionWorkspaceContext.tsx`. Chat panel state (messages, target section, gap badges) should integrate with or mirror this pattern.
- Aurora border + Framer Motion: already in `AIChatPanel.tsx`. The component's visual identity is established — do not reskin.

### Integration Points
- `SectionWorkspace` / `SectionEditorBlock` — Phase 8 exposed `editorRef` per section for injection. Phase 9 needs to consume this ref. Check how refs are surfaced in `SectionWorkspaceContext`.
- `ProposalDetail` page — Currently renders `AIChatPanel` alongside the editor. Gap analysis trigger should fire from `ProposalDetail` after generation completes (it already has `draftGenerated` state that feeds the panel).

</code_context>

<specifics>
## Specific Ideas

- **Pull not push:** Gap surfacing uses a pulsing badge, not auto-open. The user said: *"Auto-open hijacks the moment the user wants to review what was just generated."* This is a deliberate UX choice, not a default — don't override it.
- **Chat-first read actions:** Explain and source attribution belong in the chat bubble, not in the editor. The Phase 8 toolbar is for actions that produce content that lands in the editor. Explain is a read action.
- **Lean context window:** *"Build the context window lean by default and expand it on demand."* Targeted section + 200-char summaries is the baseline — not full proposal content.
- **No silent scope expansion:** Jamo asks before touching sections outside the target. *"Jamo asks, never assumes."*

</specifics>

<deferred>
## Deferred Ideas

- Margin annotations for source references in TipTap — discussed as an "Explain" output option. Deferred: read/understand output belongs in chat, not the editor. A TipTap extension for non-persistent annotations has no durable payoff at this stage.
- Side-by-side source overlay panel — discussed as an alternative to chat-bubble citations. Deferred: only worth building if users need heavy cross-referencing while editing. Could replace the explain flow in a later phase if needed.

</deferred>

---

*Phase: 09-jamo-ai-chat-panel*
*Context gathered: 2026-03-30*
