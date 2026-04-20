---
plan: 10-02
phase: 10-template-management
status: complete
completed: 2026-04-20
---

# Plan 10-02 Summary: Settings Templates Tab + Extract Edge Function

## What was built

**Task 1 — TemplatesTab component + Settings wiring**

Created `src/components/settings/TemplatesTab.tsx` (472 lines) with:
- Upload zone: drag-and-drop + file input, restricted to `.docx,.pdf`, fires `template-extract` after storage upload
- Template list: pre-built first, then org-uploaded with separator "Your organization's templates"
- Status indicators: animated pulse for pending/extracting, green for ready, red for error
- Collapsible section disclosure with `aria-expanded`, lazy-loads `template_sections`
- Amber low-confidence warning with `role="alert"` when `low_confidence = true`
- Delete confirmation dialog (Cancel default-focused, 44px touch targets, `aria-label` on delete button)
- 3-second polling when any template is pending/extracting

Updated `src/pages/Settings.tsx`:
- Added `'Templates'` to `SUB_TABS`
- Imports `TemplatesTab`
- Filters tabs by role: `tab !== 'Templates' || profile?.role === 'admin' || profile?.role === 'super_admin'`
- Renders `<TemplatesTab />` when `activeTab === 'Templates'`

**Task 2 — template-extract Edge Function**

Created `supabase/functions/template-extract/index.ts`:
- Accepts `{ templateId: string }` in request body
- Validates UUID format before any DB access
- Updates `parse_status` to `'extracting'` before processing
- DOCX: uses `mammoth.convertToHtml` + regex `/<h[1-3]>` heading extraction
- PDF: uses `pdfjs-dist` text extraction + ALL-CAPS / short-no-punct heuristic
- Sets `low_confidence = true` if heading count < 3 OR word count < 200
- Bulk-inserts `template_sections` with `org_id` denormalized from parent template
- Updates `parse_status` to `'ready'` on success, `'error'` on failure
- Full CORS headers matching extract-document pattern

## Key files

- `src/components/settings/TemplatesTab.tsx` — created (472 lines)
- `src/pages/Settings.tsx` — updated (Templates tab + admin role filter)
- `supabase/functions/template-extract/index.ts` — created (180 lines)

## Acceptance criteria check

- [x] TemplatesTab exports `TemplatesTab`
- [x] Settings contains `'Templates'` in SUB_TABS
- [x] Settings contains `activeTab === 'Templates' && <TemplatesTab />`
- [x] Settings filters tabs by role (`tab !== 'Templates' || profile?.role`)
- [x] TemplatesTab contains `template-extract` invoke
- [x] TemplatesTab contains `.docx,.pdf` file restriction
- [x] TemplatesTab contains `Delete template?` dialog text
- [x] TemplatesTab contains `Fewer sections than expected` warning
- [x] TemplatesTab contains `View detected sections` disclosure toggle
- [x] TemplatesTab contains `role="alert"` on low-confidence warning
- [x] TemplatesTab contains `aria-label` on delete button
- [x] TemplatesTab contains `aria-expanded` on disclosure toggle
- [x] Edge function contains `mammoth` + `convertToHtml`
- [x] Edge function contains `<h[1-3]` regex heading extraction
- [x] Edge function contains `low_confidence` detection
- [x] Edge function contains `template_sections` insert
- [x] Edge function contains `parse_status: 'error'` in catch handler
- [x] Edge function contains `org_id: template.org_id` denormalization
- [x] CORS headers present

## Self-Check: PASSED
