// src/lib/__tests__/assumptionPersistence.test.ts
//
// The wizard used to treat proposal_assumptions as a write-only log: Step 2
// inserted every extracted assumption as 'pending', then the 2->3 transition
// upserted the approved ones. That upsert carried no `id` and no onConflict
// target, so it could never match an existing row — Postgres minted a new UUID
// and every call inserted. Production ended up with 316 duplicate
// (proposal_id, content) groups across 648 of 950 rows, and nothing ever wrote
// a rejection or a removal, so an assumption approved once stayed 'approved'
// forever and kept feeding generate-proposal-section's prompt.
//
// These tests pin the replacement behaviour: after a 2->3 transition the table
// holds exactly the set the user reviewed, whatever they did to get there.
import { describe, it, expect, vi } from 'vitest'
import { buildAssumptionRows, replaceProposalAssumptions } from '../assumptionPersistence'
import type { WizardAssumption } from '../../types/wizard'

const makeAssumption = (overrides: Partial<WizardAssumption> = {}): WizardAssumption => ({
  id: 'a1',
  category: 'scope',
  value: 'Sites report SAEs within 24 hours',
  confidence: 'high',
  source: 'protocol.pdf',
  status: 'approved',
  ...overrides,
})

/** Minimal stand-in for the supabase client, recording what it was asked to do. */
function makeClient(opts: { deleteError?: string; insertError?: string } = {}) {
  const calls: Array<{ op: string; payload?: unknown; filter?: [string, string] }> = []
  const client = {
    from: vi.fn(() => ({
      delete: () => ({
        eq: (col: string, val: string) => {
          calls.push({ op: 'delete', filter: [col, val] })
          return Promise.resolve({
            error: opts.deleteError ? { message: opts.deleteError } : null,
          })
        },
      }),
      insert: (rows: unknown) => {
        calls.push({ op: 'insert', payload: rows })
        return Promise.resolve({
          error: opts.insertError ? { message: opts.insertError } : null,
        })
      },
    })),
  }
  return { client: client as never, calls }
}

describe('buildAssumptionRows', () => {
  it('keeps every reviewed status, not just approved', () => {
    const rows = buildAssumptionRows('p1', 'o1', [
      makeAssumption({ id: 'a1', status: 'approved', value: 'Approved one' }),
      makeAssumption({ id: 'a2', status: 'pending', value: 'Pending one' }),
      makeAssumption({ id: 'a3', status: 'rejected', value: 'Rejected one' }),
    ])
    expect(rows.map((r) => r.status)).toEqual(['approved', 'pending', 'rejected'])
  })

  it('carries the chosen category through to the row', () => {
    const rows = buildAssumptionRows('p1', 'o1', [makeAssumption({ category: 'timeline' })])
    expect(rows[0].category).toBe('timeline')
  })

  it('marks only user-provided assumptions as user_edited', () => {
    const rows = buildAssumptionRows('p1', 'o1', [
      makeAssumption({ id: 'a1', source: 'user-provided' }),
      makeAssumption({ id: 'a2', source: 'protocol.pdf' }),
    ])
    expect(rows.map((r) => r.user_edited)).toEqual([true, false])
  })

  it('drops blank and whitespace-only cards', () => {
    // An added-but-never-typed card used to persist as content:"" and reach the
    // model as a bare "- [scope] " line.
    const rows = buildAssumptionRows('p1', 'o1', [
      makeAssumption({ id: 'a1', value: '' }),
      makeAssumption({ id: 'a2', value: '   ' }),
      makeAssumption({ id: 'a3', value: 'Real assumption' }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].content).toBe('Real assumption')
  })

  it('trims surrounding whitespace from content', () => {
    const rows = buildAssumptionRows('p1', 'o1', [makeAssumption({ value: '  padded  ' })])
    expect(rows[0].content).toBe('padded')
  })

  it('stamps the proposal and org onto every row', () => {
    const rows = buildAssumptionRows('p1', 'o1', [makeAssumption(), makeAssumption({ id: 'a2' })])
    expect(rows.every((r) => r.proposal_id === 'p1' && r.org_id === 'o1')).toBe(true)
  })
})

describe('replaceProposalAssumptions', () => {
  it('deletes the proposal rows before inserting the reviewed set', async () => {
    const { client, calls } = makeClient()
    await replaceProposalAssumptions(client, 'p1', 'o1', [makeAssumption()])
    expect(calls.map((c) => c.op)).toEqual(['delete', 'insert'])
    expect(calls[0].filter).toEqual(['proposal_id', 'p1'])
  })

  it('scopes the delete to the one proposal', async () => {
    const { client, calls } = makeClient()
    await replaceProposalAssumptions(client, 'p-target', 'o1', [makeAssumption()])
    expect(calls[0].filter).toEqual(['proposal_id', 'p-target'])
  })

  it('converges instead of accumulating when the user goes Back and Next again', async () => {
    const set = [makeAssumption({ id: 'a1', value: 'One' }), makeAssumption({ id: 'a2', value: 'Two' })]
    const { client, calls } = makeClient()
    await replaceProposalAssumptions(client, 'p1', 'o1', set)
    await replaceProposalAssumptions(client, 'p1', 'o1', set)
    const inserts = calls.filter((c) => c.op === 'insert')
    expect(inserts).toHaveLength(2)
    // Each pass re-states the same two rows rather than adding to what is there.
    expect(inserts[0].payload).toEqual(inserts[1].payload)
    expect((inserts[1].payload as unknown[])).toHaveLength(2)
  })

  it('drops an assumption the user removed, because the delete is unconditional', async () => {
    const { client, calls } = makeClient()
    await replaceProposalAssumptions(client, 'p1', 'o1', [])
    expect(calls.map((c) => c.op)).toEqual(['delete'])
  })

  it('does not insert when the delete failed, so a failure cannot duplicate rows', async () => {
    const { client, calls } = makeClient({ deleteError: 'permission denied' })
    const result = await replaceProposalAssumptions(client, 'p1', 'o1', [makeAssumption()])
    expect(calls.map((c) => c.op)).toEqual(['delete'])
    expect(result.error).toBe('permission denied')
  })

  it('reports an insert failure to the caller', async () => {
    const { client } = makeClient({ insertError: 'violates not-null' })
    const result = await replaceProposalAssumptions(client, 'p1', 'o1', [makeAssumption()])
    expect(result.error).toBe('violates not-null')
  })

  it('reports success as a null error', async () => {
    const { client } = makeClient()
    const result = await replaceProposalAssumptions(client, 'p1', 'o1', [makeAssumption()])
    expect(result.error).toBeNull()
  })
})
