import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Utility used by ProposalsList to show "X days remaining in trash"
export function isWithin30Days(date: Date): boolean {
  return Date.now() - date.getTime() < 30 * 86_400_000
}

interface DeletedContextValue {
  deletedIds: Set<string>
  // deletedAt: ISO timestamp strings from proposals.deleted_at column.
  // Used by UI to show "X days remaining" — replaces the old deletedMap: Map<string, Date>.
  // Convert to Date when needed: new Date(deletedAt[id])
  deletedAt: Record<string, string>
  deleteProposal: (id: string) => Promise<void>
  restoreFromTrash: (id: string) => Promise<void>
  purgeFromTrash: (id: string) => Promise<void>
}

const DeletedContext = createContext<DeletedContextValue | null>(null)

export function DeletedProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set())
  const [deletedAt, setDeletedAt] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!session) {
      setDeletedIds(new Set())
      setDeletedAt({})
      return
    }

    // Fetch proposals that are soft-deleted (deleted_at IS NOT NULL)
    // Select both id and deleted_at so UI can show "X days remaining"
    // Note: the main proposals_select RLS policy filters deleted_at IS NULL,
    // so we need the proposals_select_deleted policy (admin/super_admin only in MVP)
    supabase
      .from('proposals')
      .select('id, deleted_at')
      .not('deleted_at', 'is', null)
      .then(({ data }) => {
        const ids = new Set<string>()
        const dates: Record<string, string> = {}
        for (const row of data ?? []) {
          ids.add(row.id)
          if (row.deleted_at) dates[row.id] = row.deleted_at
        }
        setDeletedIds(ids)
        setDeletedAt(dates)
      })
  }, [session])

  async function deleteProposal(id: string): Promise<void> {
    const now = new Date().toISOString()
    const { error } = await supabase
      .from('proposals')
      .update({ deleted_at: now })
      .eq('id', id)
    if (error) throw new Error(error.message)
    // Optimistic update — add to both local state values immediately
    setDeletedIds((prev) => new Set([...prev, id]))
    setDeletedAt((prev) => ({ ...prev, [id]: now }))
  }

  async function restoreFromTrash(id: string): Promise<void> {
    const { error } = await supabase
      .from('proposals')
      .update({ deleted_at: null })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setDeletedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setDeletedAt((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  async function purgeFromTrash(id: string): Promise<void> {
    const { error } = await supabase.from('proposals').delete().eq('id', id)
    if (error) throw new Error(error.message)
    setDeletedIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    setDeletedAt((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  return (
    <DeletedContext.Provider
      value={{ deletedIds, deletedAt, deleteProposal, restoreFromTrash, purgeFromTrash }}
    >
      {children}
    </DeletedContext.Provider>
  )
}

export function useDeleted() {
  const ctx = useContext(DeletedContext)
  if (!ctx) throw new Error('useDeleted must be used within DeletedProvider')
  return ctx
}
