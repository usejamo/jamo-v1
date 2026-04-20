---
phase: 10-template-management
plan: "01"
subsystem: database
tags: [migration, rls, templates, seed-data, supabase]
dependency_graph:
  requires: []
  provides: [templates-table, template-sections-table, proposals-selected-template-id]
  affects: [supabase-schema, database-types]
tech_stack:
  added: []
  patterns: [rls-org-isolation, org-id-denormalization, with-cte-seed-pattern]
key_files:
  created:
    - supabase/migrations/20260418000023_templates.sql
  modified: []
decisions:
  - "org_id IS NULL for pre-built templates (avoids fake platform org, idiomatic SQL NULL pattern)"
  - "role nullable at column level for V3 forward-compatibility (D-12/D-13)"
  - "selected_template_id added to proposals now for REQ-10.4 export matching (Claude discretion per RESEARCH.md)"
  - "WITH CTE pattern for seed inserts avoids hardcoded UUIDs"
  - "Task 2 (db push) blocked by auth gate — SUPABASE_ACCESS_TOKEN not set"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-20"
  tasks_completed: 1
  tasks_total: 2
  files_created: 1
  files_modified: 0
---

# Phase 10 Plan 01: Templates Schema Migration Summary

**One-liner:** Supabase migration creating `templates` + `template_sections` tables with org-isolation RLS, admin-only write policies, and 3 seeded pre-built CRO proposal templates (32 section records total).

---

## Tasks

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Create templates migration with tables, RLS, and seed data | Complete | fed90f3 |
| 2 | Push schema to Supabase + regenerate types | Blocked (auth gate) | — |

---

## What Was Built

### Migration file: `supabase/migrations/20260418000023_templates.sql`

**Tables created:**

- `templates` — platform-wide template registry. `org_id IS NULL` for pre-built (platform-wide); `org_id` set for org-uploaded. Fields: `source` (prebuilt/uploaded), `parse_status` (pending/extracting/ready/error), `low_confidence` boolean, `file_path` for Storage path.

- `template_sections` — ordered section records per template. `template_id` FK with CASCADE delete. `org_id` denormalized for RLS per REQ-7.4 pattern. `role` nullable for V3 forward-compatibility (D-12/D-13).

**RLS policies:**

- `templates_select`: `org_id IS NULL OR org_id = (user's org)` — pre-built visible to all authenticated users; uploaded scoped to org.
- `templates_insert_admin` / `templates_delete_admin`: require `org_id IS NOT NULL` AND `role IN ('admin', 'super_admin')` — blocks API deletion of pre-built templates (T-10-02 mitigated).
- `templates_update_admin`: org-scoped for edge function parse_status updates.
- `template_sections_select/insert/delete`: mirror templates pattern.

**Proposals extension:**
- `ALTER TABLE proposals ADD COLUMN selected_template_id uuid REFERENCES templates(id) ON DELETE SET NULL` — audit trail for export matching (REQ-10.4).

**Seed data (3 pre-built templates, 32 sections total):**
1. Phase I/II Oncology Study — 10 sections
2. Bioequivalence Study — 10 sections
3. Global Multi-Site Phase III Study — 12 sections

All seed inserts use `WITH inserted_template AS (INSERT ... RETURNING id)` CTE pattern — no hardcoded UUIDs.

---

## Auth Gate: Task 2

**What was attempted:** `npx supabase db push` to apply migration to project `fuuvdcvbliijffogjnwg`.

**Blocked by:** `SUPABASE_ACCESS_TOKEN` not set in environment.

**Required action:**
1. Run `npx supabase login` (opens browser for OAuth)
2. Then run: `npx supabase db push --project-ref fuuvdcvbliijffogjnwg`
3. Then regenerate types: `npx supabase gen types typescript --project-id fuuvdcvbliijffogjnwg > src/types/database.types.ts`

**Verification after push:**
```bash
grep -c "templates\|template_sections\|selected_template_id" src/types/database.types.ts
```
Expected: > 0 matches.

---

## Deviations from Plan

None — plan executed exactly as written. Task 2 (db push) is an auth gate per the plan's own note: "If the command requires authentication, check for SUPABASE_ACCESS_TOKEN env var. If not set, this task becomes a checkpoint requiring the user to run npx supabase login first."

---

## Known Stubs

None — migration file is complete SQL with no placeholder values. All seed data is populated.

---

## Threat Flags

No new threat surface beyond what the plan's threat model already covers (T-10-01 through T-10-04 all mitigated in the RLS policies as specified).

---

## Self-Check

- [x] `supabase/migrations/20260418000023_templates.sql` exists in worktree
- [x] Commit `fed90f3` exists in git log
- [x] All 11 acceptance criteria verified (grep checks passed)

## Self-Check: PASSED
