-- Migration: 20260427000024_template_driven_sections.sql
-- Adds schema columns for template-driven proposal section architecture,
-- seeds the "Standard Proposal" default template with all 9 sections,
-- and backfills existing proposal_sections rows.
-- Phase 10.1: Dynamic Template Sections Drive Proposal Structure (Plan 01)

-- ============================================================
-- 1. Alter proposal_sections — add new columns
-- ============================================================
ALTER TABLE proposal_sections
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS position integer,
  ADD COLUMN IF NOT EXISTS role text;

-- ============================================================
-- 2. Alter templates — add is_default
-- ============================================================
ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- ============================================================
-- 3. Unique partial index on templates where is_default = true
--    Enforces only one default template can exist (T-10.1-01 mitigation)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS templates_single_default
  ON templates (is_default)
  WHERE is_default = true;

-- ============================================================
-- 4. Insert the "Standard Proposal" default template
-- ============================================================
INSERT INTO templates (id, org_id, name, description, source, parse_status, is_default)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'Standard Proposal',
  'The standard 9-section CRO proposal structure used as the default when no custom template is selected.',
  'prebuilt',
  'ready',
  true
)
ON CONFLICT (id) DO UPDATE SET is_default = true, name = 'Standard Proposal';

-- ============================================================
-- 5. Insert template_sections for the Standard Proposal (all 9 sections)
--    Position ordering: executive_summary (8) and cover_letter (9) are last
--    per D-07 (they depend on all other sections completing first).
--    org_id is NULL — prebuilt template sections are platform-wide.
-- ============================================================
INSERT INTO template_sections (id, template_id, org_id, name, role, description, position)
VALUES
  ('00000000-0000-0000-0001-000000000001', '00000000-0000-0000-0000-000000000001', NULL,
   'Understanding of the Study', 'understanding',
   'Demonstrate deep comprehension of the sponsor''s study objectives, protocol, and therapeutic context. This section establishes credibility.', 1),
  ('00000000-0000-0000-0001-000000000002', '00000000-0000-0000-0000-000000000001', NULL,
   'Scope of Work & Service Delivery', 'scope_of_work',
   'Define all CRO services to be provided, responsibilities, and deliverables. Be specific about what is included and excluded.', 2),
  ('00000000-0000-0000-0001-000000000003', '00000000-0000-0000-0000-000000000001', NULL,
   'Proposed Team & Organizational Structure', 'proposed_team',
   'Introduce key personnel, their qualifications, therapeutic area experience, and organizational hierarchy.', 3),
  ('00000000-0000-0000-0001-000000000004', '00000000-0000-0000-0000-000000000001', NULL,
   'Timeline & Milestones', 'timeline',
   'Provide a detailed project timeline with key milestones, start-up activities, enrollment targets, and completion dates.', 4),
  ('00000000-0000-0000-0001-000000000005', '00000000-0000-0000-0000-000000000001', NULL,
   'Budget & Pricing', 'budget',
   'Present a transparent, itemized budget aligned to the scope of work, with payment milestones and assumptions.', 5),
  ('00000000-0000-0000-0001-000000000006', '00000000-0000-0000-0000-000000000001', NULL,
   'Regulatory Strategy', 'regulatory_strategy',
   'Outline the regulatory pathway, ICH-GCP compliance approach, and region-specific submission strategies.', 6),
  ('00000000-0000-0000-0001-000000000007', '00000000-0000-0000-0000-000000000001', NULL,
   'Quality Management', 'quality_management',
   'Describe quality assurance processes, audit plans, deviation management, and risk mitigation approach.', 7),
  ('00000000-0000-0000-0001-000000000008', '00000000-0000-0000-0000-000000000001', NULL,
   'Executive Summary', 'executive_summary',
   'A compelling 1–2 page summary of the entire proposal highlighting CRO strengths, key differentiators, and fit for this study.', 8),
  ('00000000-0000-0000-0001-000000000009', '00000000-0000-0000-0000-000000000001', NULL,
   'Cover Letter', 'cover_letter',
   'A personalized letter to the sponsor expressing interest, CRO commitment, and key value propositions.', 9)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 6. Backfill position on existing proposal_sections from section_key
-- ============================================================
UPDATE proposal_sections
SET position = CASE section_key
  WHEN 'understanding'       THEN 1
  WHEN 'scope_of_work'       THEN 2
  WHEN 'proposed_team'       THEN 3
  WHEN 'timeline'            THEN 4
  WHEN 'budget'              THEN 5
  WHEN 'regulatory_strategy' THEN 6
  WHEN 'quality_management'  THEN 7
  WHEN 'executive_summary'   THEN 8
  WHEN 'cover_letter'        THEN 9
  ELSE 99
END
WHERE position IS NULL;

-- ============================================================
-- 7. Backfill name on existing proposal_sections from section_key
-- ============================================================
UPDATE proposal_sections
SET name = CASE section_key
  WHEN 'understanding'       THEN 'Understanding of the Study'
  WHEN 'scope_of_work'       THEN 'Scope of Work & Service Delivery'
  WHEN 'proposed_team'       THEN 'Proposed Team & Organizational Structure'
  WHEN 'timeline'            THEN 'Timeline & Milestones'
  WHEN 'budget'              THEN 'Budget & Pricing'
  WHEN 'regulatory_strategy' THEN 'Regulatory Strategy'
  WHEN 'quality_management'  THEN 'Quality Management'
  WHEN 'executive_summary'   THEN 'Executive Summary'
  WHEN 'cover_letter'        THEN 'Cover Letter'
  ELSE section_key
END
WHERE name IS NULL;

-- ============================================================
-- 8. Set selected_template_id on proposals that used generation
--    but have no template set (backfill to Standard Proposal default)
-- ============================================================
UPDATE proposals
SET selected_template_id = '00000000-0000-0000-0000-000000000001'
WHERE selected_template_id IS NULL
  AND id IN (SELECT DISTINCT proposal_id FROM proposal_sections);
