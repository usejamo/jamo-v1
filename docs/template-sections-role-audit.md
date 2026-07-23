# template_sections / role audit

Report-only. Every claim cited to code, migration, or live schema (project `fuuvdcvbliijffogjnwg`). No proposals.

## Live schema — `template_sections`

| column | type | nullable | default |
|---|---|---|---|
| id | uuid | no | `gen_random_uuid()` |
| template_id | uuid | no | — |
| name | text | no | — |
| role | text | **yes** | **null** |
| description | text | yes | null |
| position | integer | no | — |
| org_id | uuid | yes | null |
| created_at | timestamptz | no | `now()` |

`role` is a plain nullable `text` column — **no CHECK constraint, no FK, no enum.** It is free-text at the DB level. (Confirmed: live `template_sections` carries roles that appear in no code list — `clinical_strategy`, `site_selection`, `bioanalytical`, `clinical_monitoring`, `statistical_analysis`, `safety_monitoring` — seeded by `20260418000023_templates.sql`.)

---

## 1. Does a manually-added section get a role? What kind of value?

**There is no UI path that manually adds a section** (no `INSERT` into `template_sections` anywhere in the frontend). `TemplatesTab.tsx` supports only **edit** (`update`, line 168–171) and **remove** (`delete`, line 191–194) of already-extracted sections; its only insert is the `templates` row on upload (line 522). So "user-created section" is not a code path that exists.

Where a role value *does* come from:
- **Extraction** → a value from `KNOWN_ROLES` or `null` (see Q5/Q8).
- **Migration seed** → hardcoded.
- **User editing an extracted section** → chosen from a **fixed 21-value dropdown** (`ROLE_OPTIONS`, `TemplatesTab.tsx:68–90`) or empty → `null` (`e.target.value || null`, line 350).

Column default when unspecified: `null`.

## 2. Every insert path into `template_sections`, and whether columns are explicit

| # | Path | Statement | Columns |
|---|---|---|---|
| 1 | Seed — example templates | `20260418000023_templates.sql:113` | Explicit list: `(template_id, name, role, position, org_id)` via `INSERT … SELECT … FROM (VALUES …)` |
| 2 | Seed — Standard Proposal default | `20260427000024_template_driven_sections.sql:51` | Explicit list: `(id, template_id, org_id, name, role, description, position)`, `ON CONFLICT (id) DO NOTHING` |
| 3 | Extraction edge function | `template-extract/index.ts:301–312` | Explicit object keys: `template_id, org_id, name, description, role, position` |

- **No UI insert, no seed-script insert, no clone/duplicate insert** (Q4).
- `ProposalCreationWizard.tsx:150` and `Step4Generate.tsx:223` reference `template_sections` but are **reads** (`select`), not inserts.
- All three insert paths use **explicit named columns**. Re: "bypass a new column default" — none of them positional-inserts or `SELECT *`, so a newly-added column that is **omitted** would receive its **DEFAULT** (they would *not* bypass it); a new `NOT NULL` column **without** a default would break all three paths until amended.

## 3. Does `buildSectionPromptV2` get the full row or a projection?

**A projection — and not even a row object.** It takes individual scalar params (`buildSectionPromptV2` signature, `promptAssembly.ts:182–200`): `sectionId, sectionName, sectionDescription, sectionRole, tone, …`.

Projection is defined by the client payload in `useProposalGeneration.ts:371–386`:
```
sectionName: section.name
sectionDescription  (separate arg, line 376)
sectionRole: section.role
sectionId: section.id
```
Those `section` objects are **`proposal_sections` rows** (status is updated by `section.id` on `proposal_sections`, line 366–369), whose `name/role/description` were copied from `template_sections` at proposal creation. So the columns that reach the builder are **name, description, role, id only** — the full `template_sections` row never reaches it.

## 4. Clone/duplicate a template — copied or regenerated?

**No clone/duplicate feature exists.** Repo-wide search for template clone/duplicate/copy returns only unrelated hits (`isDuplicate` name-uniqueness check; `duplicateTemplateRoles` in `demoFixtureValidation`). Templates are created only by **upload → extraction** or **migration seed**. There is no path that copies section rows or regenerates them from a default.

## 5. The Haiku section-mapping pass

- **File / function:** `supabase/functions/template-extract/index.ts` → `classifyRoles` (line 78).
- **Model:** `claude-haiku-4-5-20251001`, `max_tokens: 200` (line 130–131).
- **Called:** line 286–288, **only** when `ANTHROPIC_API_KEY` is set and `sections.length > 0`; otherwise `roleMap = {}`.
- **Input:** the parsed section **names** (`Array<{ name }>`) from `parseSectionsFromHtml` (docx) or `parseSectionsFromText` (pdf). Only names — no body content.
- **Output:** `Record<sectionName, role | null>`. It writes nothing itself; the returned `roleMap` is consumed by the section insert at line 306 (`role: roleMap[s.name] ?? null`).

## 6. Canonical "essential sections" list — where, and full values

**A hardcoded constant, not a table:** `KNOWN_ROLES` (`template-extract/index.ts:64–76`). The per-role definitions are **also inline** in the `classifyRoles` prompt (lines 85–106). No DB table, no CHECK constraint.

Full list (21): `cover_letter, executive_summary, study_understanding, company_overview, therapeutic_experience, references, scope_of_work, project_management, proposed_team, clinical_operations, site_management, patient_recruitment, data_management, biostatistics, medical_writing, regulatory_strategy, pharmacovigilance, quality_management, timeline, assumptions, budget`.

The UI dropdown `ROLE_OPTIONS` (`TemplatesTab.tsx:68–90`) is a **separate, second copy** of the same 21 values (identical set and order). So three role vocabularies exist independently: `KNOWN_ROLES` (21), `ROLE_OPTIONS` (21, matches), and `roleHints` (6, Q7).

## 7. Is `KNOWN_ROLES` the same key space as `roleHints`? Side by side

`roleHints` keys (`promptAssembly.ts:207–216`, 6): `understanding, executive_summary, cover_letter, budget, timeline, regulatory_strategy`.

`KNOWN_ROLES` (21): as listed above.

- **Shared (5):** `executive_summary, cover_letter, budget, timeline, regulatory_strategy`.
- **In `roleHints` but NOT in `KNOWN_ROLES` (1):** `understanding` — `KNOWN_ROLES` has `study_understanding`. So the `roleHints['understanding']` entry can never match a Haiku-assigned role.
- **In `KNOWN_ROLES` but NOT in `roleHints` (16):** `study_understanding, company_overview, therapeutic_experience, references, scope_of_work, project_management, proposed_team, clinical_operations, site_management, patient_recruitment, data_management, biostatistics, medical_writing, pharmacovigilance, quality_management, assumptions`.

**Not the same key space.** (Compounding this: the live default template's section 1 role is `study_understanding` — see the drift note below — so `roleHints['understanding']` is also dead for the default template, and 4 of its 9 sections resolve no hint: `study_understanding, scope_of_work, proposed_team, quality_management`.)

## 8. What Haiku does for a non-matching section

**Writes `null`.** Two layers:
1. Prompt instructs: return `"null"` if no match (lines 114–116).
2. Post-parse guard (lines 148–150): `result[name] = KNOWN_ROLES.includes(role) ? role : null` — any off-list value the model returns is coerced to `null`.
Plus, on any HTTP error / unparseable response, `classifyRoles` returns `{}` (lines 135, 140, 154), so `roleMap[name] ?? null` → `null` at insert.
**No fallback value** (`other`/`custom`), **no forced nearest-match.**

## 9. Confidence / match-quality signal?

The Haiku mapping produces **no per-section confidence or match-quality signal** — it returns only `role | null`.

A **separate, template-level** heuristic exists: `isLowConfidence = sections.length < 3 || wordCount < 200` (line 291). It is **not** derived from Haiku and is **not** per-section. It **is persisted** (`templates.low_confidence`, line 326) and **surfaced** to the UI (`SectionDisclosure` `lowConfidence` prop). Per-section match quality is **never computed** (discarded by construction).

## 10. Is the Haiku role persisted or transient?

**Persisted.** Written to the `template_sections.role` column at insert (line 306). Durable.

## 11. Can a user view/change the role after extraction?

**Yes.** `TemplatesTab.tsx` → `SectionDisclosure` per-section edit form: a **Role `<select>`** (lines 344–356) populated from `ROLE_OPTIONS` (21 values) plus an empty option → `null` (line 350). Saved via `update` to `template_sections` (lines 168–171).

Constrained to the **21 `ROLE_OPTIONS` values or `null`** through this UI — the user cannot enter a free-text role here. (The DB column itself remains unconstrained; the limit is UI-only.)

## 12. Does Haiku run on manual single-add too?

**Extraction only.** `classifyRoles` is invoked solely inside the `template-extract` edge function (line 286). There is no manual single-add path (Q1), so Haiku never runs on one. Editing a section's role post-extraction uses the dropdown, not Haiku.

## 13. Any column expressing intended length / depth / size?

**No.** The eight live columns are `id, template_id, name, role, description, position, org_id, created_at`. None expresses length, depth, or size — including unused, deprecated, or nullable ones. (`description` is free-text scope prose, not a size field.)

---

## Follow-up unknowns

### F1. `proposal_sections` schema + the copy from `template_sections`

Live `proposal_sections` columns (18): `id, proposal_id, org_id, section_key, section_name, content, status('pending'), is_locked(false), version(1), generated_at, created_at, updated_at, last_saved_content, compliance_flags('[]'), name, description, position, role`. The last four (`name, description, position, role`) were added by `20260427000024`; `role` is nullable `text`, default `null` — same unconstrained shape as on `template_sections`.

**Copy site:** `ProposalCreationWizard.tsx:149–175`, at proposal creation. It `select`s a fixed projection from `template_sections` (`id, name, description, role, position`, line 151) and maps each row into an **explicit object literal** (lines 160–171):
```
role: ts.role ?? null      // line 165 — copied VERBATIM
name: ts.name, description: ts.description ?? null, position: ts.position
section_key: `section-${ts.position}`, section_name: ts.name, status:'pending', content:''
```
Then `upsert(onConflict: 'proposal_id,section_key')`.

- **Role is copied verbatim.**
- **A new `template_sections` column would NOT be picked up.** Every hop is an explicit projection/literal, so a new column would need adding in ≥4 places to reach generation: the `select` at line 151, the object literal at 160–171, a matching column on `proposal_sections`, and the generation payload in `useProposalGeneration.ts:371–386` (which itself only forwards `sectionName/sectionDescription/sectionRole`). Nothing here is `select('*')` or a spread.

### F2. `classifyRoles` truncation behavior (many-section templates)

`max_tokens: 200` on the Haiku call (`template-extract/index.ts:131`). Parsing (lines 137–141): `text.match(/\{[\s\S]*\}/)` then `JSON.parse` in a `try/catch`.

Deterministic test of that exact parse logic:
- full JSON → parses OK.
- truncated mid-value (no closing brace) → **regex match fails → returns `{}`**.
- truncated after a comma (no closing brace) → **returns `{}`**.

So the failure mode is confirmed and **all-or-nothing**: a truncated response has no closing `}`, the regex returns null (line 140), `classifyRoles` returns `{}`, and **every** section in that template falls to `role: null` (`roleMap[name] ?? null`, line 306) — not just the overflow ones. `JSON.parse` throwing (malformed tail with a stray brace) hits the same `{}` via the `catch` (line 154).

Threshold: 200 tokens holds only low-to-mid-teens entries of this punctuation-heavy, underscore-heavy JSON (long role names like `therapeutic_experience` are ~6–7 tokens each; two-digit indices add a token; any preamble or pretty-printing lowers it further). The observed "~11 sections" is consistent with that budget. This is a code-and-token-math confirmation, not a live model re-run.

### F3. Shared-module path between `supabase/functions/` and `src/`

**None.** No file under `supabase/functions/` imports from `src/` (searched `../src/`, `@/`, `src/lib`). The Deno edge runtime cannot resolve `src/lib/` at deploy time, so the codebase **duplicates** constants/modules across the boundary. Confirmed markers:
- `promptAssembly.ts:11` — "Duplicated because Deno Edge runtime cannot resolve src/lib/ imports at deploy time"
- `admin-create-org/index.ts:15` — "cannot resolve src/lib/ imports … Keep in sync manually"
- `_shared/demoFixtureValidation.ts:5–9` — "DUPLICATED (not imported) … KEEP BOTH COPIES IN SYNC", guarded by a byte-identity Vitest assertion.

Relevance to this audit: `KNOWN_ROLES` (edge, `template-extract`) and `ROLE_OPTIONS` (frontend, `TemplatesTab`) are two hand-maintained copies of the same 21-value list **for exactly this reason** — and, unlike `demoFixtureValidation`, there is **no drift-guard test** binding them, so they can diverge silently.

## Cross-cutting factual note — live DB diverges from the seed migration

The live default-template section 1 (`section_id 00000000-0000-0000-0001-000000000001`) has `role = study_understanding`. The committed seed migration `20260427000024_template_driven_sections.sql:53–55` writes that exact id with `role = 'understanding'` under `ON CONFLICT (id) DO NOTHING`, and **no migration updates it** (searched: no `UPDATE template_sections … SET role`). The applied database therefore does not match the committed migration file for this row. The live value (`study_understanding`) is what generation reads; it aligns with `KNOWN_ROLES` and `ROLE_OPTIONS`, and is the value absent from `roleHints`.
