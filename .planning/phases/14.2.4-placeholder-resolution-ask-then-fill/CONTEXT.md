# Phase 14.2.4 — Placeholder Resolution (Ask-Then-Fill)

**Gathered:** 2026-06-04 (root-cause brief from live UAT of 14.2.3 — refine in /gsd-discuss-phase)
**Status:** Needs discussion (the fix approach is an open design decision)
_Inserted (URGENT) after Phase 14.2.3. Surfaced by 14.2.3: now that the analyzer reliably flags template placeholders, clicking "Fix it" on them does nothing useful._

---

## Goal

Make a placeholder finding **actionable**. When the analyzer flags an unfilled placeholder (e.g. "Team & Organizational Structure — descriptive-noun placeholder for CRO"), clicking its CTA must lead to the placeholder actually getting filled — which means the co-pilot has to **get the value from the user** (it cannot invent "CRO legal entity name"). Today it silently rewrites the section and leaves the placeholder in place.

This is the **resolution** layer (Phase 14.2 Part B), distinct from 14.2.3's **detection** layer (which works correctly).

---

## Symptom (observed in live UAT, 2026-06-04)

User clicked "Fix it" on a placeholder finding: `[Action: propose_edit] Team & Organizational Structure — descriptive-noun placeholder for CRO`. The agent returned **the same paragraph** ("CRO legal entity name has assembled a…") with the placeholder untouched; it remained highlighted and the finding re-appeared as still-unresolved. It never asked what should go in place of the placeholder.

---

## Root Cause (confirmed in code)

The CTA **force-calls the rewrite tool and bars the agent from asking.**

- `supabase/functions/chat-with-jamo/index.ts:112-122`:
  ```ts
  const forcedToolValid = typeof forced_tool === "string" && tools.some(t => t.name === forced_tool)
  const toolChoice = forcedToolValid
    ? { type: "tool", name: forced_tool }   // ← forces the exact tool
    : { type: "auto" }
  ...
  tool_choice: toolChoice
  ```
- The client sends `forced_tool: 'propose_edit'` for the CTA: `AIChatPanel.tsx:708` (`handleSendMessage(\`[Action: ${action.cta_tool}] …\`, action.cta_payload, action.cta_tool)`) → `:425` passes `forcedTool` into the request body.
- The analyzer hardcodes `cta_tool: 'propose_edit'` for every placeholder gap/missing finding (`analyze-proposal-gaps/index.ts` few-shot examples, Families 1–4).

So Sonnet is **compelled** to call `propose_edit` (a rewrite tool), has **no source** for the placeholder's real value (it's study-/org-specific data only the user has), and is **prevented from calling `ask_user`** (the tool that would obtain it). It regenerates the paragraph, placeholder intact.

The walkthrough machinery to do this right **already exists** in `chat-with-jamo` (`set_focus` → `active_task.stage: 'gathering_inputs'` → `ask_user` → `propose_edit`, see `:177-228` and the `ask_user`/`set_focus` handlers) — the CTA just bypasses it by forcing `propose_edit`.

---

## Candidate Approaches (decide in discuss — NOT yet locked)

1. **Ask-then-fill (recommended).** Placeholder/missing-data findings carry a CTA that routes to `ask_user` (or `set_focus`→`ask_user`) instead of a forced `propose_edit`. Clicking it makes Jamo ask "What is the CRO's legal entity name?"; the user answers; Jamo then `propose_edit`s with the real value. Reuses the existing walkthrough/active_task flow. Requires: the analyzer to emit a non-rewrite CTA for placeholder findings (today `cta_tool` enum is `propose_edit | check_regulatory_compliance | answer_with_citations` — would add `ask_user` or a routing flag), and the client/edge to route that CTA to a tool_choice that permits asking.
2. **Let the model decide.** For gap/missing CTAs, send `tool_choice: auto` + a system-prompt rule: "if you lack the real value for a placeholder, call `ask_user` before rewriting." Smallest change; less deterministic (relies on the model choosing ask vs draft, which the current forced-tool code was specifically written to prevent).
3. **Auto-fill what's knowable, ask the rest.** Pull values that exist in the system (e.g. the CRO = the user's own org name from `organizations.name`) and fill those automatically; `ask_user` only for genuinely study-specific blanks (investigational product name, RFP contact, etc.). Best UX, most work.

**Recommendation:** Approach 1 (ask-then-fill) as the core, optionally layered with Approach 3's auto-fill for org-derivable values. Approach 2 is the cheap fallback if scope must stay tiny.

---

## Likely Affected Files

- `supabase/functions/chat-with-jamo/index.ts` — `tool_choice` construction (`:112-122`); possibly the `ask_user`/`set_focus` handlers + system prompt.
- `supabase/functions/analyze-proposal-gaps/index.ts` — the `cta_tool`/`cta_label` assigned to placeholder findings (and possibly the `PendingActionSchema` cta_tool enum).
- `src/types/chat.ts` — `ActionItemCtaTool` type if a new CTA tool/route is added.
- `src/components/AIChatPanel.tsx` — `onCtaClick` / `handleSendMessage` forced-tool routing (`:425`, `:708`); ask_user rendering already exists from 14.2.

---

## Out of Scope

- Re-litigating 14.2.3's detection/hash/flush work — that is verified and (deployment now live) working.
- A full multi-field "draft the whole section from a protocol" walkthrough beyond filling the flagged placeholders (that is the larger 14.2 Part B walkthrough; keep this phase focused on resolving flagged placeholders).

---

## Open Questions for Discuss

1. Which approach (1/2/3 above), and is org-derivable auto-fill (Approach 3) in or out for v1?
2. Should the placeholder CTA label change (e.g. "Provide info" / "Draft with me") to set the right expectation vs "Fix it"?
3. Does the analyzer need to distinguish "needs user data" (→ ask) from "thin content the model can draft" (→ propose_edit) in the finding itself, or should the agent decide at click time?
4. How does the filled value get persisted + the finding cleared (resolved_items integration from 14.2.2)?
