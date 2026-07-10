-- Migration: 20260710000005_drop_backfill_audit_table.sql
-- Phase 14.7 (Plan 07 Task 3): Drop the disposable one-time backfill audit table (D-05b).
--
-- GATE: apply ONLY when _backfill_unresolved_proposal_chunks count == 0 (D-05c).
--   Confirmed 0 live on 2026-07-10 (deploy-log + 14.7-VERIFICATION.md BRIEF case 7).
--
-- This drops the AUDIT TABLE only. It NEVER deletes the unresolved chunk rows themselves
-- (D-05a) — NULL proposal_id already fails closed at retrieval (verified: BRIEF case 6).
-- The forensic document_id ↔ proposal linkage table is removed so it does not linger (T-14.7-26).

DROP TABLE IF EXISTS public._backfill_unresolved_proposal_chunks;
