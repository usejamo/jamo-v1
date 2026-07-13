# Phase 14.1 — AI Chat Foundation
_Context doc for /gsd-discuss-phase. Do not generate plans until discuss is complete._

---

## Goal

Replace the current fragile, free-text AI chat with a structured tool-use architecture. After this phase the chat is dramatically more capable and reliable: the AI executes defined tools (edit, answer with citations, compliance check, focus, ask), paragraph-level diffs replace full-section replacement, citations are rendered as structured UI chips, and RAG is available to every tool call — not just explain/rag intents.

This phase ships independently and is immediately usable. It is the foundation Phase 14.2 builds on.

---

## Non-Goals (explicit)

- Action queue UI and proactive gap surfacing → 14.2
- Multi-turn walkthroughs and resume-on-reload → 14.2
- Section-scoped thread filtering → 14.2
- Any new proposal generation or export features

---

## Background and Current State

Full technical analysis: `docs/ai-chat-overhaul-analysis.md`

Summary of critical current problems:

1. **Intent detection is keyword matching.** `RAG_KEYWORDS`, `EXPLAIN_KEYWORDS`, `EDIT_KEYWORDS` arrays. "update me on the status" → `edit` intent. Fragile and unmaintainable.
2. **Edit intent has no RAG access.** The AI rewrites sections with no knowledge of the RFP/protocol it should match. This was a timeout workaround, not a design choice.
3. **Edit = full section replacement.** `handle.setContent(html)` — the entire section is overwritten, no diff, no undo within chat.
4. **Citations interface never used.** `ChatMessage.citations[]` exists in the type but nothing populates it.
5. **Section titles sent as snake_case keys.** The AI reasons with `study_overview`, not "Study Overview".
6. **History budget is character-based (8000 chars ≈ 2000 tokens).** Underestimates available context; a single HTML rewrite consumes it.

---

## Architectural Decisions (Inherited — Not for Re-debate)

1. **Structured tool use replaces keyword intent detection.** Single tool-use system prompt, `tools[]` + `tool_choice: 'auto'`. Edge function no longer parses free text to infer behavior.
2. **Diff-based edits at paragraph granularity.** No more `setContent()`. Edits return structured patches; UI renders per-paragraph accept/reject.
3. **Multi-model routing.** Haiku 4.5 for classification and lightweight decisions; Sonnet 4.6 for drafting, edits, and reasoning-heavy tool calls.
4. **Explicit session state via `chat_sessions` table.** Not derived per-message. Created here; fully exercised in 14.2.
5. **RAG available to every tool call.** The "rag/explain only" gate is dropped. K values tuned per tool to manage latency.
6. **14.1 ships usable on its own.** 14.2 is additive.

---

## Deliverables Checklist

### 1. Tool Schemas — Define All Five

All tool schemas must be specified (input and output JSON) in this phase even if some tools are primarily exercised in 14.2.

**`propose_edit`**
- Purpose: Return a paragraph-level diff for a section.
- When called: User asks to expand, rewrite, shorten, change tone, or add content to a section.
- Input schema (proposed):
  ```json
  {
    "section_key": "string",
    "overall_summary": "string",
    "changes": [
      {
        "paragraph_id": "string",
        "before_html": "string",
        "after_html": "string",
        "change_summary": "string"
      }
    ]
  }
  ```
- UI: Renders inline diff bubbles per paragraph, each with Accept / Reject. Accepted paragraphs apply immediately; rejecting one doesn't affect others.
- Open question: Does the tool return full replacement paragraphs, or an actual semantic diff? The simpler path is before/after pairs.

**`answer_with_citations`**
- Purpose: Answer regulatory, factual, or sourced questions with structured citations.
- When called: User asks "according to the protocol…", "explain where…", "what does the RFP say about…"
- Input schema (proposed):
  ```json
  {
    "answer": "string (markdown)",
    "citations": [
      {
        "source_doc": "string",
        "chunk_id": "string",
        "passage": "string (short verbatim quote, ≤ 120 chars)"
      }
    ]
  }
  ```
- UI: Renders answer as markdown. Citations rendered as chips below the message. Populate `ChatMessage.citations[]` (field already exists in the type).

**`ask_user`**
- Purpose: Model gathers information from the user mid-task. Used by walkthroughs (14.2) but schema must exist here.
- When called: Model needs a clarification before it can produce a useful edit (e.g., "Which primary endpoint should I use?").
- Input schema (proposed):
  ```json
  {
    "question": "string",
    "options": ["string"],
    "allow_free_text": true,
    "task_context": "string"
  }
  ```
- UI: Renders as a focused prompt card (distinct from normal chat bubble). Options render as clickable chips.

**`set_focus`**
- Purpose: Model declares which section it is currently working on. Drives UI highlighting.
- When called: At the start of an edit or walkthrough, or when switching sections.
- Input schema (proposed):
  ```json
  {
    "section_key": "string",
    "reason": "string"
  }
  ```
- Side effect: Writes `chat_sessions.current_focus_section`. Can trigger section highlighting in the editor.

**`check_regulatory_compliance`**
- Purpose: Structured compliance check for a section against retrieved regulatory docs.
- When called: User asks "is this compliant?" or proactively after an edit.
- Input schema (proposed):
  ```json
  {
    "section_key": "string",
    "passes": true,
    "issues": [
      {
        "rule": "string",
        "severity": "error | warning | info",
        "excerpt": "string",
        "suggested_fix": "string"
      }
    ],
    "regulatory_sources": ["string"]
  }
  ```
- Integration: Writes results back to `proposal_sections.compliance_flags` JSONB (column already exists). Does NOT create a parallel mechanism — this replaces whatever currently writes compliance flags.
- UI: Renders a compliance summary card. Issues shown with severity color coding. Each issue has a "Fix it" shortcut that triggers `propose_edit`.

### 2. `chat-with-jamo` Edge Function — Tool Use Migration

- Replace `detectIntent()`, `buildSystemPrompt()`, and `RAG_KEYWORDS` / `EXPLAIN_KEYWORDS` / `EDIT_KEYWORDS` with a single system prompt that describes the toolset and when to use each.
- Streaming logic updated to handle both `text` content blocks AND `tool_use` content blocks from the Anthropic stream.
- Multi-model routing: Sonnet 4.6 for all tool-use calls (Haiku used in 14.2 for proactive detection — not needed for main chat in 14.1).
- RAG runs in parallel with any pre-processing, not sequentially. K values:
  - `propose_edit`: K=5 regulatory + K=5 proposal
  - `answer_with_citations`: K=5 regulatory + K=5 proposal
  - `check_regulatory_compliance`: K=5 regulatory + K=2 proposal
  - `ask_user`: skip retrieval
  - `set_focus`: skip retrieval
- The `intent_hint` field and client-side intent detection logic (`intentHint` in `handleSubmit`) are removed.

### 3. Paragraph-Level Diff Infrastructure — HIGH RISK

This is the highest-risk technical area. Needs explicit design decisions before implementation:

**Problem:** TipTap stores content as ProseMirror JSON and renders as HTML. To apply a paragraph-level diff, the client needs stable IDs per paragraph node so the AI can reference a specific paragraph and the client can locate and replace it without touching adjacent paragraphs.

**Option A — TipTap `UniqueID` extension:** TipTap has a built-in `@tiptap/extension-unique-id` extension that automatically assigns a UUID to each node. IDs survive node edits (they're attributes, not content). This is the cleanest path.

**Option B — `data-paragraph-id` in serialized HTML:** When content is serialized (saved to DB), inject `data-paragraph-id` attributes via a custom serializer. Fragile if content is re-serialized without preserving attributes.

**Option C — Content hash IDs:** Generate IDs client-side by hashing paragraph content. Breaks immediately when paragraph content changes — unusable for diffs.

**Recommendation to validate in discuss:** Option A (UniqueID extension). The plan needs to address:
- How paragraph IDs are added to existing sections (retroactively on load, or only on new content).
- How the AI receives paragraph IDs (sent in the `target_section.content` payload — nodes need IDs before the call is made).
- How accepted changes are applied without a full `setContent()` — requires a ProseMirror transaction that targets a specific node by ID.
- What happens if the AI returns a `paragraph_id` that no longer exists (user edited the section mid-stream).

### 4. Citations End-to-End

- `retrieve-context` already returns `chunk_id` and `source` on each chunk.
- Pass chunk metadata through to the `answer_with_citations` tool's result.
- Frontend: `ChatMessage.citations[]` populated from tool result. Render as small source chips below the message bubble. Clicking a chip could show the full passage in a tooltip.
- Persistence: `proposal_chats` needs to store citations so they survive reload. See §9 (Persistence).

### 5. `chat_sessions` Table

New table. One row per proposal. RLS: org-scoped (`org_id = auth.jwt()->>'org_id'`).

Proposed schema:
```sql
CREATE TABLE chat_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     uuid NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL,
  -- 14.1 active fields:
  current_focus_section  text,
  -- 14.2 fields (created now, unused until 14.2):
  active_task     jsonb DEFAULT NULL,
  pending_actions jsonb DEFAULT '[]'::jsonb,
  resolved_items  jsonb DEFAULT '[]'::jsonb,
  last_updated    timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX chat_sessions_proposal_id_idx ON chat_sessions (proposal_id);
```

The edge function reads/writes this via service role. Frontend reads `current_focus_section` via client.

### 6. Section Title Mapping

Build a `sectionKeyToTitle(key: string): string` utility that maps `section_key` → human-readable title. Source of truth options (open question for discuss — see §Open Questions).

Used in:
- `buildContextPayload()` — `target_section.title` and `other_sections[].title` sent to AI
- Gap message formatting — `formatGapMessage` currently shows `gap.sectionTitle` which is the raw key
- Any tool result that references a section

### 7. RAG Available to All Tool Calls

- Remove the `if (intent === 'rag' || intent === 'explain')` gate from `chat-with-jamo`.
- Move to a per-tool K configuration:
  ```typescript
  const RAG_K: Record<string, { regulatory: number; proposal: number }> = {
    propose_edit:               { regulatory: 5, proposal: 5 },
    answer_with_citations:      { regulatory: 5, proposal: 5 },
    check_regulatory_compliance:{ regulatory: 5, proposal: 2 },
    ask_user:                   { regulatory: 0, proposal: 0 },
    set_focus:                  { regulatory: 0, proposal: 0 },
  }
  ```
- For the `propose_edit` case specifically, the regulatory context goes into the system prompt so the AI knows what the edited section must comply with — this is what was completely missing before.
- Retrieval runs in parallel with any synchronous pre-processing to minimize added latency.
- Open question: Do we pre-classify which tool the user likely needs (Haiku pre-call) to decide K before the main call? Or always run at max K and eat the latency?

### 8. AIChatPanel.tsx — UI Updates

Changes required:
- Replace `ChatEditPreview` component with a `DiffPreview` component that renders per-paragraph accept/reject.
- Add `CitationsBlock` component to render `ChatMessage.citations[]` as chips.
- Add `ComplianceCard` component to render `check_regulatory_compliance` results.
- Add `AskUserCard` component to render `ask_user` prompts (styled distinctly from normal chat bubbles).
- Remove `currentIntent` state, `_currentIntent` alias, `isStreaming`-based intent-conditional rendering.
- Message type expansion: current `messageType: 'chat' | 'gap' | 'explain' | 'edit-proposal'` needs new variants for tool results.
- The streaming bubble logic needs to handle tool_use content blocks (which have no text delta to display while processing — show thinking indicator until tool result arrives).
- `activeSectionKey` still used for default target section, but `set_focus` tool calls can update the focused section independently.

### 9. Persistence Design for Tool Results

Tool call results need to survive reload with enough fidelity to reconstruct the UI. Options (for discuss):

**Option A — `tool_data jsonb` column on `proposal_chats`:** Add a nullable JSONB column. For tool result messages, serialize the full tool output here (citations array, diff patches, compliance issues). `content` column stores the human-readable summary. On reload, `tool_data` drives full UI reconstruction.

**Option B — Separate `proposal_chat_tools` table:** Normalized. More complex schema migration. Probably overkill for v1.

**Option C — Store serialized JSON in `content`, new `message_type` values:** `message_type: 'tool-propose-edit'`, `'tool-answer-cited'`, etc. UI deserializes `content` based on `message_type`. Hacky but zero migration cost.

Recommendation to validate: Option A. The `tool_data` column cleanly separates machine-readable state from display text.

**Gap messages:** Currently ephemeral. In 14.1, store them in `proposal_chats` with `message_type: 'gap'` so they survive reload. (This is a small scope item that fits naturally here.)

### 10. Dead Code Cleanup

Remove from `chat-with-jamo/index.ts`:
- `RAG_KEYWORDS`, `EXPLAIN_KEYWORDS`, `EDIT_KEYWORDS` arrays
- `detectIntent()` function
- `buildSystemPrompt()` function (replaced by tool-use system prompt)
- `intent_hint` field handling

Remove from `AIChatPanel.tsx`:
- `currentIntent` state and `_currentIntent` alias
- `ChatEditPreview` component (superseded by `DiffPreview`)
- The `edit-proposal → chat` message_type remapping on history load
- Client-side `intentHint` derivation (`text.toLowerCase().includes('explain')`)
- `messageType: 'edit-proposal'` handling in render

Remove from `chatContext.ts`:
- No removals, but `buildContextPayload` needs reshaping to include paragraph IDs in section content

---

## Open Questions for Discuss

These are explicitly unresolved. Do not guess — bring them to the discuss phase.

1. **Section title source of truth.** Where does `sectionKeyToTitle()` get its data? Options: (a) hardcoded map in `chatContext.ts`, (b) template definition fetched from DB, (c) passed as a new prop from the parent (which already has template metadata). The parent likely already has this — check before adding DB roundtrips.

2. **TipTap paragraph ID strategy.** Is `@tiptap/extension-unique-id` already installed? If not, confirm it's compatible with the current TipTap version and the existing editor setup. What happens to sections generated before this phase — do they get IDs retroactively on first load, or only when next edited?

3. **Partial diff application.** When a `propose_edit` result arrives with 3 paragraph changes and the user accepts paragraph 2 but rejects 1 and 3, what is the canonical state? Does the chat session know that paragraph 2 was accepted so a follow-up "now expand that" call doesn't re-propose it?

4. **Tool call persistence granularity.** Should the raw Anthropic tool_use blocks (model's tool invocation) be stored alongside the tool result, or just the result? Storing both is more debuggable but doubles the rows.

5. **Single vs. multi-tool per turn.** Can the model call multiple tools in one response (e.g., `set_focus` then `propose_edit`)? Claude supports parallel tool calls. Does the UI need to handle a response that contains both a `set_focus` result and a `propose_edit` diff in the same turn?

6. **`check_regulatory_compliance` and `compliance_flags`.** The `compliance_flags` JSONB on `proposal_sections` — what is currently writing to it? Confirm the existing schema before this tool writes to it. Does writing a compliance check result here trigger any existing UI (yellow indicators, etc.) or is that all in-memory state?

7. **K=0 for `ask_user` and `set_focus` — correct?** These tools don't need retrieved context. Confirm there's no edge case where `ask_user` would benefit from having regulatory context (e.g., asking "which ICH guideline applies here?").

8. **Streaming tool results.** Anthropic streams tool_use blocks as `input_json_delta` events. The frontend currently only handles `text_delta`. What is the streaming UX for a tool call — show a thinking indicator until the full tool input JSON is received, then render the result? Or try to progressively render as JSON arrives?

9. **History window token budget.** Current: 8000 chars. Proposed upgrade: estimate `chars / 3.5 ≈ tokens`, target 12k tokens for history. But with tool results potentially being large JSON blobs, should tool results be compressed/summarized when added to history? Or excluded from history and re-derived if needed?

10. **Model for tool calls.** The decision says Sonnet 4.6 for main chat tool calls. Is there a case for Haiku handling `set_focus` and `ask_user` calls (which don't need drafting quality) to reduce cost and latency?

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| TipTap paragraph IDs — retroactive assignment breaks existing sections | High | Design the ID assignment to be additive and non-destructive; IDs as TipTap node attributes don't affect content |
| TipTap paragraph IDs — `UniqueID` extension not compatible with current setup | High | Verify version compatibility before planning; have Option B (serialized `data-paragraph-id`) as fallback |
| Diff application corrupts TipTap doc if `paragraph_id` not found | Medium | Client validates all `paragraph_id` values against current doc before accepting a `propose_edit` result; show user error if stale |
| Streaming tool_use blocks: `input_json_delta` events require JSON accumulation before rendering | Medium | Buffer full JSON on client; show thinking indicator. Don't try to progressively render partial JSON |
| Supabase edge function timeout on parallel RAG + Sonnet call | Medium | Measure baseline latency; the parallel (not sequential) retrieval pattern should help vs. current sequential. Have K fallback |
| Multi-tool response (e.g., `set_focus` + `propose_edit` in one turn) causes render ordering issues | Low | Handle tool results in arrival order; `set_focus` side-effects apply immediately, `propose_edit` renders after |
| Compliance flags schema conflict with existing writer | Medium | Audit what currently writes `compliance_flags` before implementing the tool — may need to merge schemas |

---

## Files to Touch

| File | Change Type |
|---|---|
| `supabase/functions/chat-with-jamo/index.ts` | Substantial rewrite — tool use, multi-model routing, RAG for all |
| `supabase/functions/retrieve-context/index.ts` | Extend to accept `k_regulatory` / `k_proposal` params |
| `src/components/AIChatPanel.tsx` | Substantial rewrite — new message types, diff UI, citations, streaming update |
| `src/utils/chatContext.ts` | Reshape `buildContextPayload` to include paragraph IDs; add `sectionKeyToTitle` |
| `src/types/chat.ts` | New tool-use message types, expanded `ChatMessage` variants |
| `src/components/Sidebar.tsx` | Props update to pass section title metadata; read `chat_sessions.current_focus_section` |
| TipTap editor wrapper (confirm path) | Add `UniqueID` extension (or equivalent paragraph ID strategy) |

## Files to Create

| File | Purpose |
|---|---|
| `supabase/functions/chat-with-jamo/tools/propose-edit.ts` | Tool schema + system prompt fragment |
| `supabase/functions/chat-with-jamo/tools/answer-with-citations.ts` | Tool schema + system prompt fragment |
| `supabase/functions/chat-with-jamo/tools/ask-user.ts` | Tool schema + system prompt fragment |
| `supabase/functions/chat-with-jamo/tools/set-focus.ts` | Tool schema + system prompt fragment |
| `supabase/functions/chat-with-jamo/tools/check-regulatory-compliance.ts` | Tool schema + system prompt fragment |
| `src/components/chat/DiffPreview.tsx` | Per-paragraph diff accept/reject component |
| `src/components/chat/CitationsBlock.tsx` | Citation chips renderer |
| `src/components/chat/ComplianceCard.tsx` | Compliance check result card |
| `src/components/chat/AskUserCard.tsx` | ask_user prompt card (distinct from chat bubble) |
| DB migration | `chat_sessions` table + `tool_data` column on `proposal_chats` |

---

## Acceptance Criteria

- [ ] User can ask "expand this section" and receive a paragraph-level diff with individual accept/reject per paragraph. Accepting one paragraph does not affect others.
- [ ] User can ask "is this compliant with the protocol?" and receive a structured compliance result that (a) renders in the chat and (b) updates `proposal_sections.compliance_flags`.
- [ ] User can ask "according to the RFP, what's the budget limit?" and receive an answer with source citations rendered as chips.
- [ ] The AI receives section titles as "Study Overview" not "study_overview" in its responses.
- [ ] Chat history (including citations and diff results) survives page reload with full UI reconstruction.
- [ ] RAG context is available for `propose_edit` calls (verifiable by checking edge function logs — regulatory context block should appear in system prompt).
- [ ] No keyword arrays (`RAG_KEYWORDS` etc.) remain in the codebase.
- [ ] The `currentIntent` / `_currentIntent` lint workaround is gone.
- [ ] `chat_sessions` table exists with correct schema and RLS. `current_focus_section` is updated when the AI calls `set_focus`.
- [ ] All 5 tool schemas are implemented and exercisable, even if `ask_user` is only tested via a direct prompt ("What do you need to know to draft this section?").
