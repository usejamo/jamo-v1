# Phase 10: Template Management - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning

<domain>
## Phase Boundary

Enable CRO organizations to select from pre-built templates and upload their own proposal templates (DOCX/PDF). Extracted template content is injected into AI generation prompts as a style/structure guide. Template selector added to wizard Step 4. Template management UI lives in Settings.

This phase does NOT change workspace section labels or navigation (that is V2). It does NOT build a template editor. It does NOT support custom section sets with no `role` mapping (that is V3).

</domain>

<decisions>
## Implementation Decisions

### Template Selector — Wizard Step 4

- **D-01:** Template selection is presented as **visual cards** in Step 4, showing template name, description, and source badge (pre-built vs. org-uploaded). Consistent with the assumption cards in Step 3.
- **D-02:** Template selection is **optional** — users can generate without selecting a template. The ContextSummary shows "No template — using standard structure" when nothing is selected. Aligns with the fast-draft philosophy established in Phase 5.
- **D-03:** Pre-built templates appear first in the card list; org-uploaded templates appear below with a separator.

### Settings → Templates Tab

- **D-04:** Add a **"Templates" sub-tab** to the existing Settings page, alongside Profile / Integrations / General / Notifications. Uses the exact same sub-tab pattern (`SUB_TABS` const + render switch) already in `src/pages/Settings.tsx`.
- **D-05:** Template upload and management is **admin-only**. Regular users can only select templates in the wizard — they cannot upload, delete, or manage them in Settings.
- **D-06:** Admins can **delete uploaded templates** from the Templates tab. Show a confirmation dialog before deletion (a template may be in use by existing proposals' generation history).
- **D-07:** Templates tab shows: list of all org-accessible templates (pre-built + uploaded), upload zone for new DOCX/PDF, status per template (processing / ready / error), and the collapsible section list per template.

### Pre-Built Templates

- **D-08:** Seed **3 pre-built CRO proposal templates** based on common study types:
  1. Phase I/II Oncology Study
  2. Bioequivalence Study
  3. Global Multi-Site Phase III Study
- **D-09:** Pre-built templates are stored as **seed data in the `templates` table** — a JSON array of section records per template. No DOCX files needed. The AI uses the section list and descriptions to shape generation.
- **D-10:** Pre-built templates are platform-wide (not org-scoped) but appear in every org's template selector. Org-uploaded templates are RLS-scoped to `org_id`.

### Template Schema — Built for V2 from Day One

- **D-11:** Each `template_section` record must include two fields:
  - `name` — the org's label (e.g. "Clinical Operations Plan")
  - `role` — the internal section type it maps to (e.g. `scope_of_work`)
  - This is **mandatory even for MVP** so that V2 (workspace section renaming) is a rendering change, not a schema migration.
- **D-12:** Upgrade path:
  - **MVP (this phase):** Inject style guide using section `name` and `description` into generation prompts. Workspace nav shows standard labels.
  - **V2:** Render `name` instead of standard labels in workspace nav — a UI-only change.
  - **V3:** Support fully custom section sets where `role` is null (no mapping to standard types).
- **D-13:** Do not build D-11 as a throwaway implementation — the schema must be forward-compatible from the first migration.

### How Templates Influence Generation

- **D-14:** Selected template's section list and descriptions are **injected into each section's generation prompt as a style guide**. This is additive — it does not change workspace routing, nav, or section labels.
- **D-15:** The injection format: a clearly labeled block in the system prompt, e.g. "The organization uses the following proposal template. Adapt your tone, structure, and section naming to match this format: [section list]". Separate from RAG chunks (established in Phase 9, D-16).
- **D-16:** If no template is selected, generation proceeds with no template injection (standard behavior — no change from current).

### Template Upload & Extraction Feedback

- **D-17:** Uploaded template extraction **reuses the Phase 3 parsing pipeline** (Edge Function: pdf-parse for PDF, mammoth for DOCX). No new extraction infrastructure needed.
- **D-18:** After upload, Settings shows extraction status per template: uploading → extracting → ready (or error).
- **D-19:** After extraction completes, show detected sections in a **read-only collapsible disclosure**: "View detected sections (N)" → expands to show section names in order. Collapsed by default so the happy path stays clean.
- **D-20:** If extraction confidence is low (short document, no clear headings), surface a **warning inline**: "We detected fewer sections than expected — review before using this template." Do not block use, just flag it.
- **D-21:** Admins cannot edit sections in Settings — the section list is read-only. Section editing (if ever needed) belongs in a future template editor (V2+).

### Claude's Discretion
- Exact Supabase table structure (`templates`, `template_sections`) — column names, indexes, foreign keys
- How to detect low extraction confidence (word count threshold, heading count heuristic, or both)
- Whether `template_id` is stored on `proposals` at generation time for audit purposes (recommended but not required)
- Exact wording of the style guide injection block in the generation prompt

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §M1-9 (REQ-9.1 through REQ-9.5) — template management requirements
- `.planning/REQUIREMENTS.md` §M1-10 (REQ-10.4) — export must match org template structure (affects D-11 schema design)

### Prior Phase Context (directly applicable)
- `.planning/phases/03-document-upload-parsing-pipeline/03-CONTEXT.md` — parsing pipeline decisions to reuse for template extraction
- `.planning/phases/04-regulatory-knowledge-base-rag/04-CONTEXT.md` — RLS and multi-tenancy patterns to apply to template table
- `.planning/phases/07-proposal-generation-engine/07-CONTEXT.md` — generation prompt structure and Edge Function input contract (D-07 through D-09)
- `.planning/phases/09-jamo-ai-chat-panel/09-CONTEXT.md` — D-16: RAG chunk injection format (template block must be clearly separated from RAG chunks)

### Existing Code
- `src/pages/Settings.tsx` — sub-tab pattern to extend for Templates tab
- `src/components/FileUpload.tsx` — reuse for template upload UI
- `src/components/wizard/Step4Generate.tsx` — add template card selector here
- `src/types/wizard.ts` — add `selectedTemplateId?: string` to `WizardState`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/pages/Settings.tsx` — `SUB_TABS` const array + render switch pattern; add `'Templates'` to the array and a `<TemplatesTab />` component
- `src/components/FileUpload.tsx` — handles multi-file upload to Supabase Storage with per-file status; reuse or adapt for template upload
- `src/components/StatusBadge.tsx` — use for template status (processing / ready / error) and low-confidence warning
- Phase 3 Edge Function (document text extraction) — reuse directly for template extraction; same libraries, same pattern

### Established Patterns
- Sub-tabs in Settings: `const SUB_TABS = [...] as const` + `type SubTab = typeof SUB_TABS[number]` + `useState<SubTab>` + conditional render. Add `'Templates'` as a new entry.
- File upload → Edge Function trigger → status polling: established in Phase 3. Template upload follows the same flow.
- RLS by `org_id`: all new tables must include `org_id` with RLS policies matching existing tables.
- Card layout: Step 3 assumption cards are the visual precedent for Step 4 template cards.

### Integration Points
- `WizardState` (in `src/types/wizard.ts`) — add `selectedTemplateId?: string | null`
- `Step4Generate.tsx` — receives `WizardState`; add template card selector above ContextSummary
- Generation Edge Function — receives `proposalInput`; add `templateContext?: { sections: TemplateSectionRef[] }` to the payload contract
- Settings page router — add `'Templates'` to `SUB_TABS`, add `<TemplatesTab />` render branch

</code_context>

<specifics>
## Specific Ideas

- Template cards in Step 4: show template name, 1-line description, source badge ("Pre-built" in gray, "Your template" in jamo blue). Selected state uses `bg-jamo-50 border-jamo-300` ring (consistent with active sidebar items).
- Section list disclosure: "View detected sections (8) ▾" — simple `<details>`/`<summary>` or a chevron toggle. Read-only `<ol>` of section names.
- Low-confidence warning: amber inline alert, not a modal — same visual pattern as missing-info warnings in Step 3.

</specifics>

<deferred>
## Deferred Ideas

- Section editing in Settings (admin edits detected section list) — V2 template editor
- Custom section sets where `role` is null (no mapping to standard section types) — V3
- Workspace section label renaming based on org template — V2 (schema ready from D-11)
- Template versioning / cloning — post-MVP
- Global template library shared across orgs — post-MVP

</deferred>

---

*Phase: 10-template-management*
*Context gathered: 2026-04-18*
