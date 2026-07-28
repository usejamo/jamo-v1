# Root-cause analysis — two chat-suggestion bugs (2026-07-27)

Method: superpowers:systematic-debugging. Evidence from prod `fuuvdcvbliijffogjnwg`
(`_gap_debug`, 181 runs since 2026-06-05) + code trace. **No fixes applied yet.**

---

## Bug 1 — "Review in editor" doesn't jump to the edit

### The handoff's premise is wrong
The handoff says `onReviewInEditor` "does no scroll/focus". It does:
`materializePendingEdits` ends with a `scrollIntoView` at
`src/components/editor/SectionEditorBlock.tsx:469-471`.

### Actual root cause — the idempotency guard returns *before* the scroll

`SectionEditorBlock.tsx:404-409`:

```js
const existingIds = new Set(section.pending_edits.map(e => e.id))
const allAlreadyPresent = edits.every(e => existingIds.has(e.id))
if (allAlreadyPresent && edits.length === section.pending_edits.length) {
  return { ok: true, applied: section.pending_edits.length }   // <-- returns at :408
}
...
editorEl?.scrollIntoView({ behavior: 'smooth', block: 'start' })  // <-- :471, never reached
```

Sequence that produces the bug:

1. `propose_edit` arrives → `AIChatPanel.tsx:770-788` **auto-materializes** the edits
   (`handle.materializePendingEdits(newMsgId, edits)`). Edit ids are `` `${newMsgId}-${i}` ``.
   This call *does* scroll — while the user is still reading the chat panel.
2. User reads the `EditSummaryCard`, scrolls around, clicks **"Review in editor"**.
3. `AIChatPanel.tsx:1138-1140` calls `materializePendingEdits(msg.id, buildEdits())`.
   `buildEdits()` mints the *same* ids (`` `${msg.id}-${i}` ``, and `msg.id === newMsgId`).
4. `allAlreadyPresent` is true, lengths match → early return at `:408`. **No scroll.**

Scope: fires whenever this message's edits are the only pending edits in that section
(the common case). If another message also has pending edits there, the length check
fails, the dispatch re-runs, and it *does* scroll — which is why it looks intermittent.
After a page reload `pending_edits` is empty (in-memory only), so the first click
scrolls — matching "sometimes it works".

Secondary gap: unlike the CTA path (`AIChatPanel.tsx:976-983`), `onReviewInEditor`
never calls `_onSectionFocusChange`, and it scrolls to the section root rather than the
edited paragraph. Paragraphs do carry `data-id` (`decorations.tsx:34-40`), so a
paragraph-precise scroll is available.

### Proposed fix
"Review in editor" is a *navigation* action; it must focus+scroll regardless of
materialization state. Do not simply move the scroll above the guard — that would also
re-scroll on every auto-arrival.

1. Add `scrollToEdit(messageId)` to `SectionEditorHandle` (`src/types/workspace.ts:185`)
   that resolves `[data-id="<paragraph_id>"]` of the first pending edit for that message,
   falling back to the section root (`id={sectionKey}`).
2. `onReviewInEditor` becomes: `materializePendingEdits(...)` → `_onSectionFocusChange(section_key)`
   → `requestAnimationFrame(() => handle.scrollToEdit(msg.id))` — parity with the CTA path.
3. Leave the idempotency guard and the arrival-time scroll untouched.

Test: assert `scrollToEdit` runs on a second `onReviewInEditor` click when the edits are
already materialized (currently it does not).

---

## Bug 2 — suggestions vanish, then repopulate

### Not the handoff's hypothesis
The handoff's "strong hypothesis" was a stale/blank Realtime `pending_actions` replace
during the 3s-debounce + 30s-cooldown window. The real cause is upstream: the **edge
function itself writes an empty array after a failed analysis**.

### Root cause — a failed analysis is persisted as a legitimate "no findings" result

`supabase/functions/analyze-proposal-gaps/index.ts` funnels three *failure* paths into
`pendingActions = []`:

| Path | Line | Result |
|---|---|---|
| Zod validation of the whole array fails | 423-427 | `pendingActions = []` |
| Haiku call throws | 428-442 | `pendingActions = []` |
| `JSON.parse` fails **and** salvage returns null | 376-387 | `raw = []` → validates as empty |

All three then fall through to the **same unconditional upsert** (463-489), overwriting
`chat_sessions.pending_actions` with `[]`. Realtime pushes that to
`AIChatPanel.tsx:376` (`setPendingActions(row.pending_actions ?? [])`) and the queue
blanks. The next successful run repopulates it — the "reloads after a while".

The client-side guards (`locallyResolvedIds`, `resolvedFilterSet`, `visiblePendingActions`)
cannot help: they only *subtract* items, never restore an array the server blanked.

### Evidence (prod `_gap_debug`)

`validated_count = -1` is the sentinel meaning `dbgValidated` was never assigned — it is
set **only** inside `if (validated.success)`, so `-1` proves a **Zod safeParse failure**
(not a throw, and not salvage: salvage-null yields `raw = []`, which safeParse *accepts*,
recording `0`). 3 such runs, each sandwiched between healthy runs on the same proposal:

```
23:15:10  validated=14  final=7   <- healthy
23:19:44  validated=-1  final=0   <- BLANKS THE QUEUE
23:25:34  validated=15  final=5   <- repopulates
```

Also on 2026-07-24 and 2026-07-22. 3 hard failures / 181 runs (~1.7%).

Ruled out along the way:
- **Not output length.** 75 *successful* runs also hit the 8000-char diagnostic cap.
- **Not a schema violation in the visible prefix.** Replayed the real strip+parse+schema
  check over the stored raw of all 3 failures and 57 successes: **0** violating objects
  in either group. The offending item sits past char 8000, which `_gap_debug` truncates.
- **Not the 8 older `validated_count = 0` rows** (2026-06-08/12) — those pre-date the
  fence-strip and salvage fixes and reflect code no longer deployed.
- **Live re-run** of the exact Haiku call (temperature 0, current content of proposal
  `777046df`) returned `stop_reason=end_turn`, 25 findings, all schema-valid, max
  description 373/500 — i.e. the failure is input-dependent and near the limits, not a
  systemic truncation at `max_tokens`.

### Proposed fix (at the source, not masking)

1. **Per-item validation instead of all-or-nothing.** Replace
   `z.array(PendingActionSchema).safeParse(raw)` with a per-element `safeParse`, keeping
   valid findings and `console.warn`-ing the rejects. One malformed finding out of 25
   currently discards all 25; this alone removes the observed failure mode.
2. **Never persist a failed analysis.** Only the Haiku-throw and total-parse-failure
   paths remain able to produce a "no result" state. In those, skip the `pending_actions`
   write entirely rather than writing `[]` — advance only `pending_actions_generated_at`
   / `last_updated` (so the 30s cooldown still throttles retries) and return a non-2xx.
   Guard: only do the narrow update when a `chat_sessions` row already exists, so a
   first-ever failed run doesn't create a row with null `pending_actions`.
3. A genuine empty result (`validated.success` with 0 findings) must still write `[]` —
   that is a real "clean proposal" answer and today's `pending_actions_content_hash: null`
   on-empty behavior (478) stays as-is.

Client-side "ignore a transient empty" would mask the bug and is **not** proposed.
Once (1) and (2) land, a failed run leaves the existing queue on screen untouched.

### Note
`_gap_debug` and the `dbg*` instrumentation (339-345, 444-458) are marked TEMP
DIAGNOSTIC / "REVERT after". They are what made this diagnosable — recommend keeping
them until the fix is verified in prod, then removing deliberately.
