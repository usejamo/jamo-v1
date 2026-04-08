# Phase 9: Jamo AI Chat Panel - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30
**Phase:** 09-jamo-ai-chat-panel
**Areas discussed:** Gap Surfacing UX, Edit Proposal Flow, Context Building, Explain This Section

---

## Gap Surfacing UX

### Q: How should Jamo surface gaps after generation completes?

| Option | Description | Selected |
|--------|-------------|----------|
| Sequential Jamo messages | One message per gap, staggered, each ending in a direct question with chips | ✓ |
| Single summary message | One message listing all gaps found | |
| Proactive chips only | Gap-specific chips, no messages | |

**User's choice:** Sequential messages, capped at 3. Each ends in a direct question. Optional shortcut chips attached to each message. If >3 gaps, third message consolidates remainder: "there are also a few smaller gaps — want me to walk through those next?"

---

### Q: Should the panel auto-open when gaps are found?

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-open panel | Panel expands automatically when gaps are found | |
| Pulse the rail icon | Rail icon pulses with badge count. User opens when ready | ✓ |

**User's choice:** Pulse the rail — no auto-open. Auto-opening hijacks the moment the user wants to review what was just generated. A pulsing icon with badge count communicates urgency without taking control away from the writer.

**Notes:** When user opens panel after a pulse, skip the greeting and open mid-context: "I found 3 things worth addressing before you finalize this." Auto-open is only appropriate for blocking errors. Gaps are important but not blocking — treat them with pull, not push.

---

## Edit Proposal Flow

### Q: How should a proposed edit be presented before injecting into the editor?

| Option | Description | Selected |
|--------|-------------|----------|
| Preview in chat, then inject | Stream into chat bubble, Accept/Reject when complete, inject on Accept | ✓ |
| Stream directly into editor | Inject directly during streaming, no preview step | |
| Show a diff in chat | Before/after diff in chat bubble | |

**User's choice:** Preview in chat then inject — consistent with Phase 8. Stream edit into chat bubble, show Accept/Reject when streaming completes. On Accept: snapshot target section → insertContentAt() → undoable Cmd+Z. Chat panel header shows "Editing: Section 4.2" so user knows where content will land. No diff view in chat — that's for version history panel.

**Notes:** "Never stream directly into the editor. That decision was already settled in Phase 8 — editor content is never touched until the user accepts."

---

### Q: What is the default scope of a chat-initiated edit?

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted section only | Edit applies to locked section in header | ✓ |
| Full proposal edits allowed | Multi-section changes in one reply | |

**User's choice:** Targeted section only. Multi-section edits allowed but treated as multiple discrete proposals — one Accept/Reject per section, independent transactions. If Jamo detects cross-section implications, ask first: "This change might also affect Section 6 — want me to update that too?" Jamo asks, never assumes.

---

## Context Building

### Q: What proposal content goes to the Edge Function per message?

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted section + summaries | Full locked section + 200-char summaries of others | ✓ |
| Full proposal, all sections | Complete content of all sections | |
| Targeted section only | Only the locked section | |

**User's choice:** Targeted section + summaries. Section summaries labeled by section title. Strip HTML/TipTap formatting — send plain text. Include section title and type as separate fields. Never inflate every call — handle "full section needed" cases as targeted follow-up fetches.

---

### Q: When should RAG retrieval fire?

| Option | Description | Selected |
|--------|-------------|----------|
| Intent-based RAG | Only when message is about uploaded documents | ✓ |
| Always include RAG | Retrieve on every call | |
| User toggle | Button to enable/disable RAG mode | |

**User's choice:** Intent-based RAG. Detection in Edge Function (not client) via keyword matching: "protocol", "RFP", "SOW", "according to", "based on", "what does the". AI classification only for ambiguous cases. Retrieved chunks labeled separately from section content in context window.

---

### Q: How much chat history is included?

| Option | Description | Selected |
|--------|-------------|----------|
| Last 10 messages | Fixed count sliding window | |
| Token-budget sliding window | ~2000 tokens, walk backwards from most recent | ✓ |
| Full history | Complete history every call | |
| Last 20 messages | Larger fixed count | |

**User's choice:** Token-budget sliding window (~2000 tokens). Not a fixed message count — a token budget. Walk backwards from most recent, include until budget exhausted. Drop whole messages at oldest end, never truncate mid-content. System message and section content are fixed overhead — not part of the budget.

---

## Explain This Section

### Q: How does the user trigger "Explain this section"?

| Option | Description | Selected |
|--------|-------------|----------|
| Quick chip in chat panel | Always-visible chip "Explain this section" | ✓ |
| Button in section toolbar | Added to Phase 8 toolbar | |
| Natural language only | No button, intent detection only | |

**User's choice:** Quick chip in chat panel. Chip visible when section is targeted; hidden when no section locked. Toolbar button is the wrong layer — explain is a read action, not an edit action. Natural language intent detection works in addition to the chip (for discoverability + flexibility).

---

### Q: Where do source references appear?

| Option | Description | Selected |
|--------|-------------|----------|
| Chat bubble with inline doc refs | Explanation + citations in chat | ✓ |
| Inline margin annotations | Annotations in TipTap editor | |
| Side panel / overlay | Separate overlay with source passages | |

**User's choice:** Chat bubble with inline doc refs. Citations reference document name + section/chunk identifier. Quoted passages: 1–2 sentences max. Margin annotations ruled out (non-persistent, unnecessary complexity). Side-by-side overlay deferred as a future phase power feature.

---

## Claude's Discretion

- System prompt structure for `chat-with-jamo`
- Model choice (Sonnet 4.6 vs Haiku for intent detection)
- `proposal_chats` table schema
- Quick chip set beyond "Explain this section"
- Token counting approach for sliding window

## Deferred Ideas

- Margin annotations for source references — belongs in chat, not editor. No durable payoff as TipTap extension.
- Side-by-side source overlay — future phase, only if cross-referencing becomes a heavy user need.
