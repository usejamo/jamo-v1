// Phase 16 (Plan 05) — the assertions that ACTUALLY EXECUTE for demo-reset.
//
// Deno is not installed in this dev environment, so supabase/functions/demo-reset/test.ts
// (Deno.test) is never run here. `_shared/demoRunCleanup.ts` has zero Deno-runtime imports —
// it is plain TypeScript — so Vitest imports the REAL edge module directly rather than a
// duplicated copy. There is therefore no drift surface to guard: these tests exercise the
// exact bytes that get deployed.
//
// What is under test is a DESTRUCTIVE routine, so the emphasis is on the two properties that
// matter more than feature completeness:
//   1. a reset can never reach a real client org's proposal (fail-closed guard), and
//   2. the delete ORDER is the one the FKs require (proposal_documents FIRST — SET NULL, not
//      cascade — or the row and its document_extracts orphan forever).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  cleanupDemoRun,
  isResettableRun,
  isRunInDemoOrg,
} from '../../../supabase/functions/_shared/demoRunCleanup'

const DEMO_ORG = '11111111-1111-1111-1111-111111111111'
const CLIENT_ORG = '22222222-2222-2222-2222-222222222222'
const CLEANUP_PATH = 'supabase/functions/_shared/demoRunCleanup.ts'
const RESET_PATH = 'supabase/functions/demo-reset/index.ts'

// ---------------------------------------------------------------------------
// Triple-guard: proposal leg (T-16-18)
// ---------------------------------------------------------------------------
describe('isResettableRun', () => {
  it('permits only a demo-org proposal that is still a draft', () => {
    expect(isResettableRun(DEMO_ORG, 'draft', DEMO_ORG)).toBe(true)
  })

  it('REFUSES a proposal belonging to a real client org, even when it is a draft', () => {
    // The load-bearing case: a forged demo_run_id naming a real client proposal.
    expect(isResettableRun(CLIENT_ORG, 'draft', DEMO_ORG)).toBe(false)
  })

  it('refuses a demo-org proposal that is no longer a draft', () => {
    for (const status of ['submitted', 'won', 'lost', 'archived', 'deleted', 'in_progress']) {
      expect(isResettableRun(DEMO_ORG, status, DEMO_ORG)).toBe(false)
    }
  })

  it('fails closed on null/undefined/blank input rather than defaulting to allow', () => {
    expect(isResettableRun(null, 'draft', DEMO_ORG)).toBe(false)
    expect(isResettableRun(undefined, 'draft', DEMO_ORG)).toBe(false)
    expect(isResettableRun('', 'draft', DEMO_ORG)).toBe(false)
    expect(isResettableRun(DEMO_ORG, null, DEMO_ORG)).toBe(false)
    expect(isResettableRun(DEMO_ORG, undefined, DEMO_ORG)).toBe(false)
    expect(isResettableRun(DEMO_ORG, 'draft', null)).toBe(false)
    expect(isResettableRun(DEMO_ORG, 'draft', undefined)).toBe(false)
    expect(isResettableRun(DEMO_ORG, 'draft', '')).toBe(false)
    // Two nulls must not compare equal and silently pass the org check.
    expect(isResettableRun(null, 'draft', null)).toBe(false)
  })

  it('is case-sensitive on status — "Draft" is not "draft"', () => {
    expect(isResettableRun(DEMO_ORG, 'Draft', DEMO_ORG)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Triple-guard: demo_runs membership leg
// ---------------------------------------------------------------------------
describe('isRunInDemoOrg', () => {
  it('permits a run row registered to the demo org', () => {
    expect(isRunInDemoOrg(DEMO_ORG, DEMO_ORG)).toBe(true)
  })

  it('refuses a run row registered to any other org', () => {
    expect(isRunInDemoOrg(CLIENT_ORG, DEMO_ORG)).toBe(false)
  })

  it('fails closed on nulls', () => {
    expect(isRunInDemoOrg(null, DEMO_ORG)).toBe(false)
    expect(isRunInDemoOrg(DEMO_ORG, null)).toBe(false)
    expect(isRunInDemoOrg(null, null)).toBe(false)
    expect(isRunInDemoOrg('', '')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Delete order + blast radius
// ---------------------------------------------------------------------------
type Call = { table: string; column: string; value: string; op: 'delete' | 'update' }

function fakeAdmin(failOn?: string) {
  const calls: Call[] = []
  const record = (table: string, op: 'delete' | 'update') => ({
    eq(column: string, value: string) {
      calls.push({ table, column, value, op })
      return Promise.resolve({
        error: failOn === table ? { message: `boom on ${table}` } : null,
      })
    },
  })
  const admin = {
    from(table: string) {
      return {
        delete: () => record(table, 'delete'),
        update: () => record(table, 'update'),
      }
    },
  }
  return { admin, calls }
}

const RUN = { id: 'run-1', proposal_id: 'prop-1', org_id: DEMO_ORG }

describe('cleanupDemoRun', () => {
  it('clears assumption source_document refs, then deletes documents, proposal, run', async () => {
    const { admin, calls } = fakeAdmin()
    await cleanupDemoRun(admin, RUN)
    expect(calls.map((c) => c.table)).toEqual([
      'proposal_assumptions',
      'proposal_documents',
      'proposals',
      'demo_runs',
    ])
  })

  it('only UPDATES proposal_assumptions — the row deletion is left to the proposal cascade', async () => {
    const { admin, calls } = fakeAdmin()
    await cleanupDemoRun(admin, RUN)
    const assumptionOps = calls.filter((c) => c.table === 'proposal_assumptions')
    expect(assumptionOps.map((c) => c.op)).toEqual(['update'])
  })

  it('scopes every write to this run only — never a bare table delete', async () => {
    const { admin, calls } = fakeAdmin()
    await cleanupDemoRun(admin, RUN)
    expect(calls).toEqual([
      { table: 'proposal_assumptions', column: 'proposal_id', value: 'prop-1', op: 'update' },
      { table: 'proposal_documents', column: 'proposal_id', value: 'prop-1', op: 'delete' },
      { table: 'proposals', column: 'id', value: 'prop-1', op: 'delete' },
      { table: 'demo_runs', column: 'id', value: 'run-1', op: 'delete' },
    ])
  })

  it('deletes NOTHING when clearing the source_document refs fails', async () => {
    // proposal_assumptions.source_document -> proposal_documents is NO ACTION, so leaving a
    // populated ref would make the proposal_documents delete fail anyway. Abort before any delete.
    const { admin, calls } = fakeAdmin('proposal_assumptions')
    await expect(cleanupDemoRun(admin, RUN)).rejects.toThrow(/source_document/)
    expect(calls.filter((c) => c.op === 'delete')).toEqual([])
  })

  it('does NOT delete the proposal when the proposal_documents delete fails', async () => {
    // If step 1 fails and we proceeded, the SET-NULL FK would strand the document row
    // permanently — it would no longer be joinable to any proposal id.
    const { admin, calls } = fakeAdmin('proposal_documents')
    await expect(cleanupDemoRun(admin, RUN)).rejects.toThrow(/proposal_documents/)
    expect(calls.filter((c) => c.op === 'delete').map((c) => c.table)).toEqual([
      'proposal_documents',
    ])
  })

  it('stops before demo_runs when the proposal delete fails', async () => {
    const { admin, calls } = fakeAdmin('proposals')
    await expect(cleanupDemoRun(admin, RUN)).rejects.toThrow(/proposal/)
    expect(calls.filter((c) => c.op === 'delete').map((c) => c.table)).toEqual([
      'proposal_documents',
      'proposals',
    ])
  })

  it('touches exactly four tables and no others', async () => {
    const { admin, calls } = fakeAdmin()
    await cleanupDemoRun(admin, RUN)
    expect(new Set(calls.map((c) => c.table)).size).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// Static blast-radius guards (D-06 / T-16-21)
// ---------------------------------------------------------------------------
describe('demo teardown blast radius', () => {
  const read = (rel: string) =>
    readFileSync(resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n')

  it('the cleanup module never deletes a bucket object (shared canonical RFP is retained)', () => {
    const src = read(CLEANUP_PATH)
    expect(src).not.toMatch(/\.remove\(/)
    expect(src).not.toMatch(/\.from\(\s*['"]documents['"]\s*\)/)
    expect(src.toLowerCase()).not.toContain('canonical-demo-rfp')
  })

  it('demo-reset never deletes a bucket object either', () => {
    const src = read(RESET_PATH)
    expect(src).not.toMatch(/\.remove\(/)
    expect(src).not.toContain('canonical-demo-rfp')
  })

  it('demo-reset performs no deletes of its own — teardown is delegated to one routine', () => {
    const src = read(RESET_PATH)
    expect(src).toContain('cleanupDemoRun')
    expect(src).not.toMatch(/\.delete\(\)/)
  })

  it('demo-reset gates on super_admin and refuses an unproven target', () => {
    const src = read(RESET_PATH)
    expect(src).toContain("jsonError(403, 'super_admin required'")
    expect(src).toContain('reset refused: not a resettable demo run')
  })

  it('demo-reset resolves the demo org at runtime, never by a hardcoded UUID', () => {
    const src = read(RESET_PATH)
    expect(src).toContain('is_demo')
    expect(src).toContain('jamo-demo')
    // No literal UUID may appear anywhere in the reset handler.
    expect(src).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  })

  it('demo-reset takes its target from the request body, not from the account', () => {
    const src = read(RESET_PATH)
    expect(src).toContain('demo_run_id')
    // A "current run for this user" lookup would be ambiguous under the shared demo login.
    expect(src).not.toMatch(/\.eq\(\s*['"]started_by['"]/)
  })
})
