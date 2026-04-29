---
phase: 11-docx-export
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - package.json
  - src/components/ExportBlockedModal.tsx
  - src/lib/exportDocx.ts
  - src/lib/htmlToDocx.ts
  - src/pages/ProposalDetail.tsx
  - vite.config.js
findings:
  critical: 0
  warning: 5
  info: 4
  total: 9
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-04-29
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the DOCX export feature spanning the export library (`exportDocx.ts`, `htmlToDocx.ts`), the blocking modal (`ExportBlockedModal.tsx`), and its integration point in `ProposalDetail.tsx`. The overall architecture is sound — the placeholder-scan-then-block pattern is clean and the zero-row table guard is a good defensive touch.

Five warnings were found: a memory leak from a dangling anchor element, a silent Supabase error swallow in two data-fetching paths, a "Resolve" button that closes the modal instead of scrolling to the section, and a stale `proposal` reference inside a hook dependency. Four info items cover unused state, `as any` casts, a magic number, and nested list flattening.

No critical security or data-loss issues were found.

---

## Warnings

### WR-01: Anchor element created for download is never removed from the DOM

**File:** `src/lib/exportDocx.ts:139-143`
**Issue:** `document.createElement('a')` creates a detached anchor and calls `.click()` on it, but the element is never appended to (or removed from) the DOM. Most modern browsers handle this correctly, but the pattern is fragile and varies by browser/environment. More importantly, if `URL.revokeObjectURL(url)` is called synchronously immediately after `.click()`, the blob URL may be revoked before the browser has a chance to initiate the download — causing a silent failure on slower or busy tabs.

**Fix:** Append to the body, trigger the click, then revoke asynchronously:
```ts
const a = document.createElement('a')
a.href = url
a.download = `${slugify(proposalTitle)}.docx`
document.body.appendChild(a)
a.click()
document.body.removeChild(a)
// Revoke after a tick so the browser can start the download
setTimeout(() => URL.revokeObjectURL(url), 100)
```

---

### WR-02: Supabase fetch errors silently ignored in `useEffect` and `refetchSections`

**File:** `src/pages/ProposalDetail.tsx:200-215` and `238-252`
**Issue:** Both the initial `useEffect` and `refetchSections` call `.then(({ data }) => ...)` but destructure only `data`, discarding `error`. If the Supabase query fails (network error, RLS denial, invalid proposal ID), the UI silently stays in a loading/empty state with no feedback to the user and no log entry.

**Fix:** Destructure and handle `error` in both locations:
```ts
.then(({ data, error }) => {
  if (error) {
    console.error('Failed to load proposal sections:', error)
    setSectionsLoaded(true) // unblock the UI
    return
  }
  if (data && data.length > 0) { ... }
  setSectionsLoaded(true)
})
```

---

### WR-03: "Resolve →" button in `ExportBlockedModal` closes the modal but does not navigate to the section

**File:** `src/components/ExportBlockedModal.tsx:33-38`
**Issue:** The button's `onClick` is wired to `onClose`, which simply closes the modal. The copy says "Click 'Resolve →' to jump to each section," but no navigation or scroll happens — the user lands back at the top of the page with no indication of which section needs attention. This is a functional gap that will confuse users.

**Fix:** Extend the `Props` interface to accept a resolve callback with the section key, and call it:
```tsx
interface Props {
  placeholders: PlaceholderItem[]
  onClose: () => void
  onForce: () => void
  onResolve: (sectionKey: string) => void  // add this
}

// In the button:
<button onClick={() => { onClose(); onResolve(p.id) }}>
  Resolve →
</button>
```
The caller in `ProposalDetail` can then scroll the relevant `SectionWorkspace` editor into view via `editorRefsMap`.

---

### WR-04: Stale closure — `proposal` may be `undefined` inside auto-generate `useEffect`

**File:** `src/pages/ProposalDetail.tsx:298-305`
**Issue:** The `useEffect` that auto-triggers generation on `?generate=true` calls `buildProposalInput()`, which reads `proposal` from the outer scope. `proposal` is not in the dependency array (it is suppressed via eslint-disable). If the effect fires before `proposals` context has loaded (i.e., `proposal` is still `undefined`), `buildProposalInput()` will return an input object full of empty strings and empty arrays, and generation will proceed silently with no data.

The guard `proposal &&` on line 299 prevents the call when `proposal` is falsy on the first render, but if `proposals` loads asynchronously after `searchParams` is set, the effect will not re-fire because `proposal` is not a dependency.

**Fix:** Add `proposal` to the dependency array (and remove the eslint-disable), or add an explicit guard that waits for `!proposalsLoading`:
```ts
useEffect(() => {
  if (!proposal || proposalsLoading) return
  if (searchParams.get('generate') === 'true' && !genState.isGenerating && genState.completedCount === 0) {
    generateAll(buildProposalInput())
    window.history.replaceState({}, '', window.location.pathname)
  }
}, [proposal, proposalsLoading, searchParams, genState.isGenerating, genState.completedCount])
```

---

### WR-05: Nested list items are flattened — nested `<ul>/<ol>` inside `<li>` are lost

**File:** `src/lib/htmlToDocx.ts:96-107`
**Issue:** The `ul`/`ol` handler uses `node.querySelectorAll('li')`, which selects all `<li>` descendants — including those in nested sub-lists. Nested lists are therefore flattened to the top level with no indentation change. More importantly, `inlineRuns(li)` will also recurse into the nested `<ul>/<ol>` child elements and include their text inline inside the parent `<li>` paragraph, duplicating text.

For example, `<ul><li>Parent<ul><li>Child</li></ul></li></ul>` will produce two bullet paragraphs ("Parent Child" and "Child"), with "Child" appearing twice.

**Fix:** Use only direct `<li>` children of each list, and handle nested lists recursively:
```ts
} else if (tag === 'ul' || tag === 'ol') {
  const ref = tag === 'ul' ? 'bullet-list' : 'number-list'
  Array.from(node.children).forEach(child => {
    if (child.tagName.toLowerCase() === 'li') {
      results.push(new Paragraph({
        numbering: { reference: ref, level: 0 },
        children: inlineRuns(child),
      }))
      // recurse into any nested lists
      child.querySelectorAll('ul, ol').forEach(nested => walkNode(nested as Element))
    }
  })
}
```

---

## Info

### IN-01: `generating` state is never set to `true` — dead state variable

**File:** `src/pages/ProposalDetail.tsx:166`
**Issue:** `const [generating] = useState(false)` — the setter is never destructured or called. All "generating" UI paths check this variable but it is always `false`. The actual generation state comes from `genState.isGenerating`. The `generating` variable and its associated UI branches (lines 508-531, 591-598) are dead code.

**Fix:** Remove the `generating` state declaration and the two UI branches that gate on it, since they are unreachable.

---

### IN-02: Multiple `as any` casts for Supabase data

**File:** `src/pages/ProposalDetail.tsx:210`, `248`
**Issue:** `setProposalSections(data as any)` bypasses TypeScript's type checking. The fetched shape is fully known — it matches the inline interface declared at lines 186-196.

**Fix:** Generate or define a typed interface from `database.types.ts` and cast to it explicitly, or at minimum use `as typeof proposalSections[number][]` to keep type safety.

---

### IN-03: Magic number `99` used as fallback position

**File:** `src/pages/ProposalDetail.tsx:622`
**Issue:** `position: s.position ?? 99` uses a bare magic number as a sentinel for "no position." If a template ever has more than 99 sections, this silently produces wrong ordering.

**Fix:** Extract to a named constant:
```ts
const DEFAULT_SECTION_POSITION = Number.MAX_SAFE_INTEGER
// or at module top:
const FALLBACK_POSITION = 9999
```

---

### IN-04: `PlaceholderSentinel` interface is exported but never used

**File:** `src/lib/htmlToDocx.ts:11-15`
**Issue:** The `PlaceholderSentinel` interface is declared and exported but nothing imports or references it anywhere in the reviewed files. It appears to be a leftover from an earlier design.

**Fix:** Remove the unused export to reduce API surface noise.

---

_Reviewed: 2026-04-29_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
