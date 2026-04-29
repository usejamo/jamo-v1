# Phase 11: DOCX Export — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Client-side DOCX export of a generated proposal from the workspace. The user clicks "Export" → a `.docx` file downloads in the browser. No server round-trip. Covers: HTML-to-docx conversion, placeholder blocking logic, and Word styling.

**Not in this phase:**
- Export to PowerPoint (deferred)
- Template style extraction from org's uploaded DOCX (deferred — REQ-10.4b)
- Document structure matching: cover pages, TOC, headers/footers, page numbering (deferred — REQ-10.4c)

</domain>

<decisions>
## Implementation Decisions

### Export button placement
Use the existing `ExportDropdown` stub in `src/pages/ProposalDetail.tsx` (line 62). It already renders next to the "Run consistency check" button. The `handleExport` function is currently a fake timeout — wire it up with real `docx` generation. Give `ExportDropdown` access to section content by passing sections/proposal data as props from `ProposalDetail`.

"Export to PowerPoint" menu item: remove it (out of scope for Phase 11). Keep only "Export to Word".

### Content source
Read from `WorkspaceState.sections[key].content` (HTML string, updated on every keystroke). Sections are already position-ordered by Phase 10.1's template system. Pass the ordered sections array down from `ProposalDetail` into `ExportDropdown` as props (or read from workspace context if accessible at that level).

**Do not fetch from DB at export time** — live React state is authoritative and avoids async complexity.

### Placeholder handling — BLOCKING EXPORT
Export must make unresolved placeholders impossible to overlook. The strategy is:

**Default behavior (block):**
- Before generating the DOCX, scan all section HTML for active PlaceholderMark spans (`[data-placeholder-id]`).
- If any exist, show a modal listing them grouped by section, with a "Resolve →" link to jump to each section.
- Export does NOT proceed until all are resolved, OR the user explicitly overrides.

**Force export escape hatch:**
- Modal includes a "Force export anyway" button (visually de-emphasized, e.g. text link not primary button).
- If the user forces export, proceed with the DOCX but:
  1. Render each placeholder as yellow-highlighted text with a `⚠ MISSING: {label}` prefix in the Word doc.
  2. Prepend a cover page or appendix titled "Unresolved Placeholders" listing every missing item by section name.

**Rationale:** These exports go to pharma sponsors, IRBs, and regulators. A missed placeholder in a submitted document is an embarrassing or legally awkward failure. "Ideally this never happens" is exactly the framing that requires enforcement, not just styling.

### DOCX styling
Use Word built-in heading styles (Heading 1 for section title, Heading 2/3 for sub-headings within content), standard paragraph/body text, conservative fonts (Calibri or Times New Roman). **No brand colors. No Jamo logo.** The output must look like a professionally submitted business document.

Library: `docx` npm package v8.x (client-side, already decided in REQUIREMENTS.md). Install it — not yet in `package.json`.

### HTML → docx conversion
TipTap stores content as HTML (via `editor.getHTML()`). The `docx` package requires structured JS objects (Paragraph, Table, TextRun, etc.) — it does not accept raw HTML. Phase 11 must implement an HTML parser that walks the DOM and converts nodes to `docx` elements:

- `<h1>` / `<h2>` / `<h3>` → `HeadingLevel.HEADING_1/2/3`
- `<p>` → `Paragraph` with `TextRun`
- `<ul>` / `<li>` → `Paragraph` with `bullet` style
- `<ol>` / `<li>` → `Paragraph` with `numbering`
- `<table>` / `<tr>` / `<td>` → `Table` / `TableRow` / `TableCell`
- `<strong>` → `bold: true`
- `<em>` → `italics: true`
- PlaceholderMark spans (`[data-placeholder-id]`) → see placeholder handling above

Use the browser's `DOMParser` API to parse HTML strings (available client-side, no extra library needed).

### File naming
**Claude's Discretion.** Suggested: `{proposal-title-slugified}.docx` using the proposal title from `ProposalDetail` state. Fall back to `proposal-export.docx` if no title.

### REQ-10.4 — "match section structure if org has uploaded template"
**This phase satisfies REQ-10.4a only.** Section order and names are already driven by the template system (Phase 10.1). Export reads sections in position order — REQ-10.4a is satisfied with no additional work.

**Do not mark REQ-10.4 as fully satisfied.** Explicitly split into:
- **REQ-10.4a** ✅ Section order/names from template — done (Phase 10.1 + this phase)
- **REQ-10.4b** 🔜 Style extraction from uploaded DOCX (unzip, pull `styles.xml`, inject into generated DOCX) — deferred phase
- **REQ-10.4c** 🔜 Document structure matching (cover pages, TOC, headers/footers, page numbering) — deferred phase

</decisions>

<canonical_refs>
## Canonical References

- `.planning/REQUIREMENTS.md` — REQ-10.1 through REQ-10.5 (DOCX export requirements)
- `.planning/ROADMAP.md` — Phase 11 description and deliverables
- `src/pages/ProposalDetail.tsx` — `ExportDropdown` stub (line 62), Export + consistency check buttons (line 505)
- `src/components/editor/SectionEditorBlock.tsx` — TipTap editor, HTML content via `getHTML()`, PlaceholderMark migration
- `src/types/workspace.ts` — `SectionEditorState`, `WorkspaceState`, `SectionEditorHandle`
- `src/components/editor/SectionWorkspace.tsx` — workspace layout, section ordering, `editorRefsRef`

</canonical_refs>

<specifics>
## Specific Ideas & Quotes

- "The export's job when unresolved placeholders exist is to make the gap impossible to overlook, not just to render it as bracketed text that can be skimmed past."
- "If you trust the user to catch their own gaps, you don't need any rendering at all. The reason to render anything is the case where they missed it — and in that case, options 1 and 3 are too quiet."
- "CRO proposals to pharma sponsors should look like submitted business documents, not tool output."
- "Template style extraction is a real and valuable feature — but a meaningfully bigger scope. Ship sensible defaults first, make that a separate phase."
- "Don't close out REQ-10.4 as fully satisfied — explicitly note that styling and document structure matching are deferred. Otherwise the real work has no home."

## Deferred Ideas

- Export to PowerPoint (separate phase or backlog)
- REQ-10.4b: Style extraction from org's uploaded DOCX (`styles.xml` injection) — separate phase
- REQ-10.4c: Document structure matching (cover pages, TOC, headers/footers, page numbering) — separate phase

</specifics>
