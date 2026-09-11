# Root cause + fix: styled DOCX export not applying template styles

Status: **root-caused, fixed, verified end-to-end.** Not yet committed or deployed.

## Root cause

**Stale React context state — not the style engine.**

`ProposalCreationWizard.handleGenerate` writes the chosen template with a *direct*
`supabase.from('proposals').update({ selected_template_id })` (`ProposalCreationWizard.tsx:142-146`).
That write never reaches `ProposalsContext`. Meanwhile `createProposal` has already pushed an
optimistic row into context whose `selected_template_id` is **null** (`ProposalsContext.tsx:24, 104`).

The wizard then navigates to `/proposals/:id?generate=true`. `ProposalDetail` derives its proposal from
context (`proposals.find(p => p.id === id)`), so it reads `selected_template_id: null`, the effect
early-returns, `templateFilePath` stays `null`, and `exportDocx` is called with
`templateBlob: undefined` — an unstyled Calibri export, with **zero** errors, zero logs, and no UI signal.

A page reload repopulates the context from the DB, so the same proposal then exports correctly.
That is exactly why it looked unreproducible: any investigation that loads the page fresh passes.

## Evidence — same proposal, same template, same Export button

Verified by capturing the real browser blob and opening it in Microsoft Word via COM:

| flow | `Template:` label | storage fetches | Heading 1 | Normal |
|---|---|---|---|---|
| wizard → generate → Stop → export (**no reload**) | absent | **0** | Calibri 16pt | Calibri 12pt |
| same proposal after a page reload | present | 4 × 200 | **Georgia 28pt red** | **Garamond 11pt** |
| **after the fix**, no reload | present | 4 × 200 | **Georgia 28pt red** | **Garamond 11pt** |

DB row throughout: `selected_template_id = 4055e0be` (`styled_template`, `source: uploaded`).
The write always landed — the UI just never saw it.

Ruled out by direct test: `applyTemplateStyles` (works — Word renders the template fonts), the
template's `style_inspection.missing: ["Normal"]` (covered by the template's `docDefaults`), storage
RLS and signed URLs (200), `templates` RLS, stale deploy (`origin/master == HEAD`), export wiring.

## Changes

- **`src/pages/ProposalDetail.tsx`** — the template effect now falls back to reading
  `selected_template_id` off the proposal row when the context value is missing, so the page is
  self-sufficient regardless of how it was reached. Keyed on `[id, …]` with a cancellation guard.
- **`src/pages/ProposalDetail.tsx`** — `fetchTemplateBlob` now logs sign / fetch / network failures
  instead of returning `null` silently, and the templates query no longer discards its `error`.
- **`src/components/ProposalCreationWizard.tsx`** — `await refetch()` after the template UPDATE, so
  the `Template:` label and the ProposalsList badge are correct too.
- **`src/lib/applyTemplateStyles.ts`** — `generateAsync` now stamps the Word MIME type; styled exports
  were coming out as `application/zip` while unstyled ones were correct.
- **Tests** — new MIME-type regression test; wizard test mock gained `refetch`.
  Full suite: **556 passed / 16 skipped / 0 failed** (baseline 555). `npm run build` clean.

## Still open (not addressed — separate from this bug)

1. **Prebuilt templates carry no styles at all.** The 4 `prebuilt` templates have `file_path: null`;
   D-11 correctly skips them, silently. The picker presents them alongside uploaded DOCX templates
   with no indication that only the latter affect formatting. Org `6781e2a6` has zero uploaded
   templates, so every export there is unstyled by construction.
   Fixing this reverses documented decision **D-07** (style warnings are Settings-only) — a product
   call, deliberately left alone.
2. `numbering.xml` is swapped wholesale, replacing the generated doc's `bullet-list`/`number-list`
   numIds. Harmless in the files tested, unsound in general.
3. `applyTemplateStyles.test.ts` still only exercises synthetic XML — no test builds a real
   `docx`-generated blob against a real template, which is the gap that let this survive.
4. Template `0e8962ad` has duplicate `styleId`s (built with the `docx` npm package, not Word).
   Invalid OOXML; Word tolerates it and takes the last definition, so it renders correctly.

## Regression check

Wizard → pick an uploaded `.docx` template → Generate → Stop → Export → Force export, **without
reloading**. The download must use the template's fonts. Before the fix it was Calibri.
