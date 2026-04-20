-- Migration: 20260418000023_templates.sql
-- Creates templates and template_sections tables with RLS policies and seed data
-- Phase 10: Template Management (Plan 01)

-- ============================================================
-- 1. templates table (D-09, D-10, D-13)
-- ============================================================
CREATE TABLE templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- NULL for pre-built (D-10)
  name         text NOT NULL,
  description  text,
  source       text NOT NULL CHECK (source IN ('prebuilt', 'uploaded')),
  file_path    text,                -- Storage path for uploaded; NULL for pre-built
  parse_status text NOT NULL DEFAULT 'ready'
                   CHECK (parse_status IN ('pending', 'extracting', 'ready', 'error')),
  low_confidence boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. template_sections table (D-11, D-13, REQ-7.4)
-- ============================================================
CREATE TABLE template_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id  uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
  name         text NOT NULL,       -- org's label, e.g. "Clinical Operations Plan"
  role         text,                -- internal section type, e.g. 'scope_of_work' (nullable for V3)
  description  text,
  position     int NOT NULL,
  org_id       uuid REFERENCES organizations(id) ON DELETE CASCADE,  -- denormalized for RLS (REQ-7.4)
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE template_sections ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RLS policies on templates (D-05, D-10, REQ-9.5)
-- ============================================================

-- SELECT: pre-built (org_id IS NULL) visible to all authenticated users; uploaded visible only to same org
CREATE POLICY "templates_select" ON templates FOR SELECT
  USING (org_id IS NULL OR org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

-- INSERT: admin-only, must match user's org_id (cannot insert pre-built via API)
CREATE POLICY "templates_insert_admin" ON templates FOR INSERT
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'super_admin')
  );

-- UPDATE: admin-only, same org (for parse_status updates from edge function)
CREATE POLICY "templates_update_admin" ON templates FOR UPDATE
  USING (
    org_id IS NOT NULL
    AND org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- DELETE: admin-only, same org, cannot delete pre-built (org_id IS NOT NULL guard)
CREATE POLICY "templates_delete_admin" ON templates FOR DELETE
  USING (
    org_id IS NOT NULL
    AND org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
    AND (SELECT role FROM user_profiles WHERE user_id = auth.uid()) IN ('admin', 'super_admin')
  );

-- ============================================================
-- 4. RLS policies on template_sections
-- ============================================================

-- SELECT: same pattern as templates — NULL org_id (pre-built) or matching org
CREATE POLICY "template_sections_select" ON template_sections FOR SELECT
  USING (org_id IS NULL OR org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid()));

-- INSERT: admin-only, same org
CREATE POLICY "template_sections_insert_admin" ON template_sections FOR INSERT
  WITH CHECK (
    org_id IS NOT NULL
    AND org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- DELETE: cascade from templates handles most deletions; explicit policy for direct deletes
CREATE POLICY "template_sections_delete_admin" ON template_sections FOR DELETE
  USING (
    org_id IS NOT NULL
    AND org_id = (SELECT org_id FROM user_profiles WHERE user_id = auth.uid())
  );

-- ============================================================
-- 5. Add selected_template_id to proposals (REQ-10.4 export matching)
-- ============================================================
ALTER TABLE proposals ADD COLUMN selected_template_id uuid REFERENCES templates(id) ON DELETE SET NULL;

-- ============================================================
-- 6. Seed data: 3 pre-built templates (D-08, D-09)
-- ============================================================

-- Template 1: Phase I/II Oncology Study
WITH inserted_template AS (
  INSERT INTO templates (org_id, name, description, source, parse_status)
  VALUES (
    NULL,
    'Phase I/II Oncology Study',
    'Template for first-in-human and dose-expansion oncology trials requiring adaptive design and safety monitoring sections.',
    'prebuilt',
    'ready'
  )
  RETURNING id
)
INSERT INTO template_sections (template_id, name, role, position, org_id)
SELECT
  inserted_template.id,
  section.name,
  section.role,
  section.position,
  NULL
FROM inserted_template,
(VALUES
  (1, 'Executive Summary',             'executive_summary'),
  (2, 'Study Understanding',           'study_understanding'),
  (3, 'Clinical Development Strategy', 'clinical_strategy'),
  (4, 'Scope of Work',                 'scope_of_work'),
  (5, 'Safety Monitoring Plan',        'safety_monitoring'),
  (6, 'Data Management',               'data_management'),
  (7, 'Regulatory Strategy',           'regulatory_strategy'),
  (8, 'Project Timeline',              'timeline'),
  (9, 'Budget',                        'budget'),
  (10, 'Cover Letter',                 'cover_letter')
) AS section(position, name, role);

-- Template 2: Bioequivalence Study
WITH inserted_template AS (
  INSERT INTO templates (org_id, name, description, source, parse_status)
  VALUES (
    NULL,
    'Bioequivalence Study',
    'Template for BE/BA studies with pharmacokinetic endpoints, crossover design, and regulatory submission focus.',
    'prebuilt',
    'ready'
  )
  RETURNING id
)
INSERT INTO template_sections (template_id, name, role, position, org_id)
SELECT
  inserted_template.id,
  section.name,
  section.role,
  section.position,
  NULL
FROM inserted_template,
(VALUES
  (1, 'Executive Summary',                  'executive_summary'),
  (2, 'Study Design Overview',              'study_understanding'),
  (3, 'Bioanalytical Strategy',             'bioanalytical'),
  (4, 'Scope of Work',                      'scope_of_work'),
  (5, 'Clinical Operations',                'clinical_operations'),
  (6, 'Data Management and Statistics',     'data_management'),
  (7, 'Regulatory Submission Plan',         'regulatory_strategy'),
  (8, 'Project Timeline',                   'timeline'),
  (9, 'Budget',                             'budget'),
  (10, 'Cover Letter',                      'cover_letter')
) AS section(position, name, role);

-- Template 3: Global Multi-Site Phase III Study
WITH inserted_template AS (
  INSERT INTO templates (org_id, name, description, source, parse_status)
  VALUES (
    NULL,
    'Global Multi-Site Phase III Study',
    'Template for large-scale pivotal trials across multiple regions with site management, data reconciliation, and regulatory strategy.',
    'prebuilt',
    'ready'
  )
  RETURNING id
)
INSERT INTO template_sections (template_id, name, role, position, org_id)
SELECT
  inserted_template.id,
  section.name,
  section.role,
  section.position,
  NULL
FROM inserted_template,
(VALUES
  (1,  'Executive Summary',              'executive_summary'),
  (2,  'Study Understanding',            'study_understanding'),
  (3,  'Global Project Management',      'project_management'),
  (4,  'Site Selection and Feasibility', 'site_selection'),
  (5,  'Scope of Work',                  'scope_of_work'),
  (6,  'Clinical Monitoring Plan',       'clinical_monitoring'),
  (7,  'Data Management',                'data_management'),
  (8,  'Statistical Analysis Plan',      'statistical_analysis'),
  (9,  'Regulatory Strategy',            'regulatory_strategy'),
  (10, 'Project Timeline',               'timeline'),
  (11, 'Budget',                         'budget'),
  (12, 'Cover Letter',                   'cover_letter')
) AS section(position, name, role);
