import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { Proposal } from '../types/proposal'
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
    indication: row.indication ?? '',
    description: row.description ?? '',
  }
}

interface ProposalsContextValue {
  proposals: Proposal[]
  loading: boolean
  error: string | null
  createProposal: (data: Omit<Proposal, 'id' | 'createdAt'>) => Promise<string>
  updateProposal: (id: string, data: Partial<Omit<Proposal, 'id' | 'createdAt'>>) => Promise<void>
  permanentlyDelete: (id: string) => Promise<void>
}

const ProposalsContext = createContext<ProposalsContextValue | null>(null)

export function ProposalsProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth()
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Wait for session — if no session, render with empty state (pre-auth)
    if (!session) {
      setProposals([])
      setLoading(false)
      return
    }

    setLoading(true)
    supabase
      .from('proposals')
      .select('*')
      .is('deleted_at', null)
      .eq('is_archived', false)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setError(error.message)
        } else {
          setProposals((data ?? []).map(mapRow))
        }
        setLoading(false)
      })
  }, [session])

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
    setProposals((prev) => [proposal, ...prev])
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

    const { error } = await supabase.from('proposals').update(updateData).eq('id', id)

    if (error) throw new Error(error.message)
    setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
  }

  async function permanentlyDelete(id: string): Promise<void> {
    const { error } = await supabase.from('proposals').delete().eq('id', id)

    if (error) throw new Error(error.message)
    setProposals((prev) => prev.filter((p) => p.id !== id))
  }

  return (
    <ProposalsContext.Provider
      value={{
        proposals,
        loading,
        error,
        createProposal,
        updateProposal,
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
