import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useProposals } from './ProposalsContext'

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

/**
 * Thin wrapper over ProposalsContext — it owns no rows of its own. Same story as
 * ArchivedContext: this kept its own ids behind its own fetch, so a soft-deleted
 * proposal stayed in the Active list until a refresh.
 *
 * The Trash list is still role-gated, just by RLS rather than by a separate query —
 * proposals_select_deleted only returns trashed rows to admin/super_admin, so for
 * everyone else these come back empty.
 *
 * Must be rendered inside ProposalsProvider (see App.tsx).
 */
export function DeletedProvider({ children }: { children: ReactNode }) {
  const { deletedProposals, setDeleted, permanentlyDelete } = useProposals()

  const value = useMemo<DeletedContextValue>(() => {
    const dates: Record<string, string> = {}
    for (const p of deletedProposals) {
      if (p.deletedAt) dates[p.id] = p.deletedAt
    }
    return {
      deletedIds: new Set(deletedProposals.map((p) => p.id)),
      deletedAt: dates,
      deleteProposal: (id: string) => setDeleted(id, true),
      restoreFromTrash: (id: string) => setDeleted(id, false),
      // Permanent delete is one operation on one array, so purging is just the
      // hard delete. Kept on this API because ProposalsList calls it.
      purgeFromTrash: (id: string) => permanentlyDelete(id),
    }
  }, [deletedProposals, setDeleted, permanentlyDelete])

  return <DeletedContext.Provider value={value}>{children}</DeletedContext.Provider>
}

export function useDeleted() {
  const ctx = useContext(DeletedContext)
  if (!ctx) throw new Error('useDeleted must be used within DeletedProvider')
  return ctx
}
