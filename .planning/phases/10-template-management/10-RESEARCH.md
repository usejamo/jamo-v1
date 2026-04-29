# Phase 10: Template Management - Research

**Researched:** 2026-04-18
**Domain:** Supabase schema design, file upload/extraction reuse, prompt injection, React Settings/Wizard UI extension
**Confidence:** HIGH (all findings grounded in existing codebase inspection)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Template selection presented as visual cards in Step 4 (name, description, source badge). Consistent with Step 3 assumption cards.
- **D-02:** Template selection is optional. ContextSummary shows "No template — using standard structure" when nothing selected.
- **D-03:** Pre-built templates appear first; org-uploaded templates below with a separator.
- **D-04:** Add "Templates" sub-tab to Settings using the existing `SUB_TABS` const + render switch pattern.
- **D-05:** Template upload and management is admin-only.
- **D-06:** Admins can delete uploaded templates; show confirmation dialog before deletion.
- **D-07:** Templates tab shows: list of all org-accessible templates, upload zone, status per template, collapsible section list per template.
- **D-08:** Seed 3 pre-built CRO proposal templates: Phase I/II Oncology Study, Bioequivalence Study, Global Multi-Site Phase III Study.
- **D-09:** Pre-built templates stored as seed data in `templates` table — JSON array of section records. No DOCX files needed.
- **D-10:** Pre-built templates are platform-wide (no org_id); org-uploaded templates are RLS-scoped to `org_id`.
- **D-11:** Each `template_section` record must include `name` (org label) and `role` (internal section type mapping). Mandatory even for MVP.
- **D-12:** MVP injects style guide using section `name` and `description` into generation prompts. V2 renders `name` in workspace nav. V3 supports null `role`.
- **D-13:** Schema must be forward-compatible from the first migration.
- **D-14:** Selected template's section list injected into each section's generation prompt as style guide block. Additive — does not change workspace routing/nav/labels.
- **D-15:** Injection format: clearly labeled block, e.g. "The organization uses the following proposal template. Adapt your tone, structure, and section naming to match this format: [section list]". Separate from RAG chunks.
- **D-16:** No template selected = no template injection (standard behavior, no change from current).
- **D-17:** Template extraction reuses Phase 3 parsing pipeline (extract-document edge function: pdf-parse for PDF, mammoth for DOCX).
- **D-18:** Settings shows extraction status per template: uploading → extracting → ready (or error).
- **D-19:** After extraction: show read-only collapsible "View detected sections (N)" disclosure. Collapsed by default.
- **D-20:** Low-confidence warning inline (amber): "We detected fewer sections than expected — review before using this template." Does not block use.
- **D-21:** Admins cannot edit sections in Settings — section list is read-only.

### Claude's Discretion
- Exact Supabase table structure (`templates`, `template_sections`) — column names, indexes, foreign keys
- How to detect low extraction confidence (word count threshold, heading count heuristic, or both)
- Whether `template_id` is stored on `proposals` at generation time for audit purposes (recommended but not required)
- Exact wording of the style guide injection block in the generation prompt

### Deferred Ideas (OUT OF SCOPE)
- Section editing in Settings (admin edits detected section list) — V2 template editor
- Custom section sets where `role` is null — V3
- Workspace section label renaming based on org template — V2
- Template versioning / cloning — post-MVP
- Global template library shared across orgs — post-MVP
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-9.1 | 2–3 pre-built CRO proposal templates seeded in the platform | D-08/D-09: seed data in `templates` table, JSON sections, no DOCX needed |
| REQ-9.2 | Organizations can upload their own proposal templates (DOCX/PDF) | D-17: reuse extract-document edge function; FileUpload component reuse |
| REQ-9.3 | Uploaded template text extracted and included in AI generation context | D-14/D-15: inject as labeled system prompt block in `buildSectionPrompt` |
| REQ-9.4 | Template selection in Step 4 of the wizard | D-01/D-02: visual cards above ContextSummary; `selectedTemplateId` added to WizardState |
| REQ-9.5 | Templates scoped to org (org can't see another org's templates) | D-10/D-11: RLS on `templates` table; pre-built rows use `org_id = NULL` with policy allowing all |
</phase_requirements>

---

## Summary

Phase 10 is a well-bounded integration phase with no new technical unknowns. All infrastructure already exists: the extraction pipeline (Phase 3), RLS patterns (Phase 4/7), prompt injection format (Phase 7/9), Settings sub-tab pattern (Phase 8 Auth), and the wizard card UI (Phase 6 assumption cards). The work is almost entirely additive: new DB tables, a new edge function (template-extract), UI extensions to Settings and Step4Generate, and one modification to `buildSectionPrompt` in `generate-proposal-section`.

The most complex decisions are all already locked (D-11 schema forward-compatibility, D-15 prompt format). The planner's discretionary decisions (table column names, low-confidence heuristic, audit `template_id` on proposals) are well-scoped and low-risk.

**Primary recommendation:** Three waves — (1) DB schema + seed data, (2) Settings TemplatesTab + upload/extraction wiring, (3) Step4 selector + prompt injection.

---

## Standard Stack

### Core (all already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | project-installed | DB queries, Storage upload, RLS enforcement | Already wired; pattern established across all phases |
| `mammoth` (Deno `npm:mammoth`) | project-pinned | DOCX text extraction | Used in extract-document edge function; reuse directly |
| `pdfjs` (Deno import) | project-pinned | PDF text extraction | Used in extract-document; same import path |
| React + TailwindCSS | project-installed | UI components | Entire app uses these |

### No New Dependencies Required
All libraries needed for Phase 10 are already installed. The template-extract edge function will import `mammoth` and `pdfjs` exactly as `extract-document/index.ts` does. [VERIFIED: codebase inspection]

---

## Architecture Patterns

### Recommended Project Structure

```
supabase/
├── migrations/
│   └── 20260418000023_templates.sql       # templates + template_sections tables + RLS + seed data
├── functions/
│   └── template-extract/
│       └── index.ts                        # new edge function (reuses extract-document pattern)
src/
├── components/
│   └── wizard/
│       └── Step4Generate.tsx              # extend: add TemplateSelector above ContextSummary
├── pages/
│   └── Settings.tsx                       # extend: add 'Templates' to SUB_TABS, add TemplatesTab branch
├── components/settings/
│   └── TemplatesTab.tsx                   # new: admin template management UI
└── types/
    └── wizard.ts                          # extend: add selectedTemplateId to WizardState
```

### Pattern 1: Settings Sub-Tab Extension

**What:** Add `'Templates'` to the `SUB_TABS` const array and a matching render branch.

**Exact change in `Settings.tsx`:**
```typescript
// Source: [VERIFIED: src/pages/Settings.tsx line 126]
// BEFORE:
const SUB_TABS = ['Profile', 'Integrations', 'General', 'Notifications'] as const

// AFTER:
const SUB_TABS = ['Profile', 'Integrations', 'General', 'Notifications', 'Templates'] as const
```

Add to the render switch at the bottom of `Settings()`:
```typescript
{activeTab === 'Templates' && <TemplatesTab />}
```

`TemplatesTab` is a separate component file to keep Settings.tsx manageable.

### Pattern 2: WizardState Extension

**What:** Add `selectedTemplateId` and bump `stateVersion` to 7.

```typescript
// Source: [VERIFIED: src/types/wizard.ts]
export interface WizardState {
  // ... existing fields ...
  selectedTemplateId: string | null   // new — null = no template selected
  stateVersion: 7                     // bump from 6 to clear stale sessionStorage
}
```

Add to `WizardAction`:
```typescript
| { type: 'SET_TEMPLATE'; templateId: string | null }
```

Add to `DEFAULT_WIZARD_STATE`:
```typescript
selectedTemplateId: null,
stateVersion: 7,
```

The stateVersion guard in `ProposalCreationWizard.tsx` already handles clearing stale sessionStorage when version mismatches. [VERIFIED: codebase — STATE.md documents this pattern established in Phase 6 Plan 01]

### Pattern 3: Prompt Injection in buildSectionPrompt

**What:** Extend `buildSectionPrompt` in `generate-proposal-section/index.ts` to accept and inject template context.

```typescript
// Source: [VERIFIED: supabase/functions/generate-proposal-section/index.ts lines 92-159]
export function buildSectionPrompt(params: {
  sectionId: string
  tone: string
  ragChunks: Array<{ content: string; doc_type?: string; agency?: string }>
  anchor: string
  proposalInput: { ... }
  templateContext?: {          // NEW — optional
    sections: Array<{ name: string; role: string; description?: string }>
  }
}): { system: string; userMessage: string } {
  // ... existing logic ...

  // Inject AFTER ragChunks block, BEFORE instructions — clearly separated per D-15
  if (params.templateContext?.sections?.length) {
    const sectionList = params.templateContext.sections
      .map((s, i) => `${i + 1}. ${s.name}${s.description ? ` — ${s.description}` : ''}`)
      .join('\n')
    system += `\n\n[TEMPLATE CONTEXT]\nThe organization uses the following proposal template. Adapt your tone, structure, and section naming to match this format:\n${sectionList}\n[/TEMPLATE CONTEXT]`
  }
}
```

This follows the exact `[REGULATORY CONTEXT]/[/REGULATORY CONTEXT]` bracket pattern already used for RAG chunks (line 114–116). [VERIFIED: codebase]

### Pattern 4: Database Schema

**Recommended schema (Claude's Discretion):**

```sql
-- templates table
CREATE TABLE templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL for pre-built
  name         text NOT NULL,
  description  text,
  source       text NOT NULL CHECK (source IN ('prebuilt', 'uploaded')),
  file_path    text,                -- Storage path for uploaded templates; NULL for pre-built
  parse_status text NOT NULL DEFAULT 'ready'
                   CHECK (parse_status IN ('pending', 'extracting', 'ready', 'error')),
  low_confidence boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- template_sections table
CREATE TABLE template_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name         text NOT NULL,       -- org's label (D-11)
  role         text,                -- internal section type, e.g. 'scope_of_work' (D-11, nullable for V3)
  description  text,
  position     int NOT NULL,        -- ordering
  org_id       uuid                 -- denormalized for RLS (per REQ-7.4 pattern)
);

-- RLS: org-uploaded templates visible only to their org; pre-built (org_id IS NULL) visible to all
CREATE POLICY "templates_select" ON templates FOR SELECT
  USING (org_id IS NULL OR org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

-- Admin-only write policies for uploaded templates
CREATE POLICY "templates_insert_admin" ON templates FOR INSERT
  WITH CHECK (
    org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'admin'
  );

CREATE POLICY "templates_delete_admin" ON templates FOR DELETE
  USING (
    org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) = 'admin'
  );
```

**Key design decisions (Claude's discretion):**
- `org_id IS NULL` for pre-built templates is the simplest approach that avoids a fake "platform" org. RLS policy handles both cases in one expression.
- `org_id` denormalized onto `template_sections` for RLS (matches REQ-7.4 pattern: "org_id denormalized onto every table"). [VERIFIED: REQUIREMENTS.md REQ-7.4]
- `role` is nullable at the column level now to support V3 (D-12/D-13), but seed data and Phase 10 uploads always populate it.
- `low_confidence` boolean set by `template-extract` edge function (simpler than exposing a score to the UI).

### Pattern 5: Low-Confidence Detection (Claude's Discretion)

**Recommended heuristic — both conditions:**
- Heading count < 3 (fewer than 3 detected headings in the extracted text), OR
- Total word count < 200

Both are computable from the mammoth/pdfjs output without an additional AI call. Set `low_confidence = true` in the DB row when either fires. This is the same lightweight heuristic style used by `classifyDocument` in `extract-document/index.ts`. [VERIFIED: codebase]

### Pattern 6: template-extract Edge Function

**What:** A new edge function modeled closely on `extract-document/index.ts` but storing results in `template_sections` instead of `document_extracts`.

**Flow:**
1. Receive `{ templateId }` in request body
2. Fetch the template row (get `file_path`, `org_id`)
3. Download file from Supabase Storage
4. Extract text via mammoth (DOCX) or pdfjs (PDF)
5. Parse headings from extracted text to build section list
6. Detect low confidence (heading count / word count thresholds)
7. Bulk-insert rows into `template_sections`
8. Update `templates.parse_status` to `'ready'` (or `'error'`)
9. Set `templates.low_confidence` flag

**Heading extraction for DOCX:** mammoth's `extractRawText` returns plain text. For DOCX, prefer `mammoth.convertToHtml` (already available via `npm:mammoth`) to get `<h1>`/`<h2>`/`<h3>` tags — parse heading text from those. [VERIFIED: extract-document/index.ts uses `extractRawText`; mammoth docs confirm `convertToHtml` is also available]

**Heading extraction for PDF:** pdfjs returns lines of text. Heuristic: lines in ALL-CAPS or lines shorter than 80 chars that end without punctuation are candidate headings.

### Pattern 7: Template Cards in Step 4

**What:** Add a `TemplateSelector` sub-component above `ContextSummary` in `Step4Generate.tsx`. Fetches templates on mount (pre-built + org-uploaded), renders visual cards.

```typescript
// Selected card style — consistent with active sidebar items (from CONTEXT.md specifics)
const selectedClass = 'bg-jamo-50 border-jamo-300 ring-2 ring-jamo-200'
const defaultClass  = 'bg-white border-gray-200 hover:border-gray-300'

// Source badge
const sourceBadge = template.source === 'prebuilt'
  ? <span className="text-[11px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">Pre-built</span>
  : <span className="text-[11px] text-jamo-600 bg-jamo-50 px-2 py-0.5 rounded-full">Your template</span>
```

Cards with `parse_status !== 'ready'` are shown as disabled (grayed out, cursor-not-allowed).

### Anti-Patterns to Avoid

- **Don't create a separate extract-template edge function that re-implements PDF/DOCX parsing from scratch.** Reuse the exact same import pattern from `extract-document/index.ts`. [VERIFIED: D-17]
- **Don't inject template context inside the user message.** Inject in the system prompt to match how RAG chunks are injected. [VERIFIED: generate-proposal-section/index.ts line 107+]
- **Don't scope pre-built templates with a fake `org_id`.** Use `org_id IS NULL` — it's the idiomatic SQL pattern for platform-wide data.
- **Don't put the `[TEMPLATE CONTEXT]` block before RAG chunks.** Order in system prompt: base prompt → section instruction → consistency anchor → RAG chunks → template context → (end). This matches the established prompt layering from Phase 9 D-16.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DOCX text/heading extraction | Custom parser | `npm:mammoth` (already in extract-document) | Handles styles, heading hierarchy |
| PDF text extraction | Custom parser | `pdfjs` (already in extract-document) | Already Deno-compatible, tested in production |
| File upload to Storage | Custom XHR | `FileUpload.tsx` (or adapt pattern) | Handles per-file status, org-scoped paths, error cleanup |
| Status badge display | Custom styled spans | `StatusBadge.tsx` | Already handles processing/ready/error states |
| Section disclosure toggle | Custom accordion | Native `<details>`/`<summary>` or simple chevron useState | No library needed for read-only display |

---

## Common Pitfalls

### Pitfall 1: mammoth heading detection requires convertToHtml, not extractRawText

**What goes wrong:** Using `mammoth.extractRawText` (as extract-document does) loses all heading structure — the output is flat text with no way to detect section breaks.
**Why it happens:** extractRawText is simpler and sufficient for RAG/generation context (Phase 3), but for template section detection, heading structure is the data.
**How to avoid:** In `template-extract/index.ts`, call `mammoth.convertToHtml` first to get heading-tagged HTML, then parse `<h1>`, `<h2>`, `<h3>` tags. Fall back to extractRawText word-count for the confidence heuristic only.
**Warning signs:** Template shows 0 detected sections for a well-structured DOCX.

### Pitfall 2: RLS policy must allow NULL org_id for pre-built templates

**What goes wrong:** A standard `org_id = auth_org_id()` policy blocks reads on pre-built templates (where `org_id IS NULL`).
**Why it happens:** Equality check fails on NULL in SQL (`NULL = anything` is NULL, not TRUE).
**How to avoid:** Use `org_id IS NULL OR org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())` in the SELECT policy. [VERIFIED: SQL NULL behavior]

### Pitfall 3: stateVersion must be bumped when adding selectedTemplateId

**What goes wrong:** Users with sessionStorage from stateVersion:6 get a WizardState missing `selectedTemplateId`, causing TypeScript errors or undefined behavior.
**Why it happens:** The wizardReducer initializes from sessionStorage without type-checking the shape.
**How to avoid:** Bump to `stateVersion: 7` in `DEFAULT_WIZARD_STATE`. The existing guard in `ProposalCreationWizard.tsx` detects the version mismatch and clears stale state. [VERIFIED: STATE.md — this pattern was established in Phase 6 Plan 01]

### Pitfall 4: template_sections org_id denormalization

**What goes wrong:** Omitting `org_id` from `template_sections` violates REQ-7.4 and makes it impossible to write simple RLS policies without a join to the parent `templates` table.
**Why it happens:** It's tempting to rely on the FK to `templates` and use a subquery in the policy.
**How to avoid:** Denormalize `org_id` onto `template_sections` at insert time (set it from the parent template row). Match the pattern on all other tables. [VERIFIED: REQUIREMENTS.md REQ-7.4]

### Pitfall 5: Edge function sees no storage file if path convention differs

**What goes wrong:** `template-extract` downloads from Storage but the path doesn't match what was stored during upload.
**Why it happens:** Existing convention is `{org_id}/{proposal_id}/{filename}`. Templates have no proposal_id.
**How to avoid:** Use a `templates/` prefix bucket path: `{org_id}/templates/{template_id}/{filename}`. Store this full path in `templates.file_path`. Pass the same path to the edge function for download.

---

## Code Examples

### Fetch templates for Step 4 selector

```typescript
// Source: [VERIFIED: established Supabase query pattern from codebase]
const { data: templates } = await supabase
  .from('templates')
  .select('id, name, description, source, parse_status')
  // RLS handles org filtering — no explicit where needed
  .order('source', { ascending: true })  // 'prebuilt' sorts before 'uploaded'
  .order('name', { ascending: true })
```

### ContextSummary template line (Step 4)

```typescript
// Source: [VERIFIED: src/components/wizard/Step4Generate.tsx]
const templateLabel = state.selectedTemplateId
  ? templates.find(t => t.id === state.selectedTemplateId)?.name ?? 'Selected'
  : 'No template — using standard structure'
```

### template-extract edge function: invoke from TemplatesTab after upload

```typescript
// Source: [VERIFIED: fire-and-forget pattern from Phase 3 Plan 04 / Step2DocumentUpload]
// After Storage upload completes and templates row is inserted:
supabase.functions.invoke('template-extract', {
  body: { templateId: newTemplateRow.id }
}).catch(err => console.error('[template-extract] invoke error', err))
// No await — status polling handles UI updates
```

### Seed data for pre-built templates

```sql
-- Source: [ASSUMED] — data content; migration pattern is [VERIFIED: codebase]
INSERT INTO templates (id, org_id, name, description, source, parse_status) VALUES
  (gen_random_uuid(), NULL, 'Phase I/II Oncology Study',
   'Template for first-in-human and dose-expansion oncology trials requiring adaptive design and safety monitoring sections.',
   'prebuilt', 'ready'),
  (gen_random_uuid(), NULL, 'Bioequivalence Study',
   'Template for BE/BA studies with pharmacokinetic endpoints, crossover design, and regulatory submission focus.',
   'prebuilt', 'ready'),
  (gen_random_uuid(), NULL, 'Global Multi-Site Phase III Study',
   'Template for large-scale pivotal trials across multiple regions with site management, data reconciliation, and regulatory strategy.',
   'prebuilt', 'ready');
```

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Seed data content (template names, descriptions, section names for pre-built templates) | Code Examples / D-08 | Low — names are locked (D-08); section list content is cosmetic and editable in seed SQL |
| A2 | `mammoth.convertToHtml` is available in the same `npm:mammoth` Deno import used in extract-document | Pitfall 1 / Pattern 6 | Medium — if not available, fall back to regex heading heuristic on plain text |
| A3 | Storage bucket for templates can reuse the existing `documents` private bucket with a `templates/` path prefix | Pattern 5 / Environment | Low — Supabase Storage is path-based; same bucket, different prefix is standard practice |

---

## Open Questions

1. **Should `template_id` be recorded on `proposals` at generation time for audit?**
   - What we know: D context marks this as Claude's discretion; REQ-10.4 says "if the org uploaded a template, export attempts to match that template's section structure" — which requires knowing which template was used at export time.
   - What's unclear: Whether Phase 10 must implement this for REQ-10.4 (export is Phase 10 scope? No — REQ-10.4 is M1-10 DOCX Export, a separate phase).
   - Recommendation: Add `selected_template_id uuid REFERENCES templates(id)` as a nullable column on `proposals` now (schema is cheap; the export phase will need it). Set it when generation starts.

2. **Does the template-extract edge function need its own Deno function deploy or can it be co-located?**
   - What we know: All other edge functions are separate directories under `supabase/functions/`.
   - Recommendation: Follow the established pattern — separate `template-extract/` directory. The reuse is code-pattern reuse, not literal file sharing (Deno Edge can't share across function boundaries anyway — confirmed by STATE.md: "Edge Function utilities inlined").

---

## Environment Availability

Step 2.6: SKIPPED (no new external dependencies — all libraries already in use in production edge functions).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-9.1 | Pre-built templates fetchable (org_id IS NULL, RLS pass-through) | unit | `npm run test:run -- --grep "REQ-9.1"` | Wave 0 |
| REQ-9.2 | Template upload triggers extraction edge function | unit (mock) | `npm run test:run -- --grep "REQ-9.2"` | Wave 0 |
| REQ-9.3 | buildSectionPrompt injects [TEMPLATE CONTEXT] block when templateContext provided | unit | `npm run test:run -- --grep "REQ-9.3"` | Wave 0 |
| REQ-9.4 | Step4Generate renders TemplateSelector; selecting card dispatches SET_TEMPLATE | unit | `npm run test:run -- --grep "REQ-9.4"` | Wave 0 |
| REQ-9.5 | Org B cannot read Org A's uploaded templates (RLS) | unit (mock RLS) | `npm run test:run -- --grep "REQ-9.5"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test:run`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/wizard/__tests__/Step4Generate.test.tsx` — covers REQ-9.4 (extend existing or new file)
- [ ] `src/components/settings/__tests__/TemplatesTab.test.tsx` — covers REQ-9.2
- [ ] `supabase/functions/generate-proposal-section/test.ts` — add `buildSectionPrompt` template injection test (extend existing) — covers REQ-9.3
- [ ] `supabase/functions/template-extract/test.ts` — Deno test stubs — covers REQ-9.1, REQ-9.5

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Supabase Auth already in place |
| V3 Session Management | no | Supabase JWT; no changes |
| V4 Access Control | yes | RLS policies on `templates` and `template_sections`; admin-only write enforced at DB level |
| V5 Input Validation | yes | Edge function validates `templateId` exists and belongs to org before downloading from Storage |
| V6 Cryptography | no | No new cryptographic operations |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Org A uploads file to Storage path for Org B | Tampering | Storage RLS policy enforces `(storage.foldername(name))[1] = org_id` — same pattern as documents bucket |
| Admin deletes pre-built template | Tampering | INSERT/DELETE policies check `org_id IS NOT NULL` — pre-built rows (org_id IS NULL) cannot be deleted via API |
| Prompt injection via template section names | Tampering | Template content inserted as data block with clear delimiters; Anthropic model treats it as context, not instructions. No additional sanitization needed for MVP. |
| SSRF via uploaded DOCX/PDF | Elevation | mammoth/pdfjs parse in Edge Function sandbox; no network calls from within parsers |

---

## Sources

### Primary (HIGH confidence)
- `src/pages/Settings.tsx` — SUB_TABS pattern, existing tab structure verified
- `src/types/wizard.ts` — WizardState shape, stateVersion pattern verified
- `src/components/wizard/Step4Generate.tsx` — current Step 4 structure verified
- `supabase/functions/generate-proposal-section/index.ts` — buildSectionPrompt signature, system prompt injection pattern, RAG chunk bracket format verified
- `supabase/functions/extract-document/index.ts` — mammoth/pdfjs import pattern, extractRawText usage verified
- `.planning/phases/10-template-management/10-CONTEXT.md` — all decisions D-01 through D-21 verified

### Secondary (MEDIUM confidence)
- `mammoth.convertToHtml` availability: confirmed available in mammoth npm package API; specific Deno `npm:mammoth` export verified via extract-document import pattern

### Tertiary (LOW confidence / ASSUMED)
- Seed data section lists for 3 pre-built templates (A1) — content TBD, planner should define reasonable section lists per study type
- Storage bucket reuse for templates prefix (A3) — standard practice, not explicitly verified against Supabase Storage docs

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all reuse verified in codebase
- Architecture: HIGH — all patterns traced to existing production code
- Pitfalls: HIGH — each pitfall verified against actual codebase constraints
- Seed data content: LOW (ASSUMED) — planner should define section lists for 3 templates

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 (stable stack; Supabase/Anthropic API changes unlikely to affect this scope)
