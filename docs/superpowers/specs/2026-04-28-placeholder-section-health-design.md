# Placeholder Marks & Section Health System

**Date:** 2026-04-28  
**Status:** Approved — ready for implementation planning  
**Scope:** Phase 1 — placeholder marks + `issues` field. Compliance migration and follow-up analyzers are explicitly deferred (see §8).

---

## 1. Problem

AI-generated sections contain `[PLACEHOLDER: label]` patterns in the output HTML when the model lacks information. Currently:

- Yellow highlights appear in the streaming card via a `<mark>` regex replace, but are lost when TipTap loads the content — the editor shows plain text.
- `compliance_flags` drives the status dot, but is re-computed on every mount with a 500 ms delay, causing a green flash on every reload.
- There is no stable per-issue identity, so issue lists can't be diffed, deduped, or surfaced by label to JamoAI.

---

## 2. Goals

1. Placeholder text renders as an amber pill inside TipTap — visually highlighted, not plain text.
2. Resolving a placeholder (typing inside the marked range) clears the highlight atomically.
3. Placeholder state persists through DB round-trips with stable IDs. No flash on reload.
4. Section status dot reflects all issue categories through a single generalized mechanism.
5. JamoAI can query unresolved placeholders from workspace state — no editor ref needed.

---

## 3. Data model

### 3.1 Types

```typescript
/** All recognized issue categories. Extend this union as new analyzers are added. */
type IssueCategory = 'placeholder' | 'compliance' | 'typo' | 'cross-section'

/**
 * A single issue surfaced by a section analyzer.
 *
 * ID STABILITY CONTRACT
 * ─────────────────────
 * Placeholder IDs originate from the TipTap mark attribute (data-placeholder-id).
 * They are written by the edge function post-process pass at generation time and
 * preserved through getHTML() → DB → parseHTML() on every subsequent load.
 * They are stable across reloads by construction.
 *
 * Analyzer-generated IDs (compliance, typo, cross-section) MUST be deterministic
 * for the same logical issue across re-runs — typically a hash of
 * (category + section_key + content snippet), NOT a fresh crypto.randomUUID() per run.
 * Fresh UUIDs on every re-run break deduplication and future diff logic.
 * Analyzers that don't yet implement deterministic IDs must document that gap inline.
 *
 * label MUST be non-empty and human-readable. The nav panel and JamoAI surface issues
 * by label. An empty label is a bug in the dispatching analyzer. The label should be
 * the raw issue description without any UI prefix (e.g. "sponsor's full legal name",
 * not "Missing: sponsor's full legal name"). Display prefixes belong in the render layer.
 */
interface SectionIssue {
  id: string
  label: string     // e.g. "sponsor's full legal name" — never empty, no UI prefix
  message?: string  // optional extended context
}
```

### 3.2 `SectionEditorState` addition

```typescript
// Added alongside existing compliance_flags (transitional — see §8.1)
issues: Partial<Record<IssueCategory, SectionIssue[]>>
```

Initialized as `{}` on mount.

**V1 absent-category contract:** a category absent from the record is treated as "no issues" by the dot logic. This means a category whose analyzer hasn't completed its initial run shows green for that category.

> **Deferred (§8.3):** The long-term shape will likely distinguish `{ status: 'pending' | 'ready', issues: SectionIssue[] }` per category so the dot can show a "checking" state. Do not build this now, but do not preclude it — keep the record value opaque enough to be replaced with a richer type later.

### 3.3 Workspace action

```typescript
| {
    type: 'UPDATE_SECTION_ISSUES'
    payload: { section_key: string; category: IssueCategory; issues: SectionIssue[] }
  }
```

**Semantics:** replaces the full list for the given category. One writer per category; no partial patches. A dispatch with `issues: []` clears the category.

---

## 4. TipTap `placeholder` mark

**File:** `src/components/editor/extensions/PlaceholderMark.ts`

### 4.1 Mark definition

```typescript
import { Mark, mergeAttributes } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import type { MarkType } from '@tiptap/pm/model'

export const PlaceholderMark = Mark.create({
  name: 'placeholder',
  spanning: true,
  inclusive: false, // typing at the boundary does not extend the mark

  addAttributes() {
    return {
      id: {
        parseHTML: el => el.getAttribute('data-placeholder-id'),
        renderHTML: attrs => ({ 'data-placeholder-id': attrs.id }),
      },
      label: {
        parseHTML: el => el.getAttribute('data-placeholder-label'),
        renderHTML: attrs => ({ 'data-placeholder-label': attrs.label }),
      },
    }
  },

  parseHTML()  { return [{ tag: 'span[data-placeholder-id]' }] },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      class: 'bg-amber-100 text-amber-800 rounded px-0.5',
    }), 0]
  },

  addProseMirrorPlugins() {
    return [resolutionPlugin(this.type)]
  },
})
```

**Display:** visible text inside the mark is the label only (e.g. `sponsor's full legal name`). No brackets. The `[PLACEHOLDER: ...]` syntax is transport-only and never shown post-load.

### 4.2 Resolution plugin

Removes the mark from the full contiguous range sharing the same ID whenever any part of that range is modified.

```typescript
function collectPlaceholderRanges(
  doc: PMNode,
  markType: MarkType,
  targetIds: Set<string>
): Array<{ from: number; to: number }> {
  const rangeMap = new Map<string, { from: number; to: number }>()
  // Track the first-seen position per ID to detect non-contiguous marks in one pass (O(n))
  const lastSeenEnd = new Map<string, number>()

  doc.descendants((node, pos) => {
    const mark = node.marks.find(m => m.type === markType && targetIds.has(m.attrs.id))
    if (!mark) return
    const id = mark.attrs.id
    const end = pos + node.nodeSize
    const existing = rangeMap.get(id)
    rangeMap.set(id, {
      from: existing ? Math.min(existing.from, pos) : pos,
      to:   existing ? Math.max(existing.to, end)   : end,
    })

    if (process.env.NODE_ENV === 'development') {
      const prevEnd = lastSeenEnd.get(id)
      if (prevEnd !== undefined && pos > prevEnd) {
        // Gap detected: previous node ended at prevEnd, this node starts at pos
        console.warn(`[PlaceholderMark] Non-contiguous mark for id="${id}" (gap at pos ${prevEnd}–${pos}). Possible duplicate ID from edge function or copy-paste.`)
      }
      lastSeenEnd.set(id, Math.max(lastSeenEnd.get(id) ?? 0, end))
    }
  })

  return Array.from(rangeMap.values())
}

function resolutionPlugin(markType: MarkType) {
  return new Plugin({
    appendTransaction: (transactions, _old, newState) => {
      if (!transactions.some(tr => tr.docChanged)) return null

      // TODO(compound-transactions): coordinates are mapped from each step's StepMap
      // independently. For multi-step transactions (paste, undo, programmatic bulk edits),
      // coordinates from step N should be mapped forward through steps N+1…end before
      // querying newState.doc. The dominant case — single-character typing — is
      // single-step and unaffected. Revisit if undo/paste triggers partial resolution.
      // NOTE: Out-of-range coordinates from compound transactions can throw inside
      // nodesBetween. The try/catch below prevents an editor crash — partial resolution
      // is the acceptable fallback until compound-transaction handling is implemented.
      const touchedIds = new Set<string>()

      transactions.forEach(transaction => {
        if (!transaction.docChanged) return
        transaction.mapping.maps.forEach(map => {
          map.forEach((_of, _ot, newFrom, newTo) => {
            try {
              newState.doc.nodesBetween(newFrom, newTo, node => {
                node.marks
                  .filter(m => m.type === markType)
                  .forEach(m => touchedIds.add(m.attrs.id))
              })
            } catch {
              // Compound-transaction coordinate out of range — skip this step's range.
              // Partial resolution is acceptable; an editor crash is not.
            }
          })
        })
      })

      if (touchedIds.size === 0) return null

      const ranges = collectPlaceholderRanges(newState.doc, markType, touchedIds)
      const tr = newState.tr
      ranges.forEach(({ from, to }) => tr.removeMark(from, to, markType))
      return tr
    },
  })
}
```

### 4.3 Registration

Add `PlaceholderMark` to the `extensions` array in `SectionEditorBlock` alongside `StarterKit`, `Table`, etc. Confirm no other extension claims the name `'placeholder'`.

---

## 5. Content pipeline & roundtrip

### 5.1 Shared conversion helper

**File:** `src/lib/placeholderHtml.ts`

```typescript
import { escapeHtml } from './escapeHtml'

/**
 * Converts a raw placeholder label + ID into the persisted span format.
 * Used by BOTH the edge function post-process pass and the legacy migratePlaceholders
 * backfill. Must not diverge.
 */
export function placeholderPatternToSpan(label: string, id: string): string {
  const escaped = escapeHtml(label.trim())
  return `<span data-placeholder-id="${id}" data-placeholder-label="${escaped}">${escaped}</span>`
}
```

**File:** `src/lib/escapeHtml.ts`

```typescript
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
```

### 5.2 Edge function post-process pass (primary path)

After the SSE stream completes and before writing to `proposal_sections.content`, the edge function runs:

```typescript
content = content.replace(
  /\[PLACEHOLDER:\s*([^\]]+)\]/g,
  (_, raw) => placeholderPatternToSpan(raw, crypto.randomUUID())
)
```

IDs are assigned once, at write time. All subsequent loads restore the same IDs via TipTap's `parseHTML`. This is the stable path for all content generated after this change is deployed.

### 5.3 Legacy backfill (secondary path)

**File:** `src/lib/migratePlaceholders.ts`

```typescript
import { placeholderPatternToSpan } from './placeholderHtml'

/**
 * One-time migration for pre-deploy rows that still contain raw [PLACEHOLDER: ...]
 * patterns. Applied in SectionEditorBlock before passing content to useEditor.
 *
 * ID stability: if the migrated string differs from the input, an autosave is triggered
 * immediately (before any user interaction) to commit the new UUIDs to the DB. This
 * prevents remount within the same session from generating a second set of UUIDs and
 * breaking any in-session issue references.
 *
 * After the autosave the persisted HTML contains data-placeholder-id spans and this
 * function becomes a no-op for that row on all future loads.
 *
 * Schedule a one-time DB backfill script when legacy row volume becomes non-trivial,
 * to eliminate the migration path entirely.
 */
export function migratePlaceholders(html: string): string {
  return html.replace(
    /\[PLACEHOLDER:\s*([^\]]+)\]/g,
    (_, raw) => placeholderPatternToSpan(raw, crypto.randomUUID())
  )
}
```

**Autosave trigger in `SectionEditorBlock`:**

```typescript
const migratedContent = migratePlaceholders(rawContent)
// Commit migrated UUIDs to DB immediately so remount doesn't regenerate them
if (migratedContent !== rawContent) {
  saveNow(migratedContent)
}
// Pass migratedContent to useEditor's content prop
```

Applied in `SectionEditorBlock` before the content is passed to `useEditor`. Not applied in `markdownToHtml` or anywhere in the generation pipeline.

### 5.4 Full roundtrip

```
Edge function generates HTML
  → post-process: [PLACEHOLDER: label] → <span data-placeholder-id="uuid" data-placeholder-label="label">label</span>
  → written to proposal_sections.content

TipTap loads content (SectionEditorBlock)
  → migratePlaceholders() is a no-op (no raw patterns remain)
  → parseHTML: span[data-placeholder-id] → placeholder mark { id: uuid, label: "label" }
  → amber pill rendered in editor

User autosaves (or types elsewhere)
  → getHTML() → renderHTML: placeholder mark → <span data-placeholder-id="uuid" ...>label</span>
  → written to DB — same UUID preserved ✓

Next page load / remount
  → same parseHTML path → same UUID restored ✓
```

---

## 6. Placeholder analyzer

Lives in `SectionEditorBlock`. Single `useEffect` keyed on `[editor, dispatch, sectionKey]`.

```typescript
useEffect(() => {
  if (!editor) return

  const analyze = () => {
    const markType = editor.schema.marks['placeholder']
    if (!markType) return

    const seen = new Set<string>()
    const issues: SectionIssue[] = []

    editor.state.doc.descendants(node => {
      const mark = node.marks.find(m => m.type === markType)
      if (!mark || seen.has(mark.attrs.id)) return
      seen.add(mark.attrs.id)
      // label is the raw description — no UI prefix here. Nav panel adds display prefix.
      issues.push({ id: mark.attrs.id, label: mark.attrs.label })
    })

    dispatch({
      type: 'UPDATE_SECTION_ISSUES',
      payload: { section_key: sectionKey, category: 'placeholder', issues },
    })
  }

  // Sanity check: if this ever fires with 0 issues on a section that visibly has
  // placeholder marks, editor.state.doc may not be fully hydrated yet at the moment
  // the effect fires. With TipTap's useEditor this should not occur — doc is populated
  // before the editor ref becomes truthy — but instrument this during implementation.
  analyze() // initial population

  const handler = debounce(analyze, 200)
  editor.on('update', handler)
  return () => {
    editor.off('update', handler)
    handler.cancel()
  }
}, [editor, dispatch, sectionKey])
```

When the resolution plugin strips a mark (user edits inside a placeholder), TipTap fires `update` → debounced handler fires → issue list shrinks → `UPDATE_SECTION_ISSUES` clears that issue. Resolution is automatic and reactive with no polling.

---

## 7. Status dot & issue display

### 7.1 `resolveStatus` in `SectionNavPanel` — transitional form

```typescript
function resolveStatus(editorState: SectionEditorState): DotStatus {
  if (editorState.status === 'generating') return 'generating'
  if (editorState.status === 'error')      return 'error'
  if (!editorState.content)                return 'missing'

  // issues (new) and compliance_flags (legacy bridge) independently trigger needs-review
  const hasIssues      = Object.values(editorState.issues).some(list => list.length > 0)
  const hasLegacyFlags = editorState.compliance_flags.length > 0
  if (hasIssues || hasLegacyFlags) return 'needs-review'

  return 'complete'
}
```

`hasLegacyFlags` is the Approach B bridge. It is removed when compliance migrates to `UPDATE_SECTION_ISSUES` (§8.1).

### 7.2 Issue label rendering

Display prefixes belong in the render layer, not in issue data. When the nav panel (or any future surface) renders a `placeholder` issue label, it prepends the category-appropriate prefix:

```typescript
// Nav panel render example
const displayLabel = category === 'placeholder'
  ? `Missing: ${issue.label}`
  : issue.label
```

This keeps `SectionIssue.label` clean for JamoAI consumption — the AI receives `"sponsor's full legal name"`, not `"Missing: sponsor's full legal name"`.

---

## 8. Deferred work

### 8.1 Compliance migration to `UPDATE_SECTION_ISSUES`

`useComplianceCheck` currently dispatches `SET_COMPLIANCE_FLAGS` and writes to `proposal_sections.compliance_flags`. This migration touches more than types — every dispatch site, every reader of `compliance_flags` in workspace state, the reducer, the dot logic, and the DB column write all change together. Underestimate this at your peril; scope it as a dedicated phase. Specific work:

- Change `useComplianceCheck` to dispatch `UPDATE_SECTION_ISSUES` with `category: 'compliance'`
- Implement deterministic IDs for compliance issues (hash of section_key + rule + content snippet)
- Remove `compliance_flags` from `SectionEditorState`, `WorkspaceAction`, and the reducer
- Remove `hasLegacyFlags` bridge from `resolveStatus`
- Drop `compliance_flags` column write from `useComplianceCheck` (or keep for server-side analytics — decision TBD)
- Update all tests that reference `compliance_flags` or `SET_COMPLIANCE_FLAGS`

### 8.2 Deterministic analyzer IDs

Current compliance issues use `crypto.randomUUID()` per run, violating the ID stability contract. Before completing §8.1, compliance must switch to deterministic IDs. Suggested scheme: `hash(category + ':' + section_key + ':' + ruleId + ':' + contentSnippet)` where `contentSnippet` is the first 64 chars of the matched text. This enables stable issue identity across re-runs and future diff/dedup logic.

Typo and cross-section analyzers (not yet built) must implement deterministic IDs from the start.

### 8.3 Pending/ready status per category

V1 treats a missing category as "no issues." This means the dot shows green during the window between mount and the first analyzer dispatch. The correct long-term shape:

```typescript
type CategoryState =
  | { status: 'pending' }
  | { status: 'ready'; issues: SectionIssue[] }

issues: Partial<Record<IssueCategory, CategoryState>>
```

Dot logic: green only if all present categories are `ready` with empty issue lists. A `pending` category shows a "checking" indicator. Do not build this in Phase 1 — the `Partial<Record<IssueCategory, SectionIssue[]>>` shape is chosen to be replaceable with this richer type without breaking dispatch sites.

---

## 9. Testing

### 9.1 Integration test — roundtrip stability

Add an integration test that exercises the full pipeline for a generated section containing a placeholder:

1. Edge function post-process converts `[PLACEHOLDER: budget figure]` → span with UUID
2. Content is written to DB
3. TipTap loads content → `parseHTML` restores the mark with the same UUID
4. `getHTML()` → `renderHTML` produces a span with the same UUID
5. Assert IDs match at steps 3 and 4

This test catches any markdown-layer interference with the bracket syntax (e.g. a markdown parser treating `[...]` as a link) and any serialization gap in the mark's `parseHTML`/`renderHTML` pair.

---

## 10. Files affected

| File | Change |
|------|--------|
| `src/types/workspace.ts` | Add `IssueCategory`, `SectionIssue`, `issues` field, `UPDATE_SECTION_ISSUES` action |
| `src/context/SectionWorkspaceContext.tsx` | Add reducer case for `UPDATE_SECTION_ISSUES` |
| `src/lib/escapeHtml.ts` | New — HTML escape helper |
| `src/lib/placeholderHtml.ts` | New — `placeholderPatternToSpan` shared helper |
| `src/lib/migratePlaceholders.ts` | New — legacy backfill function |
| `src/components/editor/extensions/PlaceholderMark.ts` | New — TipTap mark definition + resolution plugin |
| `src/components/editor/SectionEditorBlock.tsx` | Register mark, apply migration pass + immediate autosave, add analyzer effect |
| `src/components/editor/SectionNavPanel.tsx` | Update `resolveStatus` with `hasIssues` check; add display prefix in render |
| `supabase/functions/generate-proposal-section/index.ts` | Add post-process pass before DB write |
