// Todo #7 — a proposal must leave its old list and land in its new one in the SAME
// render, with no refetch and no page refresh.
//
// The bug this locks down: there were four independent sources of truth for the three
// lists (ProposalsContext.proposals, ArchivedContext.archivedIds, DeletedContext's
// deletedIds, and ProposalsList's own tab-scoped refetch), and no mutation invalidated
// the others. Measured in-browser 2026-09-12 against the live project, every write
// landed in the database and every list stayed wrong:
//
//   archive()          -> row stayed in Active AND appeared in Archived (in both at once)
//   restore()          -> row stayed in Archived and was MISSING from Active
//   deleteProposal()   -> row stayed in Active
//
// So the assertions below always check BOTH halves of each move: gone from the old list
// AND present in the new one. Checking only the destination is what let "appears in both
// lists" survive this long.
//
// ProposalsContext is now the single owner of the row set; Archived/DeletedContext are
// thin mutators over it, which is why this test drives the three real providers together
// rather than unit-testing any one of them.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act } from '@testing-library/react'

const { rows, writes } = vi.hoisted(() => ({
  // One row in each of the three states, as the DB would return them. A single
  // select('*') sees all three: proposals_select covers the live rows and
  // proposals_select_deleted covers the trashed one for admin/super_admin.
  rows: [
    { id: 'p-active', title: 'Active one', status: 'draft', is_archived: false, deleted_at: null, created_at: '2026-09-01T00:00:00Z' },
    { id: 'p-arch', title: 'Archived one', status: 'draft', is_archived: true, deleted_at: null, created_at: '2026-09-02T00:00:00Z' },
    { id: 'p-del', title: 'Trashed one', status: 'draft', is_archived: false, deleted_at: '2026-09-03T00:00:00Z', created_at: '2026-09-03T00:00:00Z' },
  ],
  // Recorded so we can prove a mutation writes to the DB as well as to local state —
  // otherwise a test passes against an optimistic update that never persists.
  writes: [] as { op: string; payload?: unknown }[],
}))

vi.mock('../lib/supabase', () => {
  const makeBuilder = () => {
    let op = 'select'
    let payload: unknown
    const builder: Record<string, unknown> = {
      select: vi.fn(() => builder),
      insert: vi.fn(() => builder),
      update: vi.fn((p: unknown) => { op = 'update'; payload = p; return builder }),
      delete: vi.fn(() => { op = 'delete'; return builder }),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      not: vi.fn(() => builder),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      single: vi.fn(() => builder),
      then: (onFulfilled: (r: unknown) => unknown) => {
        if (op === 'select') return Promise.resolve({ data: rows, error: null }).then(onFulfilled)
        writes.push({ op, payload })
        return Promise.resolve({ data: null, error: null }).then(onFulfilled)
      },
    }
    return builder
  }
  return { supabase: { from: vi.fn(() => makeBuilder()) } }
})

// The returned object and its `session`/`profile` must be STABLE references. The load
// effect depends on `session`, so handing back a fresh literal per render re-runs the
// fetch on every render and spins forever.
vi.mock('./AuthContext', () => {
  const auth = {
    session: { user: { id: 'user-1' } },
    profile: { id: 'profile-1', org_id: 'org-1', role: 'admin' },
    loading: false,
  }
  return { useAuth: () => auth }
})

import { ProposalsProvider, useProposals } from './ProposalsContext'
import { DeletedProvider, useDeleted } from './DeletedContext'
import { ArchivedProvider, useArchived } from './ArchivedContext'

type Captured = {
  proposals: ReturnType<typeof useProposals>
  deleted: ReturnType<typeof useDeleted>
  archived: ReturnType<typeof useArchived>
}

function ids(list: { id: string }[]) {
  return list.map((p) => p.id).sort()
}

async function mount() {
  const captured = {} as Captured
  function Probe() {
    captured.proposals = useProposals()
    captured.deleted = useDeleted()
    captured.archived = useArchived()
    return null
  }
  // Mirrors App.tsx: Archived/Deleted live inside Proposals.
  await act(async () => {
    render(
      <ProposalsProvider>
        <DeletedProvider>
          <ArchivedProvider>
            <Probe />
          </ArchivedProvider>
        </DeletedProvider>
      </ProposalsProvider>
    )
  })
  return captured
}

describe('proposal list routing (todo #7)', () => {
  beforeEach(() => {
    writes.length = 0
  })

  it('splits the single fetch into the three lists', async () => {
    const c = await mount()
    expect(ids(c.proposals.proposals)).toEqual(['p-active'])
    expect(ids(c.proposals.archivedProposals)).toEqual(['p-arch'])
    expect(ids(c.proposals.deletedProposals)).toEqual(['p-del'])
  })

  it('archive moves the row out of Active and into Archived at once', async () => {
    const c = await mount()
    await act(async () => { await c.archived.archive('p-active') })

    expect(ids(c.proposals.proposals)).not.toContain('p-active')
    expect(ids(c.proposals.archivedProposals)).toContain('p-active')
    // The old symptom: present in both lists simultaneously.
    expect(ids(c.proposals.deletedProposals)).not.toContain('p-active')
    expect(writes).toEqual([{ op: 'update', payload: { is_archived: true } }])
  })

  it('restore moves the row out of Archived and back into Active at once', async () => {
    const c = await mount()
    await act(async () => { await c.archived.restore('p-arch') })

    expect(ids(c.proposals.archivedProposals)).not.toContain('p-arch')
    expect(ids(c.proposals.proposals)).toContain('p-arch')
    expect(writes).toEqual([{ op: 'update', payload: { is_archived: false } }])
  })

  it('soft delete moves the row out of Active and into Deleted at once', async () => {
    const c = await mount()
    await act(async () => { await c.deleted.deleteProposal('p-active') })

    expect(ids(c.proposals.proposals)).not.toContain('p-active')
    expect(ids(c.proposals.deletedProposals)).toContain('p-active')
    expect(c.deleted.deletedAt['p-active']).toBeTruthy()
  })

  it('restore from trash moves the row out of Deleted and back into Active at once', async () => {
    const c = await mount()
    await act(async () => { await c.deleted.restoreFromTrash('p-del') })

    expect(ids(c.proposals.deletedProposals)).not.toContain('p-del')
    expect(ids(c.proposals.proposals)).toContain('p-del')
    expect(c.deleted.deletedAt['p-del']).toBeUndefined()
  })

  it('archiving a trashed proposal does not resurrect it into Archived', async () => {
    // deleted_at wins over is_archived everywhere (both the Active and Archived
    // queries filtered deleted_at IS NULL), so a trashed row must stay in Trash.
    const c = await mount()
    await act(async () => { await c.archived.archive('p-del') })

    expect(ids(c.proposals.archivedProposals)).not.toContain('p-del')
    expect(ids(c.proposals.deletedProposals)).toContain('p-del')
  })

  it('permanent delete removes the row from every list', async () => {
    const c = await mount()
    await act(async () => { await c.proposals.permanentlyDelete('p-del') })

    expect(ids(c.proposals.proposals)).not.toContain('p-del')
    expect(ids(c.proposals.archivedProposals)).not.toContain('p-del')
    expect(ids(c.proposals.deletedProposals)).not.toContain('p-del')
    expect(writes).toEqual([{ op: 'delete', payload: undefined }])
  })

  it('keeps the id Sets the Dashboard filters on in step with the lists', async () => {
    // Dashboard.tsx filters proposals by archivedIds/deletedIds. Those Sets are now
    // derived from the same array, so they cannot drift out of sync with it.
    const c = await mount()
    expect([...c.archived.archivedIds]).toEqual(['p-arch'])
    expect([...c.deleted.deletedIds]).toEqual(['p-del'])

    await act(async () => { await c.archived.archive('p-active') })
    expect([...c.archived.archivedIds].sort()).toEqual(['p-active', 'p-arch'])
  })

  // Todo #13. ProposalDetail resolved its proposal out of the ACTIVE list, so opening
  // anything from the Archived tab rendered "Proposal not found." even though the row
  // was right there in the list you clicked it from. findProposal owns the rule in one
  // place: archived rows resolve, trashed ones deliberately do not.
  it('findProposal resolves an archived proposal', async () => {
    const c = await mount()
    expect(c.proposals.findProposal('p-arch')?.title).toBe('Archived one')
  })

  it('findProposal resolves an active proposal', async () => {
    const c = await mount()
    expect(c.proposals.findProposal('p-active')?.title).toBe('Active one')
  })

  it('findProposal does NOT resolve a trashed proposal', async () => {
    // "Proposal not found" is the intended answer for something in the Trash — that
    // signal is load-bearing when debugging (it means deleted_at is set, not an RLS
    // failure). Restoring it from the Deleted tab is what makes it reachable again.
    const c = await mount()
    expect(c.proposals.findProposal('p-del')).toBeUndefined()
  })

  it('findProposal returns undefined for an unknown id', async () => {
    const c = await mount()
    expect(c.proposals.findProposal('no-such-id')).toBeUndefined()
  })

  it('findProposal follows the row as it moves between lists', async () => {
    const c = await mount()
    // Archiving must not make an open detail page fall back to "not found"...
    await act(async () => { await c.archived.archive('p-active') })
    expect(c.proposals.findProposal('p-active')?.title).toBe('Active one')
    // ...but trashing it must.
    await act(async () => { await c.deleted.deleteProposal('p-active') })
    expect(c.proposals.findProposal('p-active')).toBeUndefined()
  })

  it('surfaces a failed write instead of moving the row', async () => {
    // A rejected mutation must leave the lists alone — an optimistic move that is
    // never rolled back is how "it looked like it worked" happened for permanent
    // delete, which silently wrote nothing for months.
    const c = await mount()
    const { supabase } = await import('../lib/supabase')
    const failing = {
      update: vi.fn(() => failing),
      eq: vi.fn(() => failing),
      then: (cb: (r: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'nope' } }).then(cb),
    } as unknown as ReturnType<typeof supabase.from>
    vi.mocked(supabase.from).mockReturnValueOnce(failing)

    await expect(
      act(async () => { await c.archived.archive('p-active') })
    ).rejects.toThrow('nope')

    expect(ids(c.proposals.proposals)).toContain('p-active')
    expect(ids(c.proposals.archivedProposals)).not.toContain('p-active')
  })
})
