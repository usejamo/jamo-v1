-- Phase 11.1: Add style_inspection column to templates
-- Nullable per D-06: null = inspection not run or failed (unknown state, not false positive)
-- Shape when populated: { "found": ["Normal", "Heading 1"], "missing": ["Heading 2", "Heading 3"] }

ALTER TABLE templates
  ADD COLUMN style_inspection jsonb;
