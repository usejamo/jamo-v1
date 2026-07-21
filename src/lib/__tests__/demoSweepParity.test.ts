// Phase 16 (Plan 06) — the assertions that guard the UNATTENDED demo sweep.
//
// The sweep is a scheduled destructive job: nobody is watching when it fires, so an
// over-broad targeting query here is far worse than in the hand-triggered demo-reset.
// What is under test is therefore blast radius and DRIFT, not feature surface.
//
// ---------------------------------------------------------------------------------------
// WHAT THESE TESTS DO AND DO NOT PROVE — read this before trusting them
// ---------------------------------------------------------------------------------------
// The sweep ships as PL/pgSQL (supabase/migrations/20260721000004_demo_sweep_cron.sql), and
// there is no Postgres instance in this dev environment. So:
//
//   * The PARITY + STRUCTURAL tests below are REAL: they parse the exact committed bytes of
//     the migration and of _shared/demoRunCleanup.ts. They genuinely fail if a guard is
//     dropped from the SQL, or if the two teardown implementations stop matching.
//   * The BEHAVIOURAL tests below run a SIMULATOR of the SQL predicate written in TypeScript
//     in this file. It is NOT the shipped code and executing it proves nothing about
//     Postgres. Its job is to pin the intended semantics in an executable form; the
//     structural tests are what stop the SQL from drifting away from those semantics.
//
// A true behavioural proof requires running the function against Postgres. That is owed at
// the Task 4 checkpoint and the exact script is committed at
// .planning/phases/16-token-free-demo-mode/16-06-live-verification.sql — it uses the
// function's p_dry_run mode, so it is non-destructive.
//
// ---------------------------------------------------------------------------------------
// WHY A DRIFT DETECTOR EXISTS AT ALL
// ---------------------------------------------------------------------------------------
// demo-reset tears a run down in TypeScript (_shared/demoRunCleanup.ts); the sweep tears it
// down in SQL. Two implementations of a destructive routine is a real cost, accepted because
// the alternative (pg_net + a Vault-stored bearer that must byte-match a platform-injected
// secret) put an hourly SILENT 401 on the table — see the migration's header for the full
// argument. The cost is paid down here: if the ordered set of teardown statements in the two
// files stops matching, `npm run test:run` fails. That is the mechanism keeping them honest.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SWEEP_SQL_PATH = 'supabase/migrations/20260721000004_demo_sweep_cron.sql'
const CLEANUP_TS_PATH = 'supabase/functions/_shared/demoRunCleanup.ts'

const read = (rel: string) =>
  readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

const SWEEP_SQL = read(SWEEP_SQL_PATH)
const CLEANUP_TS = read(CLEANUP_TS_PATH)

/** SQL with every `--` line comment removed, so prose about deletes is never mistaken for one. */
const SWEEP_SQL_CODE = SWEEP_SQL.split('\n')
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n')

/** The candidate-selection query only (the part that decides WHAT may be destroyed). */
const CANDIDATE_QUERY = (() => {
  const start = SWEEP_SQL_CODE.indexOf('from demo_runs dr')
  const end = SWEEP_SQL_CODE.indexOf('limit p_max_batch')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SWEEP_SQL_CODE.slice(start, end)
})()

// ---------------------------------------------------------------------------
// 1. DRIFT DETECTOR: the two teardown implementations must stay in lockstep
// ---------------------------------------------------------------------------
describe('teardown parity: SQL sweep vs _shared/demoRunCleanup.ts', () => {
  /** ['update:proposal_assumptions', 'delete:proposal_documents', ...] in source order. */
  const tsSteps = [...CLEANUP_TS.matchAll(/\.from\('(\w+)'\)\s*\.(delete|update)\s*\(/g)].map(
    (m) => `${m[2]}:${m[1]}`
  )

  const sqlSteps = [...SWEEP_SQL_CODE.matchAll(/\b(update|delete\s+from)\s+([a-z_]+)\b/gi)].map(
    (m) => `${m[1].toLowerCase().startsWith('delete') ? 'delete' : 'update'}:${m[2].toLowerCase()}`
  )

  it('performs the SAME teardown statements in the SAME order as demoRunCleanup.ts', () => {
    // If this fails, one implementation gained/lost/reordered a step. Fix BOTH, not the test.
    expect(sqlSteps).toEqual(tsSteps)
  })

  it('starts with the source_document clear and ends with the demo_runs delete', () => {
    // Step 0 first: proposal_assumptions.source_document -> proposal_documents is NO ACTION and
    // would REFUSE the proposal_documents delete outright.
    expect(sqlSteps[0]).toBe('update:proposal_assumptions')
    // proposal_documents BEFORE proposals: that FK is SET NULL, so after the proposal delete the
    // row is unjoinable and orphans permanently along with its document_extracts.
    expect(sqlSteps.indexOf('delete:proposal_documents')).toBeLessThan(
      sqlSteps.indexOf('delete:proposals')
    )
    expect(sqlSteps[sqlSteps.length - 1]).toBe('delete:demo_runs')
  })

  it('touches no table outside the four the teardown owns', () => {
    // usage_events.proposal_id is SET NULL and deliberately left alone (billing telemetry).
    const allowed = new Set([
      'update:proposal_assumptions',
      'delete:proposal_documents',
      'delete:proposals',
      'delete:demo_runs',
    ])
    for (const step of sqlSteps) expect(allowed.has(step)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. STRUCTURAL: the targeting query cannot reach outside the demo org
// ---------------------------------------------------------------------------
describe('sweep targeting query', () => {
  it('scopes BOTH the demo_runs row and its proposal to the runtime-resolved demo org', () => {
    expect(CANDIDATE_QUERY).toMatch(/dr\.org_id\s*=\s*v_demo_org_id/)
    expect(CANDIDATE_QUERY).toMatch(/p\.org_id\s*=\s*v_demo_org_id/)
  })

  it('requires the proposal to still be a draft', () => {
    expect(CANDIDATE_QUERY).toMatch(/p\.status\s*=\s*'draft'/)
  })

  it('requires the run to be older than 24 hours', () => {
    expect(CANDIDATE_QUERY).toMatch(/dr\.created_at\s*<\s*now\(\)\s*-\s*interval\s*'24 hours'/)
  })

  it('ANDs every guard — a single OR would widen the blast radius', () => {
    expect((CANDIDATE_QUERY.match(/\band\b/g) ?? []).length).toBeGreaterThanOrEqual(3)
    expect(CANDIDATE_QUERY).not.toMatch(/\bor\b/)
  })

  it('bounds the batch', () => {
    expect(SWEEP_SQL_CODE).toMatch(/limit p_max_batch/)
    expect(SWEEP_SQL_CODE).toMatch(/p_max_batch int default \d+/)
  })

  it('resolves the demo org at runtime and NEVER by a hardcoded UUID', () => {
    expect(SWEEP_SQL_CODE).toMatch(/feature_flags->>'is_demo'/)
    expect(SWEEP_SQL_CODE).toMatch(/'jamo-demo'/)
    expect(SWEEP_SQL_CODE).not.toMatch(
      /'[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'/i
    )
  })

  it('fails closed unless EXACTLY ONE demo org resolves', () => {
    expect(SWEEP_SQL_CODE).toMatch(/v_demo_org_count\s*<>\s*1/)
  })

  it('re-asserts the triple guard per row, not once for the batch', () => {
    expect(SWEEP_SQL_CODE).toMatch(/v_run\.run_org_id is distinct from v_demo_org_id/)
    expect(SWEEP_SQL_CODE).toMatch(/v_run\.proposal_org_id is distinct from v_demo_org_id/)
    expect(SWEEP_SQL_CODE).toMatch(/v_run\.proposal_status is distinct from 'draft'/)
  })

  it('isolates a failing row so one bad run cannot abort the batch', () => {
    expect(SWEEP_SQL_CODE).toMatch(/exception when others then/)
    expect(SWEEP_SQL_CODE).toMatch(/outcome\s*:=\s*'error/)
  })

  it('offers a non-destructive dry run', () => {
    expect(SWEEP_SQL_CODE).toMatch(/p_dry_run boolean default false/)
    expect(SWEEP_SQL_CODE).toMatch(/'would_sweep'/)
  })
})

// ---------------------------------------------------------------------------
// 3. STRUCTURAL: what the sweep must NEVER do
// ---------------------------------------------------------------------------
describe('sweep prohibitions', () => {
  it('never flips a proposal off draft (Req 9 — the retrieval exclusion depends on it)', () => {
    expect(SWEEP_SQL_CODE).not.toMatch(/update\s+proposals\s+set/i)
    expect(SWEEP_SQL_CODE).not.toMatch(/set\s+status\s*=/i)
  })

  it('never deletes the shared canonical demo RFP object, or any Storage object', () => {
    // The object is referenced by EVERY run and owned by NO run (CONTEXT D-06).
    expect(SWEEP_SQL_CODE).not.toMatch(/storage\./i)
    expect(SWEEP_SQL_CODE).not.toMatch(/canonical-demo-rfp/i)
  })

  it('never touches usage_events (billing telemetry, deliberately retained)', () => {
    expect(SWEEP_SQL_CODE).not.toMatch(/usage_events/i)
  })

  it('embeds no secret and makes no network call', () => {
    // Option (a) was chosen precisely so there is no bearer token anywhere in this file.
    // Matches a secret VALUE, not the word — the header discusses the `sb_secret_` key format.
    expect(SWEEP_SQL).not.toMatch(
      /sb_secret_[A-Za-z0-9_-]{10,}|sbp_[A-Za-z0-9_-]{10,}|eyJ[A-Za-z0-9_-]{20,}/
    )
    expect(SWEEP_SQL_CODE).not.toMatch(/net\.http_post|pg_net/i)
    expect(SWEEP_SQL_CODE).not.toMatch(/vault\.|decrypted_secrets/i)
  })
})

// ---------------------------------------------------------------------------
// 4. SCHEDULE
// ---------------------------------------------------------------------------
describe('cron schedule', () => {
  it('runs hourly under the expected job name', () => {
    expect(SWEEP_SQL_CODE).toMatch(/cron\.schedule\(\s*\n?\s*'demo-run-sweep',\s*\n?\s*'0 \* \* \* \*'/)
  })

  it('is idempotent on re-apply — a duplicate job would double the delete rate', () => {
    expect(SWEEP_SQL_CODE).toMatch(/cron\.unschedule\('demo-run-sweep'\)/)
    expect(SWEEP_SQL_CODE).toMatch(/create or replace function public\.sweep_abandoned_demo_runs/)
  })

  it('is not callable by anyone but service_role', () => {
    expect(SWEEP_SQL_CODE).toMatch(/revoke all on function public\.sweep_abandoned_demo_runs/)
    expect(SWEEP_SQL_CODE).toMatch(
      /grant execute on function public\.sweep_abandoned_demo_runs\(int, boolean\) to service_role/
    )
  })
})

// ---------------------------------------------------------------------------
// 5. BEHAVIOURAL — SIMULATOR ONLY. This is NOT the shipped code (see header).
// ---------------------------------------------------------------------------
type CandidateRow = {
  runOrgId: string | null
  proposalOrgId: string | null
  proposalStatus: string | null
  createdAt: Date
}

const HOUR = 60 * 60 * 1000
const DEMO_ORG = '11111111-1111-1111-1111-111111111111'
const CLIENT_ORG = '22222222-2222-2222-2222-222222222222'
const NOW = new Date('2026-07-21T12:00:00Z')

/**
 * TypeScript mirror of the SQL predicate: the four ANDed conjuncts of the candidate query,
 * plus the per-row re-assertion. Fails closed on nulls and on an unresolved demo org.
 */
function isSweepable(row: CandidateRow, demoOrgId: string | null, now: Date): boolean {
  if (!demoOrgId) return false
  if (!row.runOrgId || row.runOrgId !== demoOrgId) return false
  if (!row.proposalOrgId || row.proposalOrgId !== demoOrgId) return false
  if (row.proposalStatus !== 'draft') return false
  return row.createdAt.getTime() < now.getTime() - 24 * HOUR
}

const demoRun = (over: Partial<CandidateRow> = {}): CandidateRow => ({
  runOrgId: DEMO_ORG,
  proposalOrgId: DEMO_ORG,
  proposalStatus: 'draft',
  createdAt: new Date(NOW.getTime() - 25 * HOUR),
  ...over,
})

describe('isSweepable (simulator of the SQL predicate)', () => {
  it('sweeps a demo-org draft run older than 24h', () => {
    expect(isSweepable(demoRun(), DEMO_ORG, NOW)).toBe(true)
  })

  it('CANNOT select a real client org proposal, however old the run is', () => {
    // The load-bearing case for an unattended deleter. Both legs are checked independently,
    // so neither a mis-registered demo_runs row nor a cross-org proposal gets through.
    expect(
      isSweepable(demoRun({ proposalOrgId: CLIENT_ORG, createdAt: new Date(0) }), DEMO_ORG, NOW)
    ).toBe(false)
    expect(
      isSweepable(demoRun({ runOrgId: CLIENT_ORG, createdAt: new Date(0) }), DEMO_ORG, NOW)
    ).toBe(false)
    expect(
      isSweepable(
        { runOrgId: CLIENT_ORG, proposalOrgId: CLIENT_ORG, proposalStatus: 'draft', createdAt: new Date(0) },
        DEMO_ORG,
        NOW
      )
    ).toBe(false)
  })

  it('does NOT sweep a run that is too young — 23h59m survives, 24h01m does not', () => {
    const tooYoung = demoRun({ createdAt: new Date(NOW.getTime() - (24 * HOUR - 60 * 1000)) })
    const oldEnough = demoRun({ createdAt: new Date(NOW.getTime() - (24 * HOUR + 60 * 1000)) })
    expect(isSweepable(tooYoung, DEMO_ORG, NOW)).toBe(false)
    expect(isSweepable(oldEnough, DEMO_ORG, NOW)).toBe(true)
    // Exactly 24h is NOT swept: the SQL is a strict `<`, so a live run is never taken early.
    expect(isSweepable(demoRun({ createdAt: new Date(NOW.getTime() - 24 * HOUR) }), DEMO_ORG, NOW)).toBe(
      false
    )
  })

  it('does not sweep a demo run whose proposal left draft', () => {
    for (const status of ['submitted', 'won', 'lost', 'archived', 'deleted', 'in_progress', 'Draft']) {
      expect(isSweepable(demoRun({ proposalStatus: status }), DEMO_ORG, NOW)).toBe(false)
    }
  })

  it('fails closed when the demo org cannot be resolved, rather than sweeping everything', () => {
    expect(isSweepable(demoRun(), null, NOW)).toBe(false)
    expect(isSweepable(demoRun(), '', NOW)).toBe(false)
    // Two nulls must not compare equal and silently pass the org check.
    expect(isSweepable(demoRun({ runOrgId: null, proposalOrgId: null }), null, NOW)).toBe(false)
  })
})
