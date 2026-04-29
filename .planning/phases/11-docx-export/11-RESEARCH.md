# Phase 11: DOCX Export — Research

**Researched:** 2026-04-29
**Domain:** Client-side DOCX generation, HTML-to-docx conversion, browser file download
**Confidence:** HIGH (library API verified via npm registry + official GitHub docs/demos)

---

## Summary

Phase 11 adds a client-side "Export to Word" button that downloads a `.docx` from live React
state. The `docx` npm package (latest: v9.6.1 — the CONTEXT.md reference to "v8.x" is stale)
handles document assembly. The browser's `DOMParser` API walks TipTap-generated HTML and
converts nodes to `docx` elements. `Packer.toBlob()` produces a `Blob`; a native anchor-click
triggers the download without FileSaver.js.

The single most important architectural finding: **`ExportDropdown` is currently rendered
_outside_ the `SectionWorkspaceProvider` tree**. The provider is embedded inside the
`SectionWorkspace` component (line 287 of SectionWorkspace.tsx), which is mounted at line 575
of ProposalDetail.tsx — seventy lines below where `ExportDropdown` is rendered at line 505.
Calling `useSectionWorkspace()` inside `ExportDropdown` would throw at runtime. The planner
must resolve this before any export logic can read live section content.

The `docx` v9 numbering API requires a `Numbering` config block in the `Document` constructor
and a reference `{ reference, level }` on each list `Paragraph`. This is the most complex part
of the HTML parser and the most common source of bugs in community issues.

**Primary recommendation:** Install `docx@latest` (9.6.1). Lift `SectionWorkspaceProvider` to
wrap both `ExportDropdown` and `SectionWorkspace` in ProposalDetail, OR pass ordered sections
as a prop to `ExportDropdown`. Implement a `htmlToDocxChildren()` converter utility. Use
`Packer.toBlob` + native anchor download.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Library: `docx` npm package v8.x (client-side, already decided). Install it — not yet in package.json.
- HTML parsing: browser `DOMParser` API (no extra library).
- Content source: live React state (`WorkspaceState.sections[key].content`), NOT DB fetch.
- Placeholder blocking: modal before export listing unresolved placeholders, with "Force export
  anyway" escape hatch.
- Styling: Word built-in heading styles (Calibri/Times). No brand colors. No Jamo logo.
- ExportDropdown receives sections as props from ProposalDetail.
- Remove "Export to PowerPoint" menu item.
- Force-export renders each placeholder as yellow-highlighted text with `⚠ MISSING: {label}`
  prefix, plus an "Unresolved Placeholders" summary section prepended to the document.

### Claude's Discretion
- File naming: `{proposal-title-slugified}.docx`, fallback to `proposal-export.docx`.

### Deferred Ideas (OUT OF SCOPE)
- Export to PowerPoint
- REQ-10.4b: Style extraction from org's uploaded DOCX
- REQ-10.4c: Document structure matching (cover pages, TOC, headers/footers, page numbering)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-10.1 | Export button in proposal workspace generates a DOCX file | ExportDropdown stub exists at line 505 of ProposalDetail.tsx; needs props wiring and real handler |
| REQ-10.2 | Export runs client-side using the `docx` npm package (v8.x) | Package is `docx@9.6.1` (latest); v8 branch is superseded — install latest |
| REQ-10.3 | Output formatting: headings H1/H2/H3, paragraph styles, bulleted lists, tables | All supported natively in docx v9 — see Standard Stack and Code Examples sections |
| REQ-10.4 | If org uploaded a template, match section structure | REQ-10.4a satisfied by reading sections in position order from WorkspaceState; 10.4b/c deferred |
| REQ-10.5 | Browser download directly — no server round-trip | `Packer.toBlob()` + anchor-click download — verified pattern in official browser demo |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Placeholder scan (detect unresolved) | Browser / Client | — | Reads live React state; pure DOM scan of HTML strings |
| Blocking modal UI | Browser / Client | — | React component, no server needed |
| HTML → docx element conversion | Browser / Client | — | DOMParser is browser API; docx package runs client-side |
| DOCX assembly | Browser / Client | — | `docx` package is pure JS, no server dependency |
| File download trigger | Browser / Client | — | Blob URL + anchor click, entirely in browser |
| Section ordering | Browser / Client | — | WorkspaceState already holds sections sorted by position |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `docx` | 9.6.1 | DOCX document assembly in browser | Official library; browser-compatible; declarative API; active maintenance (last publish 2026-03-10) |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Browser `DOMParser` | built-in | Parse TipTap HTML strings to DOM trees | No install needed; available in all modern browsers and happy-dom test environment |
| Native `URL.createObjectURL` + `<a>` click | built-in | Trigger file download from Blob | Avoids FileSaver.js dependency; works in all modern browsers |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Native anchor download | `file-saver` (saveAs) | file-saver is the official demo approach but adds a dependency; native anchor works fine for this use case |
| `docx@9.6.1` | `docx@8.x` | v8 is superseded; v9 is latest stable (published 2026-03-10); no known breaking changes relevant to this use case |

**Installation:**
```bash
npm install docx
```

**Version verification:** `npm view docx version` returned `9.6.1` (published 2026-03-10). [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
ProposalDetail (React)
  │
  ├── ExportDropdown (line 505) ◄── must receive orderedSections as prop
  │     │
  │     ├── [placeholder scan] ── DOMParser scans each section's HTML string
  │     │     └── finds span[data-placeholder-id] ──► show blocking modal
  │     │                                              or "Force export anyway"
  │     │
  │     └── [docx assembly] ── htmlToDocxChildren(html) per section
  │           │
  │           ├── DOMParser.parseFromString(html, 'text/html')
  │           ├── walk DOM nodes → Paragraph / TextRun / Table / etc.
  │           └── new Document({ numbering, sections: [{ children }] })
  │                 └── Packer.toBlob(doc)
  │                       └── URL.createObjectURL(blob) → <a>.click()
  │
  └── SectionWorkspace (line 575)  ◄── SectionWorkspaceProvider is INSIDE here
        └── SectionWorkspaceProvider
              └── SectionWorkspaceInner
```

**Critical:** `ExportDropdown` must NOT call `useSectionWorkspace()` — the provider is a
child, not an ancestor. Content must be passed as props from `ProposalDetail`, which already
has `proposalSections` state. The CONTEXT.md decision "ExportDropdown receives sections as
props from ProposalDetail" is exactly correct and must be implemented.

### Recommended Project Structure
```
src/
├── lib/
│   └── export/
│       ├── htmlToDocx.ts        # DOMParser → docx element converter
│       ├── buildProposalDoc.ts  # assembles Document from ordered sections
│       └── triggerDownload.ts   # Packer.toBlob + anchor click
├── components/
│   └── export/
│       └── PlaceholderBlockModal.tsx  # blocking modal before export
└── pages/
    └── ProposalDetail.tsx       # wires sections prop into ExportDropdown
```

### Pattern 1: Document Assembly
**What:** Create a `docx` Document with numbering config + section children
**When to use:** Whenever bullet/ordered lists appear in content

```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/docs/usage/numbering.md
import { Document, Paragraph, TextRun, HeadingLevel, NumberingFormat, AlignmentType } from 'docx'

const BULLET_REF = 'bullet-list'
const ORDERED_REF = 'ordered-list'

const doc = new Document({
  numbering: {
    config: [
      {
        reference: BULLET_REF,
        levels: [
          {
            level: 0,
            format: NumberingFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } },
            },
          },
        ],
      },
      {
        reference: ORDERED_REF,
        levels: [
          {
            level: 0,
            format: NumberingFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } },
            },
          },
        ],
      },
    ],
  },
  sections: [
    {
      children: [
        new Paragraph({ text: 'Heading', heading: HeadingLevel.HEADING_1 }),
        new Paragraph({
          children: [new TextRun({ text: 'Body text', bold: false })],
        }),
        new Paragraph({
          numbering: { reference: BULLET_REF, level: 0 },
          children: [new TextRun('Bullet item')],
        }),
      ],
    },
  ],
})
```

### Pattern 2: Browser Download (no FileSaver)
**What:** Convert Document to Blob, trigger anchor click
**When to use:** All browser downloads

```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/demo/browser-demo.html (adapted)
import { Packer } from 'docx'

async function downloadDocx(doc: Document, filename: string): Promise<void> {
  const blob = await Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
```

### Pattern 3: Placeholder Detection
**What:** Scan HTML string for unresolved PlaceholderMark spans
**When to use:** Before every export attempt

```typescript
// Source: codebase — PlaceholderMark.ts renders span[data-placeholder-id]
function findUnresolvedPlaceholders(html: string): Array<{ id: string; label: string }> {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const spans = doc.querySelectorAll('span[data-placeholder-id]')
  return Array.from(spans).map(span => ({
    id: span.getAttribute('data-placeholder-id') ?? '',
    label: span.getAttribute('data-placeholder-label') ?? span.textContent ?? '',
  }))
}
```

### Pattern 4: Yellow Highlight for Force-Export Placeholders
**What:** Render unresolved placeholder as yellow-highlighted TextRun in Word doc
**When to use:** Force-export path only

```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/demo/45-highlighting-text.ts
import { TextRun } from 'docx'

new TextRun({
  text: `⚠ MISSING: ${label}`,
  highlight: 'yellow',  // Word highlight color name
  bold: true,
})
```

### Pattern 5: HTML → docx Node Walker (skeleton)
**What:** Walk a DOM subtree and emit docx elements
**When to use:** Core of htmlToDocx.ts

```typescript
// [ASSUMED] — pattern based on docx v9 API + DOMParser; verify node types during impl
function htmlToDocxChildren(
  html: string,
  bulletRef: string,
  orderedRef: string,
  forceExport: boolean,
): (Paragraph | Table)[] {
  const dom = new DOMParser().parseFromString(html, 'text/html')
  const result: (Paragraph | Table)[] = []

  function processNode(node: Element): void {
    const tag = node.tagName?.toLowerCase()
    switch (tag) {
      case 'h1': result.push(new Paragraph({ text: node.textContent ?? '', heading: HeadingLevel.HEADING_1 })); break
      case 'h2': result.push(new Paragraph({ text: node.textContent ?? '', heading: HeadingLevel.HEADING_2 })); break
      case 'h3': result.push(new Paragraph({ text: node.textContent ?? '', heading: HeadingLevel.HEADING_3 })); break
      case 'p':  result.push(new Paragraph({ children: inlineChildren(node, forceExport) })); break
      case 'ul': processListItems(node, bulletRef, 0); break
      case 'ol': processListItems(node, orderedRef, 0); break
      case 'table': result.push(buildTable(node, forceExport)); break
      // span[data-placeholder-id] handled in inlineChildren
    }
  }
  // ... (full impl in task)
  return result
}
```

### Anti-Patterns to Avoid
- **Calling `useSectionWorkspace()` inside `ExportDropdown`:** The provider is not an ancestor — this will throw. Always receive sections as props.
- **Using `Packer.toBuffer()` in the browser:** `toBuffer()` is Node.js only. Always use `Packer.toBlob()` in browser contexts.
- **Omitting the `numbering` config from `Document`:** If any `Paragraph` references a numbering ref that isn't declared in `Document.numbering.config`, Word will silently render plain paragraphs with no bullets/numbers.
- **Using `text` shorthand on `Paragraph` when inline formatting is needed:** `new Paragraph({ text: '...' })` does not support bold/italic fragments. Use `children: [new TextRun({ text, bold, italics })]` instead.
- **Nested `<li>` inside `<ul>/<ol>` — direct children only:** TipTap emits `<ul><li>...</li></ul>`. Walk only direct `<li>` children of the list element, not deeper.
- **Ignoring `<br>` tags:** TipTap uses `<br>` for soft line breaks inside paragraphs. Emit `new TextRun({ break: 1 })` instead of ignoring them.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOCX binary assembly | custom XML/zip builder | `docx` npm package | OOXML is complex; relationship files, content types, namespace declarations — dozens of edge cases |
| File download trigger | server endpoint, base64 data URI | `Packer.toBlob` + anchor click | Native browser API, no server round-trip, no extra dependency |
| Slug generation | regex replace | simple `.toLowerCase().replace(/[^a-z0-9]+/g, '-')` inline | Not worth a library for a filename |

**Key insight:** The `docx` package handles all OOXML complexity. The only custom code needed is the HTML-to-docx walker, which is straightforward given that TipTap's HTML output is well-structured.

---

## Common Pitfalls

### Pitfall 1: `ExportDropdown` cannot access `useSectionWorkspace()`
**What goes wrong:** Calling `useSectionWorkspace()` inside `ExportDropdown` throws "useSectionWorkspace must be used within SectionWorkspaceProvider" at runtime.
**Why it happens:** `SectionWorkspaceProvider` is instantiated inside the `SectionWorkspace` component (line 287 of SectionWorkspace.tsx), which is rendered at line 575 of ProposalDetail — below the `ExportDropdown` at line 505.
**How to avoid:** Pass `proposalSections` (already in `ProposalDetail` state) as a prop to `ExportDropdown`. The CONTEXT.md decision already calls for this — it just needs to be implemented.
**Warning signs:** Runtime error immediately on any call to `handleExport`.

### Pitfall 2: Numbering config missing → bullets silently disappear
**What goes wrong:** Bullet and ordered list items render as plain indented paragraphs in Word, no bullet symbol or number.
**Why it happens:** A `Paragraph` with `numbering: { reference, level }` silently falls back if the `reference` isn't declared in `Document.numbering.config`.
**How to avoid:** Always declare at least a bullet and an ordered config in the `Document` constructor, even if the document might not contain lists.
**Warning signs:** DOCX opens in Word but list items have no markers.

### Pitfall 3: `Packer.toBuffer()` in browser → "Nodebuffer is not supported"
**What goes wrong:** `Packer.toBuffer(doc)` throws at runtime in the browser.
**Why it happens:** `toBuffer()` returns a Node.js `Buffer`, which doesn't exist in browsers.
**How to avoid:** Always use `Packer.toBlob(doc)` in browser code. [VERIFIED: official GitHub issue #1272]
**Warning signs:** Export throws with "Nodebuffer is not supported by this platform".

### Pitfall 4: Placeholder spans survive into exported content if scan is skipped
**What goes wrong:** `[data-placeholder-id]` spans export as raw HTML text or as invisible content in Word.
**Why it happens:** The HTML walker doesn't handle `span[data-placeholder-id]` nodes explicitly.
**How to avoid:** In `inlineChildren()`, check for `data-placeholder-id` attribute before processing as plain text. On force-export: emit highlighted TextRun. On normal path: this code should never be reached (modal blocks).
**Warning signs:** Word document contains literal `⚠` or `[PLACEHOLDER:` text without yellow highlight.

### Pitfall 5: `docx` v9 vs v8 API differences
**What goes wrong:** Following v8 examples from Stack Overflow or older docs; some APIs changed.
**Why it happens:** The CONTEXT.md specifies "v8.x" but the current latest is v9.6.1.
**How to avoid:** Always reference https://docx.js.org or the GitHub master branch docs. v9 is the version to install.
**Warning signs:** TypeScript errors on import names, or `IRunOptions` types not matching.

### Pitfall 6: `<table>` with zero rows crashes docx
**What goes wrong:** `new Table({ rows: [] })` throws or produces a corrupt DOCX.
**Why it happens:** Known issue in docx library (GitHub issue #856).
**How to avoid:** Guard table construction — if a parsed `<table>` has no `<tr>` children, emit a Paragraph with the table's text content instead.
**Warning signs:** Export throws during Document assembly.

---

## Code Examples

### Complete browser download flow
```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/demo/browser-demo.html
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx'

const doc = new Document({
  sections: [{
    children: [
      new Paragraph({ text: 'Title', heading: HeadingLevel.HEADING_1 }),
      new Paragraph({ children: [new TextRun({ text: 'Bold ', bold: true }), new TextRun('normal')] }),
    ],
  }],
})

const blob = await Packer.toBlob(doc)
const url = URL.createObjectURL(blob)
const a = document.createElement('a')
a.href = url
a.download = 'proposal.docx'
a.click()
URL.revokeObjectURL(url)
```

### Inline formatting in TextRun
```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/docs/usage/paragraph.md
new TextRun({ text: 'bold italic', bold: true, italics: true })
new TextRun({ text: 'yellow highlight', highlight: 'yellow' })
new TextRun({ break: 1 })  // line break (<br>)
```

### Table structure
```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/docs/usage/tables.md
import { Table, TableRow, TableCell, Paragraph, WidthType } from 'docx'

new Table({
  rows: [
    new TableRow({
      children: [
        new TableCell({ children: [new Paragraph('Cell A1')] }),
        new TableCell({ children: [new Paragraph('Cell A2')] }),
      ],
    }),
  ],
  width: { size: 100, type: WidthType.PERCENTAGE },
})
```

### Bullet and numbered list
```typescript
// Source: https://github.com/dolanmiu/docx/blob/master/docs/usage/numbering.md
// Declare in Document constructor (required)
numbering: {
  config: [
    { reference: 'my-bullets', levels: [{ level: 0, format: NumberingFormat.BULLET, text: '•', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
    { reference: 'my-ordered', levels: [{ level: 0, format: NumberingFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }] },
  ],
},

// Use in Paragraph
new Paragraph({ numbering: { reference: 'my-bullets', level: 0 }, children: [new TextRun('Item')] })
new Paragraph({ numbering: { reference: 'my-ordered', level: 0 }, children: [new TextRun('Step 1')] })
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Packer.toBuffer()` for all targets | `Packer.toBlob()` for browser, `toBuffer()` for Node | docx v5+ | Must use `toBlob` in Vite/browser; `toBuffer` throws |
| `docx` v8.x (CONTEXT.md assumption) | v9.6.1 is current latest | 2024–2025 | Install latest; v9 API is same shape for our use cases |
| FileSaver.js for download | Native `URL.createObjectURL` + `<a>` | Browser API matured | Fewer dependencies; FileSaver.js still works but unnecessary |

**Deprecated/outdated:**
- `Packer.toBuffer()` in browser: throws "Nodebuffer is not supported"
- `docx` v8.x: superseded by v9; no reason to pin to old version

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `docx` v9 `Paragraph.children` + `TextRun` API is backward-compatible with v8 patterns in CONTEXT.md | Standard Stack | Low — v9 is a minor bump; TypeScript will surface any breakage immediately |
| A2 | TipTap HTML output for this project uses `<h1>`/`<h2>`/`<h3>`, `<p>`, `<ul>/<li>`, `<ol>/<li>`, `<table>/<tr>/<td>`, `<strong>`, `<em>` as the full tag set | Code Examples (htmlToDocx walker skeleton) | Medium — if TipTap emits `<b>`/`<i>` instead of `<strong>`/`<em>`, walker needs extra cases |
| A3 | `NumberingFormat`, `AlignmentType` are the correct import names in docx v9 | Code Examples (numbering) | Low — TypeScript will fail at compile time if wrong |
| A4 | Vite's default config handles `docx` v9 without `optimizeDeps` or Node polyfills | Anti-Patterns | Medium — docx v9 uses ESM; Vite pre-bundles CJS. If issues arise, add `optimizeDeps: { include: ['docx'] }` to vite.config.ts |

---

## Open Questions (RESOLVED)

1. **Does TipTap emit `<b>`/`<i>` or `<strong>`/`<em>` for bold/italic?**
   - What we know: TipTap Starter Kit uses `Bold` and `Italic` extensions; default output is `<strong>` and `<em>`.
   - What's unclear: Whether any custom marks in this project override the default tag.
   - Recommendation: Check by running `editor.getHTML()` on a test section with bold text before finalizing the walker. Handle both `<b>`/`<strong>` and `<i>`/`<em>` defensively.
   - RESOLVED: Plan 01 Task 2 handles both `<b>`/`<strong>` and `<i>`/`<em>` defensively in the htmlToDocx walker.

2. **Does `docx` v9 require any Node.js polyfills in Vite?**
   - What we know: `docx` targets browser + Node; no FileSaver.js required; `Packer.toBlob` is browser-native.
   - What's unclear: Whether docx v9 uses any Node builtins (Buffer, stream) in the main bundle path.
   - Recommendation: Install and do a quick smoke test (import + `new Document()`) before the HTML parser task; add `optimizeDeps: { include: ['docx'] }` if Vite throws on cold start.
   - RESOLVED: Plan 01 Task 1 adds `optimizeDeps: { include: ['docx'] }` to vite.config.ts as a precaution.

3. **Should the "Unresolved Placeholders" summary be a prepended Word section or an appended appendix?**
   - What we know: CONTEXT.md says "Prepend a cover page or appendix titled 'Unresolved Placeholders'."
   - What's unclear: "Prepend" implies first page; "appendix" implies last.
   - Recommendation: Prepend as the first section child (before proposal content), so it's impossible to miss. Use a Heading 1 "Unresolved Placeholders" + one paragraph per missing item listing section name and label.
   - RESOLVED: Plan 01 Task 3 prepends the "Unresolved Placeholders" section as the first document child.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `docx` npm package | DOCX assembly | Not installed | — (latest: 9.6.1) | None — must install |
| Browser `DOMParser` | HTML parsing | Built-in | All modern browsers | None needed |
| `URL.createObjectURL` | File download | Built-in | All modern browsers | None needed |
| Node.js / npm | Package install | Available | — | — |

**Missing dependencies with no fallback:**
- `docx` must be installed (`npm install docx`) before any implementation task.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (vitest in devDependencies) |
| Config file | vitest.config.ts (or vite.config.ts with `test` key — check at Wave 0) |
| Quick run command | `npx vitest run src/lib/export` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-10.1 | Export button renders and calls handler | unit | `npx vitest run src/lib/export` | Wave 0 |
| REQ-10.2 | `Packer.toBlob` called with assembled Document | unit | `npx vitest run src/lib/export` | Wave 0 |
| REQ-10.3 | H1/H2/H3, paragraphs, bullets, tables all convert correctly | unit | `npx vitest run src/lib/export` | Wave 0 |
| REQ-10.4 | Sections exported in position order | unit | `npx vitest run src/lib/export` | Wave 0 |
| REQ-10.5 | Anchor download triggered (no fetch call) | unit (spy on anchor click) | `npx vitest run src/lib/export` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run src/lib/export`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/export/__tests__/htmlToDocx.test.ts` — unit tests for HTML-to-docx converter (REQ-10.3)
- [ ] `src/lib/export/__tests__/buildProposalDoc.test.ts` — section ordering, placeholder detection (REQ-10.4, REQ-10.1)
- [ ] `src/lib/export/__tests__/triggerDownload.test.ts` — Packer.toBlob + anchor spy (REQ-10.2, REQ-10.5)
- [ ] `npm install docx` — package not yet in package.json

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | Export operates on already-authenticated proposal data in React state |
| V5 Input Validation | yes | HTML content from TipTap is already user-authored; DOMParser in read-only mode (no eval, no script execution) |
| V6 Cryptography | no | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malicious HTML in section content → XSS via DOMParser | Tampering | DOMParser in `'text/html'` mode does not execute scripts; only reading `.textContent` and attributes — no innerHTML injection into live DOM |
| Section content leaks to server | Information Disclosure | Entire export is client-side; no network call made — by design |

---

## Sources

### Primary (HIGH confidence)
- npm registry — `npm view docx version` → 9.6.1, published 2026-03-10 [VERIFIED: npm registry]
- https://github.com/dolanmiu/docx/blob/master/demo/browser-demo.html — `Packer.toBlob` + download pattern [VERIFIED: WebSearch hit, official repo]
- https://github.com/dolanmiu/docx/blob/master/docs/usage/numbering.md — numbering config structure [VERIFIED: WebSearch hit, official repo]
- https://github.com/dolanmiu/docx/blob/master/docs/usage/tables.md — TableRow/TableCell/children structure [VERIFIED: WebSearch hit, official repo]
- https://github.com/dolanmiu/docx/blob/master/demo/45-highlighting-text.ts — `highlight: 'yellow'` on TextRun [VERIFIED: WebSearch hit, official repo]
- Codebase — `src/components/editor/extensions/PlaceholderMark.ts` — `span[data-placeholder-id]` attribute contract [VERIFIED: codebase read]
- Codebase — `src/context/SectionWorkspaceContext.tsx` + `SectionWorkspace.tsx` lines 285-291 — provider scope [VERIFIED: codebase read]

### Secondary (MEDIUM confidence)
- GitHub issue #1272 "Nodebuffer is not supported by this platform" — confirms `toBuffer` fails in browser [CITED: github.com/dolanmiu/docx/issues/1272]
- GitHub issue #856 "Table with zero rows issue" — confirms table guard needed [CITED: github.com/dolanmiu/docx/issues/856]

### Tertiary (LOW confidence)
- None — all critical claims verified from primary sources.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm registry confirmed version, official GitHub docs confirmed API
- Architecture: HIGH — codebase read confirmed ExportDropdown/Provider topology
- Pitfalls: HIGH — confirmed from official GitHub issues and official demos

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (stable library; docx v9 unlikely to change)
