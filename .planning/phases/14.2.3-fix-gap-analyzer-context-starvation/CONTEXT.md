# Phase 14.2.3 — Fix Gap Analyzer Context Starvation

**Gathered:** 2026-06-03
**Status:** Ready for planning — all 4 open questions resolved (see Discussion Resolutions)

_Inserted (URGENT) after Phase 14.2. Depends on 14.2.2 (`chat_sessions.resolved_items` + `section_content_hash_at_action` convention) being in place — it is._

---

## Goal

The gap analyzer returns **zero findings on proposals visibly full of unfilled template placeholders**. Root cause is **context starvation**, not a model or pipeline failure: each section is truncated to 300 characters before it reaches Haiku, so the model judges completeness over content it cannot see. A 946-char section shows Haiku only its polished first ~32% (the intro prose); the placeholders live in the body the model never receives.

This phase makes three changes, in priority order:
1. **Stop hiding content from the model** — send full section content (with a high per-section ceiling) instead of a 300-char slice. *This is the substance of the fix.*
2. **Tell the model what placeholders look like** — sharpen the prompt with placeholder-family guidance and few-shot examples.
3. **Stop re-running when nothing changed** — persist the whole-proposal content hash so the mount trigger skips a redundant Haiku call across navigate-away-and-back.

Plus two smaller corrections: rebalance tier caps so placeholder-heavy proposals can surface enough findings, and confirm one equality in the already-wired resolved-items staleness path.

This is and stays a **single-pass, all-sections-in-one-call** analyzer. That design is correct.

---

## Non-Goals (explicit / Out of Scope)

- **Deterministic regex placeholder pre-pass.** Deferred. The truncation fix + prompt sharpening should let the LLM catch placeholders once it can see them. Regex is maintenance debt (templates evolve, regex lags). Revisit only if a placeholder-laden proposal still yields zero findings *after* this ships.
- **Two-pass (deterministic→LLM) architecture.** Overengineered. The problem is context starvation, not context-window limits. Single pass stays.
- **"Strict mode" / "Smart mode" user toggle.** Usability anti-pattern — asks users to manage the internal mechanism. Default behavior should be "if there's a gap, you'll see it."
- **Time-based expiry of `resolved_items`.** The hash-divergence staleness annotation already handles stale dismissals. Time-based expiry is a separate UX question.
- **Per-section looping / splitting the Haiku call.** Cross-section `conflict` detection structurally requires all sections in one context. A loop would silently break it and multiply API calls by N.

---

## Background

A generated Phase III proposal with 9 sections (avg ~946 chars each), all `status='complete'`, contains obvious unfilled placeholders throughout — "CRO legal entity name and full corporate address", "investigational product name", "Name and title of RFP contact at Vericel BioPharma, Inc.", "mailing address". The analyzer ran successfully (Haiku, 200 OK, 6.7s) and wrote `pending_actions = []`.

Verified facts going in:
- The trigger fires on mount (the prior "no `chat_sessions` row" suppression was removed).
- The edge function is current and the Haiku call genuinely returns zero findings — not a downstream filter swallowing them.
- `resolved_items` handling is correct (reads from `chat_sessions`, annotates `content_status`, appends the RESOLVED_ITEMS block when non-empty).

The diagnosed root cause is the excerpt truncation at `supabase/functions/analyze-proposal-gaps/index.ts:270`:
```ts
excerpt: s.content.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 300)
```

---

## Code Reality — Alignment Findings (read before planning)

The brief was written from an architectural understanding that diverges from the deployed code in four places. The decisions below are already corrected for reality. **Do not re-derive these in discuss; they are the audited baseline.**

1. **The whole-proposal hash gate already exists — in memory only.** `src/hooks/useGapAnalysisTrigger.ts:28–41` (`computeHash`) already SHA-256-hashes the sorted `[{key,title,content}]` array of *all* sections and skips the invoke on match (`:115–117`). The brief's decision 4 ("whole-proposal, not per-section") is **already true**. The hash lives in an in-memory `useRef` that resets on unmount (`:73–79`), so navigate-away-and-back loses it. **The work is to *persist* the existing hash, not design a new one.** Reuse `computeHash` verbatim; the "what is hashed" open question is closed.

2. **A durable 30s server-side cooldown already exists and overlaps the gate.** `index.ts:10–12, 237–242` returns HTTP 429 if the same proposal is re-analyzed within 30s. So remount *within* 30s is already free today. The persistent hash gate only adds value **beyond the 30s window**. The two are complementary, not competing — see the precedence rule in Decision 3.

3. **The `content_status` / `section_content_hash_at_action` annotation is fully wired and fires.** `index.ts:244–261` computes per-section hashes and annotates each resolved item; `buildResolvedBlock` (`:60–94`) injects them with explicit deprioritize-stale instructions (`:73, 87–92`). The hash convention is shared by design — the writer uses `sha256OfSection(sectionHtml)` (`src/chat/resolved-items.ts:110`, `src/utils/sectionHash.ts:8`) and the edge re-hashes `s.content` with the identical algorithm. The brief's suspicion that this is "specified-but-unwired" is **wrong**. The verification deliverable shrinks to a single equality check (Decision 6).

4. **The trigger is fire-and-forget — it does not render `pending_actions`.** Rendering lives in `AIChatPanel.tsx` reading from `chat_sessions`. So "render existing pending_actions from cache" needs **no new render code** — the gate only needs to *skip the invoke*; the existing render path shows whatever is already in `chat_sessions`.

Everything else the brief assumes is accurate: single call confirmed (`index.ts:267–285`), the client sends full content untrimmed (`useGapAnalysisTrigger.ts:86–98, 121–127`), the 300-char slice is the *only* server-side truncation (no token budgeting, no summarization step), and the tier-cap constants are exactly where the brief expects (`index.ts:14–16`, applied `:308–314`).

---

## Architectural Decisions (Locked — Do Not Reopen)

### 1. Full section content, single 5000-char ceiling, all sections in one call

Replace the 300-char `slice` (`index.ts:270`) with full section content up to a **per-section ceiling of 5000 characters**. Sections under the ceiling are sent whole. Over-ceiling sections (rare) are truncated at 5000 chars with an explicit marker (e.g. `[...section truncated for length...]`) appended at the end so the model knows it isn't seeing everything.

All sections continue into a **single Haiku call** (`index.ts:279–285`). No per-section loop. There is no context-window pressure: 9 sections at full length is ~5–8K tokens against Haiku's 200K window; even much larger proposals stay comfortably inside. The 5000-char ceiling is a worst-case guard against one pathological section, not a general truncation strategy. HTML stripping + whitespace collapse from the current line is retained — only the `.slice(0, 300)` changes.

**Resolved (D-1 marker form):** inline sentinel **appended at the end** of the truncated excerpt (e.g. `[…section truncated for length…]`). Self-describing at the cut point with zero prompt coupling — the model reads real content first, then learns it's incomplete. *Not* a structured `truncated:true` field (would need a separate prompt instruction that can silently drift) and *not* prepended (interrupts content-first reading). Implementation: (a) the marker must read as clearly **meta** so it can't collide with the placeholder patterns the analyzer hunts — phrasing like "section truncated for length" must not itself look like unfilled scaffolding and trigger a spurious finding; (b) optional, planner's call — a single prompt line telling the model to judge truncated sections on visible content only and not infer completeness of the unseen tail (low value since 5000 chars covers nearly all sections; truncation is the rare path).

### 2. Sharpen the system prompt for placeholder detection

The current prompt's only `missing` few-shot is a section containing "TBD" (`index.ts:126–127`). Haiku has no template for recognizing template-placeholder patterns as gaps. Add guidance + few-shot examples framed around the **semantic family** (unfilled placeholder text that should have been replaced with real content), not an exhaustive literal list, so the prompt generalizes to new template formats. Cover the observed families:

- Bracket placeholders: `[CRO Name]`, `[CLIENT NAME]`, `[DATE]`
- Descriptive-noun placeholders: `CRO legal entity name`, `investigational product name`, `study drug name`
- Incomplete contact/address details: `mailing address`, `Name and title of RFP contact at...`, `full corporate address`
- Explicit incompleteness markers: `TBD`, `TODO`, `to be determined`, `[insert ...]`

Instruct the model: a section containing placeholder text is a `gap` if it otherwise has substantive content, or `missing` if it is predominantly placeholders/scaffolding.

**Resolved (D-2 example count): exactly 4 few-shot examples — one per observed family** (bracket, descriptive-noun, incomplete contact/address, explicit marker). Four maps one-to-one onto the genuinely distinct surface forms. Do **not** merge incomplete contact/address into descriptive-noun — multi-field incomplete contact blocks are the most structurally distinctive family *and* the most common in the failing proposal, so they get their own anchor. Do **not** go to 5+ — past four, examples become within-family variations that increase overfitting and work against the semantic generalization meant to catch unseen shapes. Implementation: (1) each example must show the **gap-vs-missing classification decision and its rationale**, not just the placeholder pattern — the decision boundary (substantive content + placeholders ⇒ `gap`; predominantly scaffolding ⇒ `missing`) is what the model needs to learn; (2) explicitly frame examples as **category representatives** ("recognize the general pattern, not only these exact strings") as cheap anti-overfitting insurance; (3) use realistic, lightly-paraphrased CRO proposal fragments — not synthetic `[PLACEHOLDER]` toys — so the model calibrates to the right register.

### 3. Persist the existing whole-proposal hash to gate the mount trigger

The gate is not net-new — `computeHash` (`useGapAnalysisTrigger.ts:28–41`) already exists and already gates. The change is **durability**: move its output from the in-memory `useRef` into storage tied to the `pending_actions` run, so a remount can compare against it.

- **Storage + write path (resolved, D-3):** a **new nullable `chat_sessions.pending_actions_content_hash text` column** — the hash is metadata *about* the analysis run, not a member of the action list, so embedding it inside the `pending_actions` JSON (wrapping the bare array in an envelope) would force every reader (`AIChatPanel` render) to unwrap it — a breaking read-shape change for consumers that don't care about the hash. Dedicated column gets atomicity from the shared upsert *without* contaminating the read shape. The hash is passed in the invoke body and written **in the same upsert** (`index.ts:339–350`) alongside `pending_actions`, so the two can never desync. Implementation: (1) **nullable** — treat `null` as "no prior analysis → run it," the same code path as a hash mismatch; existing rows are `null`, no backfill needed. (2) Name it `pending_actions_content_hash` (not a generic `content_hash`) so the pairing with `pending_actions` is self-evident. (3) **Verify there is no other write path** that touches `pending_actions` alone — a desync between hash and actions would make the gate fire wrong in both directions. Migration (one trivial `ALTER`) + `database.types.ts` regen required.
- **Mount behavior:** on mount, compute the current hash and compare to the persisted one. If unchanged, **skip the invoke entirely** — the existing `AIChatPanel`/`chat_sessions` render path already shows the cached `pending_actions` (no new render code). If changed, or no prior hash exists, run the analysis.
- **Precedence (layered, not competing):** the **client hash gate is checked first** — if content is unchanged, don't even call. The **30s server cooldown is the backstop** for the case where content *did* change but a call just fired (rapid thrashing). Cooldown is server-side and absolute (429 regardless); hash gate is client-side and prevents the invoke from firing at all. Implement them in that order.

### 4. Whole-proposal hash, not per-section (already satisfied)

The mount-gate hash covers **all sections** — a save to the budget section must invalidate the cached analysis because it might create a new cross-section conflict with the timeline. `computeHash` already does this (sorted all-section JSON). No change beyond persisting it.

### 5. Rebalance tier caps for this product

Current caps (`index.ts:14–16`): `QUEUE_CAP = 8`, `TIER_CAPS = { compliance: 4, conflict: 2, gap: 2, missing: 2 }`. Capping `gap`/`missing` at 2 each means a placeholder-heavy proposal shows only 4 placeholder findings even when 15 exist. Rebalance to:

- compliance ≤ 4
- conflict ≤ 2
- gap ≤ 4
- missing ≤ 4
- total `QUEUE_CAP` ≤ 10

Starting values, kept as the existing named constants for easy tuning. The original reasoning (no category monopolizes visible slots) still holds; the values just reflect that placeholders are existential for CRO proposals. Pure constant swap at a confirmed location.

### 6. Flush-then-hash at resolve-time so the staleness hash is provably consistent

The annotation is already wired and fires (see Code Reality #3), but a code trace during discuss found a **real ~1500ms divergence window** that the original "just confirm the equality" framing got backwards. The trace:

- `onUpdate` (`SectionEditorBlock.tsx:101–105`) updates workspace content **synchronously** on every keystroke (`dispatch UPDATE_CONTENT`) and calls `triggerAutosave(html)` with the *same* `html` string, which persists to `proposal_sections.content` after a **1500ms debounce** (`useAutosave.ts:22–40`, latest-call-wins).
- The resolve handlers (`AIChatPanel.tsx:710–750`) have **no gate** on autosave — they fire immediately and read `workspaceState.sections[key].content` (`:722`).
- So during the ~1.5s after an edit, **workspace = V2 (new), DB = V1 (stale)**. This is the *dominant* co-pilot flow: see finding → edit section to address it → dismiss finding, all within seconds.

**Why this inverts original "option 1":** workspace content is the **leading** value the DB converges to; the edge's staleness re-hash runs *after* convergence. So hashing the **DB at resolve-time** captures stale V1 (DB hasn't flushed), the edge later hashes V2, they mismatch → the just-dismissed finding **falsely re-surfaces** — shipping the exact bug 14.2.2 exists to prevent into the most common flow. Hashing **in-memory** content (current `:722` code) actually works in that flow because in-memory V2 == what autosave persists == what the edge later reads; its only failure (undo/supersede before flush) errs toward re-surface, which is *safe*.

**Locked decision — flush-then-hash** (removes the window entirely rather than tolerating it; depends on **no timing assumption**, and makes the resolve a guaranteed save point that commits the resolution and the content it resolved against together):

1. **Plumbing:** expose the existing `saveNow` (`useAutosave.ts:46–62`) through the editor ref handle alongside `setContent`/`getHTML` (`SectionEditorBlock.tsx:459–463`). Do **not** have `AIChatPanel` write `proposal_sections.content` directly — a second write path can drift from autosave's canonical logic (e.g. the `isEffectivelyEmpty` guard).
2. **Sequence:** `await saveNow(html)` → hash **that exact same string** → write the `resolved_items` entry. Hash the literal string passed to `saveNow`, never a re-fetch, or the gap reopens.
3. **Failure fallback:** if `saveNow` fails, **do not block the resolve** — fall back to hashing the in-memory content (degrades to the benign in-memory behavior) and log the failure. The user's dismiss/accept must never be held hostage by a save failure — consistent with the fire-and-forget stance elsewhere.

Do **not** build a separate cleanup mechanism for the two pre-existing stale dismissals — the empty→full content change marks them `content_changed_since_action` under any option, so they self-correct once this ships.

---

## Deliverables

### Edge function (`supabase/functions/analyze-proposal-gaps/index.ts`)
- Replace the 300-char excerpt slice (`:270`) with full-content-up-to-5000-chars + truncation marker for over-ceiling sections (Decision 1).
- Rewrite the system prompt's gap/missing guidance with placeholder-family framing + few-shot examples (Decision 2).
- Update `QUEUE_CAP` → 10 and `TIER_CAPS` gap/missing → 4 (Decision 5).
- Accept the whole-proposal content hash in `RequestSchema` and store it in the `chat_sessions` upsert alongside `pending_actions` (Decision 3).
- Preserve the single-call, all-sections structure (no change to call shape).

### Client (`src/hooks/useGapAnalysisTrigger.ts`)
- Persist `computeHash` output by sending it in the invoke body (Decision 3); the edge writes it.
- On mount, read the persisted hash from `chat_sessions`, compare to the current `computeHash`, and skip the invoke when unchanged — checked *before* the call (Decision 3 precedence). No new render code.

### Resolve-time flush-then-hash (`resolved-items` staleness, Decision 6)
- Expose `saveNow` through the editor ref handle (`SectionEditorBlock.tsx:459–463`).
- In the dismiss + accept resolve handlers (`AIChatPanel.tsx:710–750`), sequence `await saveNow(html)` → hash that literal string → write the `resolved_items` entry.
- On `saveNow` failure, fall back to hashing in-memory content and log — never block the resolve.

---

## Discussion Resolutions (2026-06-03)

All four open questions are **resolved and locked**. Details live in the relevant Decision above; summarized here for the planner.

1. **Truncation marker (→ Decision 1).** Inline sentinel appended at the **end** of the truncated excerpt; phrased clearly meta so it can't be mistaken for placeholder scaffolding. Not a structured field, not prepended. Optional prompt line about judging truncated sections on visible content only.
2. **Few-shot count (→ Decision 2).** Exactly **4** examples, one per family (contact/address keeps its own anchor). Each shows the gap-vs-missing decision + rationale, framed as category representatives, using realistic paraphrased CRO fragments.
3. **Hash storage (→ Decision 3).** New **nullable `chat_sessions.pending_actions_content_hash text` column**, written atomically with `pending_actions` in the single upsert; `null` ⇒ run. Migration + types regen required. Verify no other write path touches `pending_actions` alone.
4. **Resolve-time hash input (→ Decision 6).** **Flush-then-hash:** expose `saveNow`, sequence `await saveNow(html)` → hash that literal string → write entry; fall back to in-memory hash on save failure. Code trace showed the original "hash the DB at resolve-time" option would ship the 14.2.2 bug into the common edit-then-dismiss flow — it is off the table.

_(The brief's original open questions — "where the hash is stored" and "what is hashed" for the mount gate — were already closed by Code Reality #1 and Decision 3.)_

---

## Acceptance Criteria

1. The failing case — the 9-section Phase III proposal with placeholders throughout — produces **multiple findings** flagging the placeholder sections on re-analysis.
2. The analyzer still makes a **single Haiku call containing all sections**, not a per-section loop. Cross-section conflict detection is intact (verify with a deliberately conflicting budget/timeline case if feasible).
3. Sections under 5000 chars are sent whole; an over-ceiling section is truncated with a visible marker.
4. **Opening a proposal, navigating away, waiting past the 30s cooldown, and reopening the unchanged proposal does NOT fire a second Haiku call** — the persisted hash matches and the cached `pending_actions` render. _(The >30s gap is mandatory: a shorter gap would pass trivially via the 429 cooldown without exercising the hash gate at all.)_
5. Editing any section, saving, and reopening DOES re-analyze (whole-proposal hash changed).
6. A save to one section invalidates the cached analysis for the **whole proposal**, not just that section.
7. Tier caps reflect the rebalanced values; a placeholder-heavy proposal can surface up to 4 `gap` and 4 `missing` findings.
8. The two pre-existing stale dismissals do not suppress legitimate findings after the fix — the `content_status` annotation marks them `content_changed_since_action` given the now-changed content (Decision 6 equality holds, or is fixed).

---

## Files to Touch

| File | Change |
|---|---|
| `supabase/functions/analyze-proposal-gaps/index.ts` | 300-char slice → full/5000 + end-marker; 4-example placeholder prompt; cap constants (`QUEUE_CAP` 10, gap/missing 4); accept content hash in `RequestSchema` + write to `pending_actions_content_hash` in the upsert |
| `src/hooks/useGapAnalysisTrigger.ts` | Send `computeHash` in invoke body; on mount read persisted `pending_actions_content_hash`, compare, skip invoke when unchanged (before the call) |
| `src/components/editor/SectionEditorBlock.tsx` | Expose `saveNow` through the editor ref handle alongside `setContent`/`getHTML` (`:459–463`) |
| `src/components/AIChatPanel.tsx` | Dismiss + accept resolve handlers: `await saveNow(html)` → hash that string → write `resolved_items`; fallback to in-memory hash on save failure (`:710–750`) |
| `src/types/database.types.ts` | Regen after the `chat_sessions.pending_actions_content_hash` migration |
| new migration | `ALTER TABLE chat_sessions ADD COLUMN pending_actions_content_hash text` (nullable) |

_The editor ref handle type (`src/types/workspace.ts` — the imperative handle exposing `setContent`/`getHTML`) gains `saveNow`._

---

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### This phase's source-of-truth code
- `supabase/functions/analyze-proposal-gaps/index.ts` — the analyzer: excerpt slice (`:270`), prompt (`:96–127`), tier caps (`:14–16`, applied `:308–314`), `content_status` annotation (`:244–261`), `buildResolvedBlock` (`:60–94`), upsert (`:339–350`).
- `src/hooks/useGapAnalysisTrigger.ts` — mount + Realtime trigger; `computeHash` whole-proposal hash (`:28–41`), in-memory gate (`:115–117`), invoke (`:121–127`).
- `src/chat/resolved-items.ts` §`buildResolvedItemEntry` (`:96–124`) + `src/utils/sectionHash.ts` — the shared SHA-256-of-TipTap-HTML convention.
- `src/components/AIChatPanel.tsx:710–750` — resolve handlers (dismiss/accept) that write `resolved_items`.
- `src/components/editor/SectionEditorBlock.tsx:101–105, 459–463` + `src/hooks/useAutosave.ts:22–62` — `onUpdate` → workspace + `triggerAutosave`; `saveNow`; editor ref handle.

### Governing contracts (locked decisions this phase must honor)
- `.planning/phases/14.2-ai-chat-copilot/CONTEXT.md` — Part B co-pilot decisions: Haiku-only analysis, `chat_sessions` as the state store, server-generated action queue, type definitions (`gap`/`conflict`/`compliance`/`missing`), priority/tier-cap rationale.
- `.planning/phases/14.2-ai-chat-copilot/14.2-AI-SPEC.md` — the gap-analysis AI contract (origin of "300 chars max per section", the Haiku-only rule, the `pending_actions` schema). **Confirm this phase's full-content change is reflected/annotated here so the AI-SPEC and code don't drift.**
- 14.2.2 artifacts (`.planning/phases/14.2.2-*`) — `resolved_items` / `content_status` / `section_content_hash_at_action` design + the `append_resolved_item` RPC. This phase extends, not replaces, that convention.

_No external (third-party) specs — all contracts are in-repo._

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Hash gate and 30s cooldown implemented as competing rather than layered guards | Medium | Decision 3 precedence: client hash gate first, cooldown as backstop. State the order explicitly in the plan. |
| Acceptance criterion 4 passes via the cooldown without proving the hash gate | Medium | Criterion 4 mandates a >30s gap between opens. |
| Resolve-time flush-then-hash regresses if `saveNow` is bypassed or a re-fetch sneaks in | Medium | Decision 6: hash the literal string passed to `saveNow`; no second write path; fallback hashes in-memory on save failure (benign). |
| `pending_actions_content_hash` desyncs from `pending_actions` via a second write path | Medium | Decision 3: both written in the one upsert; audit for any other writer of `pending_actions`. |
| Full content increases prompt size enough to slow Haiku or hit output limits | Low | ~5–8K input tokens for 9 sections vs. 200K window; `max_tokens` is output-only and unchanged. 5000-char ceiling caps the worst case. |
| Truncation marker mistaken for placeholder scaffolding → spurious finding | Low | Decision 1: phrase the marker as clearly meta ("section truncated for length"). |
