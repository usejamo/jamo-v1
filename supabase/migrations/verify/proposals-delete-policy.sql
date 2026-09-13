-- Verification for 20260912000001_proposals_delete_policy.sql (todo #7).
--
-- Runs entirely inside a transaction that ROLLBACKs, so it is safe against the
-- live project. Run via the management API:
--   POST https://api.supabase.com/v1/projects/fuuvdcvbliijffogjnwg/database/query
-- with the sbp_ token from the SUPABASE_ACCESS_TOKEN line of .env.
-- (`supabase db push` does not work on this project — history diverged.)
--
-- Substitute the three ids below for the project you are verifying against.
-- Executed 2026-09-12 against fuuvdcvbliijffogjnwg: all three rows returned
-- the expected count (1 / 0 / 0).
--
-- Note the endpoint returns only the LAST statement's result set, which is why
-- the per-assertion counts are collected into a temp table and selected once at
-- the end. The GRANT is required because the assertions run as `authenticated`.

BEGIN;

CREATE TEMP TABLE results (test text, rows_deleted int) ON COMMIT DROP;
GRANT INSERT, SELECT ON results TO authenticated;

-- :org_id / :created_by — any org + a user_profiles.id in it.
INSERT INTO proposals (id, org_id, created_by, title, status, is_archived, deleted_at) VALUES
 ('11111111-0000-0000-0000-00000000aaaa', :'org_id', :'created_by', 'RLSTEST-trashed',  'draft', false, now()),
 ('11111111-0000-0000-0000-00000000bbbb', :'org_id', :'created_by', 'RLSTEST-active',   'draft', false, null),
 ('11111111-0000-0000-0000-00000000cccc', :'org_id', :'created_by', 'RLSTEST-trashed2', 'draft', false, now());

SET LOCAL ROLE authenticated;

-- Assertion 1: an admin CAN hard-delete a proposal that is in the Trash.
-- This is the behaviour that was broken — before the policy existed this
-- returned 0 with no error, which is why the UI lied about success.
-- :admin_user_id — auth.users.id of a member with role admin or super_admin.
SET LOCAL request.jwt.claims = '{"sub":":admin_user_id","role":"authenticated"}';
WITH d AS (DELETE FROM proposals WHERE id = '11111111-0000-0000-0000-00000000aaaa' RETURNING 1)
INSERT INTO results SELECT '1_admin_deletes_trashed_EXPECT_1', count(*) FROM d;

-- Assertion 2: not even an admin can hard-delete a LIVE proposal. A proposal
-- must be soft-deleted first, so "Delete Forever" stays reachable only from the
-- Deleted tab.
WITH d AS (DELETE FROM proposals WHERE id = '11111111-0000-0000-0000-00000000bbbb' RETURNING 1)
INSERT INTO results SELECT '2_admin_deletes_ACTIVE_EXPECT_0', count(*) FROM d;

-- Assertion 3: a plain member (role 'user') cannot hard-delete at all, even
-- from the Trash.
-- :plain_user_id — auth.users.id of a member whose role is 'user'.
SET LOCAL request.jwt.claims = '{"sub":":plain_user_id","role":"authenticated"}';
WITH d AS (DELETE FROM proposals WHERE id = '11111111-0000-0000-0000-00000000cccc' RETURNING 1)
INSERT INTO results SELECT '3_plain_user_deletes_trashed_EXPECT_0', count(*) FROM d;

SELECT * FROM results ORDER BY test;

ROLLBACK;
