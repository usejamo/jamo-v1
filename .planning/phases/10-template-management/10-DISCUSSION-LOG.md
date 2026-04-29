# Phase 10: Template Management - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 10-template-management
**Areas discussed:** Template selector in Step 4, Settings → Templates tab, Pre-built template content, How templates influence generation

---

## Template Selector in Step 4

| Option | Description | Selected |
|--------|-------------|----------|
| Cards | Visual cards with name, description, source badge. Consistent with Step 3 assumption cards. | ✓ |
| Radio list | Compact vertical list with radio buttons | |
| Dropdown select | Minimal single-select dropdown | |

**User's choice:** Cards

| Option | Description | Selected |
|--------|-------------|----------|
| Optional — default to no template | User can generate without a template. ContextSummary shows "No template". | ✓ |
| Required — must select one | User must pick a template before Generate. | |
| Required only if org has uploaded one | Pre-selects org template if present. | |

**User's choice:** Optional — aligns with fast-draft philosophy.

---

## Settings → Templates Tab

| Option | Description | Selected |
|--------|-------------|----------|
| Add Templates tab to Settings | New sub-tab alongside existing ones. | ✓ |
| Separate route /settings/templates | Dedicated page instead of sub-tab. | |

**User's choice:** Add Templates tab to Settings

| Option | Description | Selected |
|--------|-------------|----------|
| Admin only | Only Admins can upload/delete. Users can only select in wizard. | ✓ |
| All users | Any org user can upload templates. | |

**User's choice:** Admin only

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — delete with confirmation | Admins can delete; confirmation dialog shown. | ✓ |
| No — upload only for MVP | Upload only, accumulate. | |

**User's choice:** Yes — delete with confirmation

---

## Pre-Built Template Content

| Option | Description | Selected |
|--------|-------------|----------|
| Standard CRO structures | Phase I/II Oncology Study, Bioequivalence Study, Global Multi-Site Phase III | ✓ |
| Generic structural templates | Simple/Standard/Comprehensive differentiated by depth | |
| You decide | Leave to Claude | |

**User's choice:** Standard CRO structures (Phase I/II Oncology Study, Bioequivalence Study, Global Multi-Site Phase III)

| Option | Description | Selected |
|--------|-------------|----------|
| Section list as seed data | Seed `templates` table with name + JSON section array. No DOCX needed. | ✓ |
| Actual DOCX files committed to repo | Real DOCX files uploaded to Supabase Storage on seed. | |

**User's choice:** Section list as seed data

---

## How Templates Influence Generation

| Option | Description | Selected |
|--------|-------------|----------|
| Style guide injection only | Template section list injected into generation prompts. Workspace nav stays standard. | ✓ (with important note) |
| Replace section structure too | Template sections replace workspace section list. | |
| Both — structure + style | Template defines structure AND style. | |

**User's choice:** Style guide injection for MVP — but with an important schema requirement:
> "The schema must be built for option 2 from day one. Each template section record should include `name` (org's label) and `role` (internal section type mapping). This means section renaming (V2) is a rendering change, not a schema migration. Don't build option 1 as a throwaway — build it as phase 1 of option 2."

Upgrade path: MVP → V2 (render `name` in workspace nav) → V3 (fully custom section sets, `role` is null)

| Option | Description | Selected |
|--------|-------------|----------|
| Processing → Ready status only | Simple status indicator, no section preview. | |
| Show detected sections after extraction | Collapsed disclosure showing section names in order. | ✓ |
| Show full extracted text preview | Raw text preview. | |

**User's choice:** Show detected sections in a collapsible read-only disclosure.
> "Show 'N sections detected' with section names in order. Read-only. If confidence is low, show warning: 'We detected fewer sections than expected.' Keep list collapsed by default behind a 'View detected sections' disclosure."

---

## Claude's Discretion

- Exact Supabase table structure (column names, indexes, foreign keys)
- Low-confidence detection heuristic (word count, heading count, or both)
- Whether `template_id` is stored on proposals at generation time (recommended but not required)
- Exact wording of style guide injection block in the generation prompt

## Deferred Ideas

- Section editing in Settings (template editor) — V2
- Custom section sets where `role` is null — V3
- Workspace nav label renaming based on org template — V2 (schema ready from D-11)
- Template versioning / cloning — post-MVP
- Global template library shared across orgs — post-MVP
