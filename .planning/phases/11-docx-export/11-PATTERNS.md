# Phase 11: DOCX Export — Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 5 new/modified files
**Analogs found:** 4 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/lib/export/htmlToDocx.ts` | utility | transform | `src/lib/markdownToHtml.ts` | role-match (string-in → structured-out converter) |
| `src/lib/export/buildProposalDoc.ts` | utility | transform | `src/lib/placeholderHtml.ts` | partial (assembles output from scanned inputs) |
| `src/lib/export/triggerDownload.ts` | utility | request-response | none | no analog |
| `src/components/export/PlaceholderBlockModal.tsx` | component | request-response | `src/components/ProposalEditorModal.tsx` | role-match (modal overlay pattern) |
| `src/pages/ProposalDetail.tsx` (modify) | component | request-response | self | exact (existing file) |

---

## Pattern Assignments

### `src/lib/export/htmlToDocx.ts` (utility, transform)

**Analog:** `src/lib/markdownToHtml.ts`

**Imports pattern** (`src/lib/markdownToHtml.ts` lines 1–2):
```typescript
// Named export, no default. Single-responsibility converter.
import { marked } from 'marked'
```
Apply the same shape — named export, single function, no class wrapper:
```typescript
import { Paragraph, TextRun, Table, TableRow, TableCell,
         HeadingLevel, WidthType, AlignmentType, NumberingFormat } from 'docx'
```

**Core pattern** (`src/lib/markdownToHtml.ts` lines 13–33):
```typescript
// Guard empty input early, then walk/transform, return structured output.
export function markdownToHtml(content: string): string {
  if (!content) return ''
  // ... transform logic ...
}
```
Mirror this shape exactly for the docx converter:
```typescript
export function htmlToDocxChildren(
  html: string,
  bulletRef: string,
  orderedRef: string,
  forceExport: boolean,
): (Paragraph | Table)[] {
  if (!html) return []
  const dom = new DOMParser().parseFromString(html, 'text/html')
  // walk dom.body.childNodes → push to result[]
}
```

**Placeholder detection sub-pattern** (`src/lib/placeholderHtml.ts` lines 3–6 — attribute contract):
```typescript
// PlaceholderMark renders: data-placeholder-id, data-placeholder-label
// Detection query (from RESEARCH.md Pattern 3):
const spans = doc.querySelectorAll('span[data-placeholder-id]')
Array.from(spans).map(span => ({
  id: span.getAttribute('data-placeholder-id') ?? '',
  label: span.getAttribute('data-placeholder-label') ?? span.textContent ?? '',
}))
```

**Error handling pattern:** No try/catch in `markdownToHtml.ts` — it is a pure transform. Match this: let docx constructor errors propagate up to the caller (`buildProposalDoc.ts`), which catches at the top level.

---

### `src/lib/export/buildProposalDoc.ts` (utility, transform)

**Analog:** `src/lib/migratePlaceholders.ts` (lines 1–15 — scans input, calls sub-utility per item, returns assembled output)

**Imports pattern** (`src/lib/migratePlaceholders.ts` lines 1):
```typescript
import { placeholderPatternToSpan } from './placeholderHtml'
```
Mirror: import `htmlToDocxChildren` from sibling file, import `Document`, `Packer`, numbering types from `docx`.

**Core pattern** (`src/lib/migratePlaceholders.ts` lines 3–15):
```typescript
export function migratePlaceholders(html: string): string {
  return html
    .replace(/\[PLACEHOLDER:\s*([^\]]+)\]/g, (_, raw) => placeholderPatternToSpan(...))
    .replace(/\[([A-Z]...)\]/g, (_, raw) => placeholderPatternToSpan(...))
}
```
Mirror — iterate ordered sections, call `htmlToDocxChildren` per section, accumulate children array:
```typescript
export function buildProposalDoc(
  sections: Array<{ name: string | null; content: string }>,
  forceExport: boolean,
): Document {
  const BULLET_REF = 'bullet-list'
  const ORDERED_REF = 'ordered-list'
  const children: (Paragraph | Table)[] = []
  for (const section of sections) {
    if (section.name) {
      children.push(new Paragraph({ text: section.name, heading: HeadingLevel.HEADING_1 }))
    }
    children.push(...htmlToDocxChildren(section.content, BULLET_REF, ORDERED_REF, forceExport))
  }
  return new Document({
    numbering: { config: [ /* bullet + ordered configs */ ] },
    sections: [{ children }],
  })
}
```

---

### `src/lib/export/triggerDownload.ts` (utility, request-response)

**Analog:** None in codebase.

**Use RESEARCH.md Pattern 2 directly** (verified against official browser demo):
```typescript
import { Packer } from 'docx'
import type { Document } from 'docx'

export async function triggerDownload(doc: Document, filename: string): Promise<void> {
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```
Slug helper (inline — not worth a library):
```typescript
function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
export function proposalFilename(title: string | undefined): string {
  return title ? `${slugify(title)}.docx` : 'proposal-export.docx'
}
```

---

### `src/components/export/PlaceholderBlockModal.tsx` (component, request-response)

**Analog:** `src/components/ProposalEditorModal.tsx`

**Imports pattern** (`src/components/ProposalEditorModal.tsx` lines 1–6):
```typescript
import { useState, useEffect } from 'react'
import { useProposalModal } from '../context/ProposalModalContext'
// ...
```
For the blocking modal, no context needed — receive all data as props:
```typescript
import React from 'react'
```

**Modal overlay pattern** (`src/components/ProposalEditorModal.tsx` lines 83–95):
```typescript
// Backdrop: fixed inset-0, bg-black/40 backdrop-blur-sm, z-50, flex center
// Inner: bg-white rounded-2xl shadow-2xl, stopPropagation on click
<div
  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
  onClick={onClose}
>
  <div
    className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
    onClick={e => e.stopPropagation()}
  >
    {/* content */}
  </div>
</div>
```

**Escape key pattern** (`src/components/ProposalEditorModal.tsx` lines 69–76):
```typescript
useEffect(() => {
  if (!isOpen) return
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') closeModal()
  }
  document.addEventListener('keydown', onKey)
  return () => document.removeEventListener('keydown', onKey)
}, [isOpen, closeModal])
```

**Props interface for PlaceholderBlockModal:**
```typescript
interface Props {
  placeholders: Array<{ id: string; label: string; sectionName: string }>
  onForceExport: () => void
  onClose: () => void
}
```

---

### `src/pages/ProposalDetail.tsx` (modify existing — ExportDropdown wiring)

**Analog:** Self (existing file).

**Current ExportDropdown call site** (line 505):
```tsx
<ExportDropdown />
```
**Target after modification:**
```tsx
<ExportDropdown
  sections={proposalSections.map(s => ({
    name: s.name ?? s.section_key,
    content: s.content ?? '',
  }))}
  proposalTitle={proposal?.title}
/>
```

**`proposalSections` state already available** (lines 151–161) — no new state needed. Pass as prop.

**Current `ExportDropdown` signature** (line 62):
```typescript
function ExportDropdown() {
```
**Target signature:**
```typescript
interface ExportDropdownProps {
  sections: Array<{ name: string; content: string }>
  proposalTitle?: string
}
function ExportDropdown({ sections, proposalTitle }: ExportDropdownProps) {
```

**Outside-click ref pattern** (lines 63–75) — keep exactly as-is:
```typescript
const ref = useRef<HTMLDivElement>(null)
useEffect(() => {
  if (!open) return
  const handler = (e: MouseEvent) => {
    if (!ref.current?.contains(e.target as Node)) setOpen(false)
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [open])
```

**Button/dropdown JSX pattern** (lines 88–113) — keep structure, remove "Export to PowerPoint" button (lines 106–111), wire `handleExport` to real async logic.

**`handleExport` replacement shape:**
```typescript
async function handleExport(force = false) {
  setOpen(false)
  // 1. Scan for unresolved placeholders
  // 2. If any && !force → setBlockedPlaceholders(found) → show modal
  // 3. Else → buildProposalDoc(sections, force) → triggerDownload(doc, filename)
  setExporting(true)
  try { /* ... */ } finally { setExporting(false) }
}
```

---

## Shared Patterns

### File structure conventions
**Source:** `src/lib/markdownToHtml.ts`, `src/lib/migratePlaceholders.ts`
**Apply to:** All new `src/lib/export/*.ts` files

- Named exports only (no default exports from utility modules)
- Single-responsibility: one exported function per file
- Guard empty/falsy input at the top of every function
- No classes — plain functions

### Modal overlay structure
**Source:** `src/components/ProposalEditorModal.tsx` lines 83–95
**Apply to:** `src/components/export/PlaceholderBlockModal.tsx`

```tsx
className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
// inner panel:
className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
```

### TypeScript conventions
**Source:** All existing `src/lib/*.ts` files
**Apply to:** All new files

- Explicit return types on all exported functions
- `?? ''` / `?? []` null coalescing (not `|| ''`) for nullable string fields
- No `any` — use proper interfaces for section shapes

### Test file location
**Source:** `src/lib/__tests__/`, `src/components/editor/__tests__/`
**Apply to:** `src/lib/export/__tests__/`

Tests live in `__tests__/` subdirectory adjacent to the source file. Test filename mirrors source: `htmlToDocx.test.ts`, `buildProposalDoc.test.ts`, `triggerDownload.test.ts`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/lib/export/triggerDownload.ts` | utility | request-response | No file-download utilities exist in codebase; use RESEARCH.md Pattern 2 verbatim |

---

## Metadata

**Analog search scope:** `src/lib/`, `src/components/`, `src/pages/`
**Files scanned:** `migratePlaceholders.ts`, `placeholderHtml.ts`, `markdownToHtml.ts`, `ProposalEditorModal.tsx`, `ProposalDetail.tsx` (lines 1–180, 490–590)
**Pattern extraction date:** 2026-04-29
