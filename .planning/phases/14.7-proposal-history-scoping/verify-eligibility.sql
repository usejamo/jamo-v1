-- verify-eligibility.sql
-- Phase 14.7 Plan 02 — Live-verification script for the scoped proposal RPCs (R6)
--
-- RUN THIS in Plan 07, via Supabase MCP `execute_sql`, AFTER Plan 06 applies
-- 20260710000003_proposal_rpc_eligibility.sql to the live project.
-- NOT run here — Plan 02 only AUTHORS this script. Do not execute against any live DB from this plan.
--
-- Every fixture-mutating block is wrapped BEGIN ... ROLLBACK so the script never leaves permanent
-- test state on the live project — it is safe to re-run any number of times.
--
-- Live fixture inventory confirmed in RESEARCH.md (2026-07-10): 60 proposals total across 2 orgs —
-- 56 draft / 1 submitted / 1 lost / 2 won. This script assumes that shape but re-derives concrete
-- ids at the top of each case via SELECT so it keeps working if the fixture data changes.

-- =====================================================================================
-- FIXTURE DISCOVERY (read-only, run first to get concrete ids for the cases below)
-- =====================================================================================
SELECT id, org_id, status, reference_override, title
FROM proposals
ORDER BY status, created_at;

SELECT id, learn_from_won, learn_from_submitted, learn_from_lost FROM organizations;

-- =====================================================================================
-- CASE 1 — Own chunks retrieved at ANY status, including draft
-- Expected: chunks belonging to the queried draft proposal's own id appear in the result set.
-- =====================================================================================
-- Substitute <DRAFT_ID> and <ORG_ID> with a concrete draft proposal id/org_id from the discovery query.
SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 50, '<DRAFT_ID>'::uuid);
SELECT * FROM match_chunks_vector_proposals(
  (SELECT embedding FROM chunks WHERE proposal_id = '<DRAFT_ID>'::uuid LIMIT 1),
  '<ORG_ID>'::uuid, 0.0, 50, '<DRAFT_ID>'::uuid
);
-- Expect: at least one row with a chunk belonging to <DRAFT_ID> present in the result set.

-- =====================================================================================
-- CASE 2 — Other proposal in draft is NEVER retrieved; no override/toggle path around it
-- Expected: querying as proposal A never returns any OTHER draft's chunks, even with
-- reference_override=true forced on that other draft (floor wins over override).
-- =====================================================================================
-- Baseline: assert no chunk from another draft (<OTHER_DRAFT_ID>) appears when querying as <DRAFT_ID>.
SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
WHERE id IN (SELECT id FROM chunks WHERE proposal_id = '<OTHER_DRAFT_ID>'::uuid);
-- Expect: 0 rows.

BEGIN;
  UPDATE proposals SET reference_override = true WHERE id = '<OTHER_DRAFT_ID>'::uuid;
  SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id = '<OTHER_DRAFT_ID>'::uuid);
  -- Expect: still 0 rows — draft floor is first-evaluated and wins over reference_override.
ROLLBACK;

-- =====================================================================================
-- CASE 3 — Won proposal (other) retrieved by default
-- Expected: with default learn_from_won=true, the 2 live `won` proposals' chunks ARE eligible
-- for a querying proposal that is not either of them.
-- =====================================================================================
SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
WHERE id IN (SELECT id FROM chunks WHERE proposal_id IN (SELECT id FROM proposals WHERE status = 'won' AND org_id = '<ORG_ID>'::uuid));
-- Expect: rows present (assuming default learn_from_won=true and reference_override IS NULL on the won proposals).

-- =====================================================================================
-- CASE 4 — Submitted/lost NOT retrieved by default; org master-switch toggle flips it
-- =====================================================================================
-- Baseline (excluded by default):
SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
WHERE id IN (SELECT id FROM chunks WHERE proposal_id = '<SUBMITTED_ID>'::uuid);
-- Expect: 0 rows (learn_from_submitted default false).

SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
WHERE id IN (SELECT id FROM chunks WHERE proposal_id = '<LOST_ID>'::uuid);
-- Expect: 0 rows (learn_from_lost default false).

BEGIN;
  UPDATE organizations SET learn_from_submitted = true, learn_from_lost = true WHERE id = '<ORG_ID>'::uuid;
  SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id IN ('<SUBMITTED_ID>'::uuid, '<LOST_ID>'::uuid));
  -- Expect: rows present for both — toggling the switch ON includes them.
ROLLBACK;

-- Post-rollback sanity: switches revert to false, submitted/lost excluded again.
SELECT learn_from_submitted, learn_from_lost FROM organizations WHERE id = '<ORG_ID>'::uuid;
-- Expect: learn_from_submitted=false, learn_from_lost=false (unchanged from baseline — ROLLBACK undid the flip).

-- =====================================================================================
-- CASE 5 — reference_override overrides the master switch; override on a draft is a no-op
-- =====================================================================================
BEGIN;
  -- won -> reference_override=false excludes it despite learn_from_won=true default.
  UPDATE proposals SET reference_override = false WHERE id IN (SELECT id FROM proposals WHERE status = 'won' AND org_id = '<ORG_ID>'::uuid LIMIT 1);
  -- lost -> reference_override=true includes it despite learn_from_lost=false default.
  UPDATE proposals SET reference_override = true WHERE id = '<LOST_ID>'::uuid;
  SELECT proname, id FROM (SELECT 'fts' AS proname, id FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)) t
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id IN (
    (SELECT id FROM proposals WHERE status = 'won' AND org_id = '<ORG_ID>'::uuid LIMIT 1),
    '<LOST_ID>'::uuid
  ));
  -- Expect: won-with-override-false excluded; lost-with-override-true included.

  -- Draft override is a no-op: set reference_override=true on another draft and assert unchanged (still excluded).
  UPDATE proposals SET reference_override = true WHERE id = '<OTHER_DRAFT_ID>'::uuid;
  SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id = '<OTHER_DRAFT_ID>'::uuid);
  -- Expect: 0 rows — override has zero effect while status = 'draft'.
ROLLBACK;

-- =====================================================================================
-- CASE 6 (synthetic, fail-closed NULL) — a chunk with proposal_id IS NULL is never returned
-- =====================================================================================
BEGIN;
  INSERT INTO chunks (org_id, doc_type, proposal_id, content, source)
  VALUES ('<ORG_ID>'::uuid, 'proposal', NULL, 'synthetic null-proposal_id chunk for verification', 'synthetic-verify');

  SELECT * FROM match_chunks_fts_proposals('synthetic null-proposal_id chunk', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE content = 'synthetic null-proposal_id chunk for verification';
  -- Expect: 0 rows — the c.proposal_id IS NOT NULL gate excludes it even though org_id and doc_type match.
ROLLBACK;

-- =====================================================================================
-- CASE 7 — Backfill headline: unresolvable proposal chunks count (D-05c)
-- =====================================================================================
SELECT count(*) FROM _backfill_unresolved_proposal_chunks;
-- Expect: 0 (all 171 live proposal chunks resolved cleanly per RESEARCH.md).

-- =====================================================================================
-- EDGE CASE A — Unknown/new status defaults to NOT eligible (CASE ELSE false)
-- =====================================================================================
BEGIN;
  -- Force all three master switches ON, then set a test proposal's status to an unmapped value.
  UPDATE organizations SET learn_from_won = true, learn_from_submitted = true, learn_from_lost = true WHERE id = '<ORG_ID>'::uuid;
  UPDATE proposals SET status = 'archived', reference_override = NULL WHERE id = '<OTHER_DRAFT_ID>'::uuid;

  SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id = '<OTHER_DRAFT_ID>'::uuid);
  -- Expect: 0 rows — 'archived' is unmapped in the master-switch CASE, so it falls to ELSE false,
  -- regardless of all three switches being ON.
ROLLBACK;

-- =====================================================================================
-- EDGE CASE B — reference_override IS NULL falls through to the org master switch
-- =====================================================================================
-- A won proposal with reference_override IS NULL toggles exactly with learn_from_won.
BEGIN;
  UPDATE proposals SET reference_override = NULL WHERE id IN (SELECT id FROM proposals WHERE status = 'won' AND org_id = '<ORG_ID>'::uuid LIMIT 1);
  UPDATE organizations SET learn_from_won = false WHERE id = '<ORG_ID>'::uuid;
  SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id IN (SELECT id FROM proposals WHERE status = 'won' AND org_id = '<ORG_ID>'::uuid LIMIT 1));
  -- Expect: 0 rows (switch off, override NULL -> falls through to switch -> excluded).

  UPDATE organizations SET learn_from_won = true WHERE id = '<ORG_ID>'::uuid;
  SELECT * FROM match_chunks_fts_proposals('proposal', '<ORG_ID>'::uuid, 200, '<DRAFT_ID>'::uuid)
  WHERE id IN (SELECT id FROM chunks WHERE proposal_id IN (SELECT id FROM proposals WHERE status = 'won' AND org_id = '<ORG_ID>'::uuid LIMIT 1));
  -- Expect: rows present (switch on, override NULL -> falls through to switch -> included).
ROLLBACK;

-- =====================================================================================
-- EDGE CASE C — Exactly one overload of each RPC exists post-apply (no stale unscoped signature)
-- =====================================================================================
SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname LIKE 'match_chunks_%_proposals';
-- Expect: exactly 2 rows (one match_chunks_vector_proposals row, one match_chunks_fts_proposals row),
-- both showing current_proposal_id as the final argument.
