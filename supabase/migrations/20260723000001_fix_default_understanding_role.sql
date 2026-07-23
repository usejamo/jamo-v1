-- Forward corrective migration (Phase: demo fixture hardening).
-- The applied DB has template_sections.role = 'study_understanding' for the Standard Proposal's
-- first section, but 20260427000024 seeded that id as 'understanding' under ON CONFLICT DO NOTHING,
-- so a fresh replay diverges from prod. Converge both to the canonical 'study_understanding' — the
-- value KNOWN_ROLES, ROLE_OPTIONS, and the depth/hint maps all key on.
-- Idempotent: the WHERE clause makes re-application a no-op. Do NOT edit 20260427000024.
UPDATE template_sections
SET role = 'study_understanding'
WHERE id = '00000000-0000-0000-0001-000000000001'
  AND role = 'understanding';
