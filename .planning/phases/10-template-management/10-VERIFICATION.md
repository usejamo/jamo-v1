---
phase: 10-template-management
verified: 2026-04-20T00:00:00Z
status: human_needed
score: 17/17 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Upload a DOCX file as an admin in Settings > Templates"
    expected: "File uploads, parse_status transitions pending -> extracting -> ready, sections appear in disclosure"
    why_human: "Requires running browser + live Supabase — storage upload and edge function invocation cannot be verified statically"
  - test: "Open wizard Step 4 as a user with org-uploaded templates and pre-built templates in DB"
    expected: "Pre-built cards appear first, org-uploaded below separator, selecting card highlights it, ContextSummary shows template name"
    why_human: "Requires live Supabase data and browser rendering"
  - test: "Generate a proposal with a template selected"
    expected: "[TEMPLATE CONTEXT] block present in Anthropic API call, generation completes normally"
    why_human: "Requires live generation run — prompt injection only observable at runtime"
  - test: "Generate a proposal with no template selected"
    expected: "Generation completes normally, no [TEMPLATE CONTEXT] block sent"
    why_human: "Requires live generation run to confirm absence of injection"
  - test: "Confirm non-admin user does not see Templates tab in Settings"
    expected: "Tab bar shows Profile, Integrations, General, Notifications only"
    why_human: "Role-based UI visibility requires browser session with non-admin credentials"
---

# Phase 10: Template Management Verification Report

**Phase Goal:** Allow admins to upload org templates, seed 3 pre-built CRO proposal templates, and let users select a template in the wizard to guide AI generation.
**Verified:** 2026-04-20
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Pre-built templates queryable by any authenticated user (org_id IS NULL policy) | VERIFIED | `templates_select` policy: `org_id IS NULL OR org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())` in migration |
| 2 | Org-uploaded templates only visible to users in the same org | VERIFIED | Same `templates_select` policy — `org_id =` clause scopes uploaded rows |
| 3 | Admins can insert and delete org-uploaded templates but not pre-built ones | VERIFIED | `templates_insert_admin` + `templates_delete_admin` both require `org_id IS NOT NULL` AND role IN ('admin','super_admin') |
| 4 | 3 pre-built templates exist with section records containing name and role fields | VERIFIED | Migration seeds Phase I/II Oncology (10 sections), Bioequivalence (10), Global Phase III (12) — all with name+role columns |
| 5 | template_sections have position ordering and denormalized org_id | VERIFIED | `position int NOT NULL` and `org_id uuid REFERENCES organizations(id)` present on `template_sections` table |
| 6 | Migration file exists at supabase/migrations/20260418000023_templates.sql | VERIFIED | File present, contains both CREATE TABLE statements, all RLS policies, proposals ALTER, and seed data |
| 7 | Admins see a Templates tab in Settings; non-admins do not | VERIFIED (programmatic) | `Settings.tsx` line 463-464: `visibleTabs` filter excludes 'Templates' unless `profile?.role === 'admin' \|\| 'super_admin'`; requires human for browser confirmation |
| 8 | Admins can upload DOCX/PDF templates that trigger extraction | VERIFIED (programmatic) | `accept=".docx,.pdf"` at line 341; `supabase.functions.invoke('template-extract'` at line 255 of TemplatesTab.tsx |
| 9 | Template list shows pre-built and org-uploaded templates with status badges | VERIFIED | `StatusIndicator` component, separator "Your organization's templates" wired in TemplatesTab.tsx |
| 10 | Admins can delete org-uploaded templates with confirmation dialog | VERIFIED | "Delete template?" dialog text at line 146; `aria-label` on delete button at line 454 |
| 11 | Extracted sections visible in collapsible disclosure per template | VERIFIED | `SectionDisclosure` component with `aria-expanded` at line 82; "View detected sections" at line 88 |
| 12 | Low-confidence extractions show amber warning | VERIFIED | `role="alert"` at line 96; "Fewer sections than expected" at line 100 of TemplatesTab.tsx |
| 13 | Step 4 of wizard displays template cards with name, description, source badge | VERIFIED | `TemplateSelector` component in Step4Generate.tsx with "Pre-built" and "Your template" badges |
| 14 | Selecting a template dispatches SET_TEMPLATE action; clicking again deselects | VERIFIED | `dispatch({ type: 'SET_TEMPLATE', templateId: id })` at Step4Generate.tsx line 194; reducer `case 'SET_TEMPLATE'` at ProposalCreationWizard.tsx line 94 |
| 15 | ContextSummary shows selected template name or 'No template — using standard structure' | VERIFIED | Step4Generate.tsx line 155: `'No template — using standard structure'` |
| 16 | Generation prompt includes [TEMPLATE CONTEXT] block when template selected | VERIFIED | generate-proposal-section/index.ts line 125: `[TEMPLATE CONTEXT]...[/TEMPLATE CONTEXT]` injected after `[REGULATORY CONTEXT]` |
| 17 | Generation proceeds normally when no template selected | VERIFIED (programmatic) | `if (params.templateContext?.sections?.length)` guard — when undefined, block is skipped |

**Score:** 17/17 truths verified (5 require human confirmation for full runtime validation)

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260418000023_templates.sql` | tables, RLS, seed data | VERIFIED | 201 lines; both tables, 7 RLS policies, 3 seeded templates |
| `src/components/settings/TemplatesTab.tsx` | Template management UI | VERIFIED | 472 lines (min 100 required) |
| `supabase/functions/template-extract/index.ts` | Edge function for extraction | VERIFIED | 180 lines (min 50 required) |
| `src/components/wizard/Step4Generate.tsx` | Template selector cards | VERIFIED | Contains `TemplateSelector` component |
| `src/types/wizard.ts` | selectedTemplateId, SET_TEMPLATE | VERIFIED | `selectedTemplateId: string | null`, `SET_TEMPLATE` in union, `stateVersion: 7` |
| `supabase/functions/generate-proposal-section/index.ts` | TEMPLATE CONTEXT injection | VERIFIED | `[TEMPLATE CONTEXT]` block with guard |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `Settings.tsx` | `TemplatesTab.tsx` | import + `activeTab === 'Templates' && <TemplatesTab />` | WIRED | Line 3 import, line 520 conditional render |
| `TemplatesTab.tsx` | `supabase/functions/template-extract` | `supabase.functions.invoke('template-extract', ...)` | WIRED | Line 255 |
| `Step4Generate.tsx` | `src/types/wizard.ts` | `dispatch({ type: 'SET_TEMPLATE', templateId })` | WIRED | Line 194; reducer handles it at ProposalCreationWizard.tsx:94 |
| `useProposalGeneration.ts` | `generate-proposal-section/index.ts` | `templateContext` in payload body | WIRED | Lines 302, 327, 386-413 in useProposalGeneration.ts |
| `template_sections` | `templates` | `template_id FK ON DELETE CASCADE` | WIRED | Migration line 28: `REFERENCES templates(id) ON DELETE CASCADE` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|--------------------|--------|
| `Step4Generate.tsx` / TemplateSelector | `templates` state | Supabase `.from('templates').select(...).eq('parse_status','ready')` | Yes — live DB query | FLOWING |
| `useProposalGeneration.ts` | `templateContext` | `.from('template_sections').select('name,role,description').eq('template_id', selectedTemplateId)` | Yes — live DB query | FLOWING |
| `generate-proposal-section/index.ts` | `system` prompt string | `params.templateContext.sections` array from client | Yes — passes through sections array | FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED for edge functions and Supabase-dependent hooks (require live server). Static checks passed for all artifacts.

| Behavior | Check | Status |
|----------|-------|--------|
| wizard.ts exports selectedTemplateId and SET_TEMPLATE | grep confirmed both present | PASS |
| migration contains CASCADE FK | `REFERENCES templates(id) ON DELETE CASCADE` found | PASS |
| TemplatesTab > 100 lines | 472 lines | PASS |
| template-extract > 50 lines | 180 lines | PASS |
| TypeScript types regenerated | `database.types.ts` contains `templates`, `template_sections`, `selected_template_id` | PASS |
| stateVersion guard updated | `stateVersion === 7` in ProposalCreationWizard.tsx | PASS |

---

### Requirements Coverage

| Requirement | Plan | Status | Evidence |
|-------------|------|--------|---------|
| REQ-9.1 | 10-01 | SATISFIED | templates + template_sections tables with RLS in migration |
| REQ-9.2 | 10-02 | SATISFIED | TemplatesTab upload zone + template-extract edge function |
| REQ-9.3 | 10-03 | SATISFIED | [TEMPLATE CONTEXT] block in generate-proposal-section prompt |
| REQ-9.4 | 10-03 | SATISFIED | TemplateSelector UI in Step 4 with SET_TEMPLATE dispatch |
| REQ-9.5 | 10-01 | SATISFIED | `templates_select` policy allows pre-built access to all authenticated users |
| REQ-7.4 | 10-01 | SATISFIED | `org_id` denormalized on `template_sections` for RLS without join |

---

### Anti-Patterns Found

No blockers or significant warnings found.

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/components/settings/TemplatesTab.tsx` | Initial `templates: []` state before fetch | Info | Expected — populated by useEffect on mount |
| `src/components/wizard/Step4Generate.tsx` | "No templates available." empty state div | Info | Expected — renders when DB returns empty array |

No TODO/FIXME/placeholder comments found in phase-modified files. No stub implementations. No hardcoded empty returns in API handlers.

---

### Human Verification Required

#### 1. Template Upload Flow

**Test:** Log in as an admin, navigate to Settings > Templates, upload a .docx file
**Expected:** File appears in list with "Processing" status, transitions to "Ready", sections appear in disclosure below the template row
**Why human:** Storage upload + edge function invocation requires running browser and live Supabase project

#### 2. Template Card Selection in Wizard

**Test:** Start a new proposal wizard, reach Step 4, observe template cards
**Expected:** Pre-built templates shown first (3 cards), any org-uploaded templates below separator; clicking a card highlights it with jamo-300 border; clicking again deselects; ContextSummary updates to show template name
**Why human:** Requires live Supabase data and browser rendering with visual confirmation

#### 3. Generation with Template Selected

**Test:** Select a template in Step 4, click Generate
**Expected:** Proposal sections generate successfully; if observing network, the generate-proposal-section payload includes `templateContext` with section list
**Why human:** Requires live generation run — prompt injection only observable at runtime

#### 4. Generation without Template Selected

**Test:** Leave template unselected in Step 4, click Generate
**Expected:** Generation proceeds normally with no template-related content in output
**Why human:** Requires live generation run to confirm absence of injection side effects

#### 5. Non-Admin Role Restriction

**Test:** Log in as a non-admin user, navigate to Settings
**Expected:** Tab bar shows Profile, Integrations, General, Notifications — no Templates tab visible
**Why human:** Role-based UI filtering requires browser session with non-admin credentials

---

### Gaps Summary

No gaps. All 17 must-haves are programmatically verified. The phase goal is architecturally complete:

- Schema: Both tables exist with correct RLS, FK cascade, org_id denormalization, and 3 seeded pre-built templates (32 sections)
- TypeScript types: Regenerated and confirmed to include `templates`, `template_sections`, `selected_template_id`
- Settings UI: TemplatesTab (472 lines) wired into Settings with admin-only role filter
- Extraction pipeline: template-extract edge function (180 lines) with mammoth DOCX parsing, heading detection, low-confidence flagging
- Wizard integration: TemplateSelector in Step 4 with radio cards, source badges, separator, deselect behavior
- Prompt injection: [TEMPLATE CONTEXT] block injected after [REGULATORY CONTEXT], gated on template selection, absent when no template chosen

The 5 human verification items are runtime/browser confirmations of behavior that is structurally sound in code.

---

_Verified: 2026-04-20_
_Verifier: Claude (gsd-verifier)_
