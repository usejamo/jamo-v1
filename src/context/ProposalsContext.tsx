import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { Proposal, ProposalStatus } from '../types/proposal'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Helper: map DB row (snake_case) to frontend Proposal type (camelCase)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(row: Record<string, any>): Proposal {
  return {
    id: row.id,
    title: row.title,
    client: row.client_name ?? '',
    studyType: row.study_type ?? '',
    therapeuticArea: row.therapeutic_area ?? '',
    status: row.status,
    dueDate: row.due_date ?? '',
    value: row.estimated_value ?? 0,
    createdAt: row.created_at?.slice(0, 10) ?? '',
    updatedAt: row.updated_at ?? row.created_at ?? '',
    indication: row.indication ?? '',
    description: row.description ?? '',
    geography: row.geography ?? [],
    selected_template_id: row.selected_template_id ?? null,
    // 14.7-05: reference_override column authored in Plan 01, live after Plan 06 deploy.
    // ?? null keeps mapRow safe against the pre-deploy DB (column absent -> undefined -> null).
    reference_override: row.reference_override ?? null,
    isArchived: row.is_archived === true,
    deletedAt: row.deleted_at ?? null,
  }
}

// The three lists are derived from one array, so a row can never be in two of them and
// can never be missing from all three. Order matters: deleted_at wins over is_archived,
// because the Active and Archived queries both required deleted_at IS NULL. A trashed
// proposal belongs in Trash whatever its archive flag says.
function isDeleted(p: Proposal): boolean {
  return p.deletedAt != null
}

function isArchivedLive(p: Proposal): boolean {
  return p.isArchived === true && !isDeleted(p)
}

function isActive(p: Proposal): boolean {
  return !isDeleted(p) && p.isArchived !== true
}

interface ProposalsContextValue {
  /** Active list: not archived, not in Trash. */
  proposals: Proposal[]
  /** Archived and not in Trash. */
  archivedProposals: Proposal[]
  /** In Trash. Empty for roles that proposals_select_deleted does not cover. */
  deletedProposals: Proposal[]
  loading: boolean
  error: string | null
  /** Re-load the proposal list from the DB. Needed after a proposal is created
   *  server-side (e.g. the demo-run-start edge function), which the context's
   *  login-time fetch and createProposal optimistic insert never see. */
  refetch: () => Promise<void>
  createProposal: (data: Omit<Proposal, 'id' | 'createdAt'>) => Promise<string>
  updateProposal: (id: string, data: Partial<Omit<Proposal, 'id' | 'createdAt'>>) => Promise<void>
  updateStatus: (id: string, status: ProposalStatus) => Promise<void>
  /** Archive / unarchive. Backs ArchivedContext's archive() and restore(). */
  setArchived: (id: string, archived: boolean) => Promise<void>
  /** Move to Trash / restore from Trash. Backs DeletedContext. */
  setDeleted: (id: string, deleted: boolean) => Promise<void>
  permanentlyDelete: (id: string) => Promise<void>
}

const ProposalsContext = createContext<ProposalsContextValue | null>(null)

export function ProposalsProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  // Every proposal the user is allowed to see, in every lifecycle state. This is the
  // only source of truth for the three lists; nothing else fetches them. RLS does the
  // scoping: proposals_select returns the live rows and proposals_select_deleted adds
  // the trashed ones for admin/super_admin, so one select('*') is correctly filtered
  // per role without a client-side org predicate.
  const [allProposals, setAllProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadProposals = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('proposals')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setError(error.message)
    } else {
      setAllProposals((data ?? []).map(mapRow))
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    // Wait for session — if no session, render with empty state (pre-auth)
    if (!session) {
      setAllProposals([])
      setLoading(false)
      return
    }
    void loadProposals()
  }, [session, loadProposals])

  const proposals = useMemo(() => allProposals.filter(isActive), [allProposals])
  const archivedProposals = useMemo(() => allProposals.filter(isArchivedLive), [allProposals])
  const deletedProposals = useMemo(() => allProposals.filter(isDeleted), [allProposals])

  // One helper for every lifecycle write: persist first, then patch the single array.
  // Persisting first means a rejected write leaves all three lists untouched rather
  // than optimistically moving a row that never moved in the database — which is the
  // failure mode that hid the missing DELETE policy for months.
  const patchRow = useCallback(
    async (id: string, column: Record<string, unknown>, patch: Partial<Proposal>) => {
      const { error } = await supabase.from('proposals').update(column).eq('id', id)
      if (error) throw new Error(error.message)
      setAllProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    },
    []
  )

  const setArchived = useCallback(
    (id: string, archived: boolean) =>
      patchRow(id, { is_archived: archived }, { isArchived: archived }),
    [patchRow]
  )

  const setDeleted = useCallback(
    (id: string, deleted: boolean) => {
      const deletedAt = deleted ? new Date().toISOString() : null
      return patchRow(id, { deleted_at: deletedAt }, { deletedAt })
    },
    [patchRow]
  )

  async function createProposal(data: Omit<Proposal, 'id' | 'createdAt'>): Promise<string> {
    if (!profile) throw new Error('No user profile — cannot create proposal')

    const insertData = {
      org_id: profile.org_id,
      created_by: profile.id,
      title: data.title,
      status: data.status,
      client_name: data.client,
      study_type: data.studyType,
      therapeutic_area: data.therapeuticArea,
      indication: data.indication,
      description: data.description,
      geography: data.geography ?? null,
      due_date: data.dueDate || null,
      estimated_value: data.value || null,
    }

    const { data: row, error } = await supabase
      .from('proposals')
      .insert(insertData)
      .select()
      .single()

    if (error) throw new Error(error.message)
    const proposal = mapRow(row)
    setAllProposals((prev) => [proposal, ...prev])
    return proposal.id
  }

  async function updateProposal(
    id: string,
    data: Partial<Omit<Proposal, 'id' | 'createdAt'>>
  ): Promise<void> {
    const updateData: Record<string, unknown> = {}
    if (data.title !== undefined) updateData.title = data.title
    if (data.client !== undefined) updateData.client_name = data.client
    if (data.studyType !== undefined) updateData.study_type = data.studyType
    if (data.therapeuticArea !== undefined) updateData.therapeutic_area = data.therapeuticArea
    if (data.status !== undefined) updateData.status = data.status
    if (data.dueDate !== undefined) updateData.due_date = data.dueDate
    if (data.value !== undefined) updateData.estimated_value = data.value
    if (data.indication !== undefined) updateData.indication = data.indication
    if (data.description !== undefined) updateData.description = data.description
    if (data.geography !== undefined) updateData.geography = data.geography

    const { error } = await supabase.from('proposals').update(updateData).eq('id', id)

    if (error) throw new Error(error.message)
    setAllProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
  }

  async function updateStatus(id: string, status: ProposalStatus): Promise<void> {
    return updateProposal(id, { status })
  }

  // useCallback because DeletedContext memoises its value on this identity.
  const permanentlyDelete = useCallback(async (id: string): Promise<void> => {
    // Requires the proposals_delete RLS policy (20260912000001). Without it this
    // matched zero rows and returned no error, so the row silently survived.
    const { error } = await supabase.from('proposals').delete().eq('id', id)

    if (error) throw new Error(error.message)
    setAllProposals((prev) => prev.filter((p) => p.id !== id))
  }, [])

  return (
    <ProposalsContext.Provider
      value={{
        proposals,
        archivedProposals,
        deletedProposals,
        loading,
        error,
        refetch: loadProposals,
        createProposal,
        updateProposal,
        updateStatus,
        setArchived,
        setDeleted,
        permanentlyDelete,
      }}
    >
      {children}
    </ProposalsContext.Provider>
  )
}

export function useProposals() {
  const ctx = useContext(ProposalsContext)
  if (!ctx) throw new Error('useProposals must be used within ProposalsProvider')
  return ctx
}
