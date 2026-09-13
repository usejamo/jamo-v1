import { createContext, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import { useProposals } from './ProposalsContext'

interface ArchivedContextValue {
  archivedIds: Set<string>
  archive: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
}

const ArchivedContext = createContext<ArchivedContextValue | null>(null)

/**
 * Thin wrapper over ProposalsContext — it owns no rows of its own.
 *
 * This used to keep its own `archivedIds` Set behind its own fetch, and archive()
 * updated only that Set. Nothing told ProposalsContext to drop the row, so an archived
 * proposal stayed in the Active list while also showing up under Archived, and a page
 * refresh was the only way to make the two agree. Deriving the Set from the one array
 * means it cannot drift: there is nothing left to forget to invalidate.
 *
 * Kept as a context rather than deleted outright because Dashboard and ProposalsList
 * consume this API; it is now just a different view of the same state. Must be rendered
 * inside ProposalsProvider (see App.tsx).
 */
export function ArchivedProvider({ children }: { children: ReactNode }) {
  const { archivedProposals, setArchived } = useProposals()

  const value = useMemo<ArchivedContextValue>(
    () => ({
      archivedIds: new Set(archivedProposals.map((p) => p.id)),
      archive: (id: string) => setArchived(id, true),
      restore: (id: string) => setArchived(id, false),
    }),
    [archivedProposals, setArchived]
  )

  return <ArchivedContext.Provider value={value}>{children}</ArchivedContext.Provider>
}

export function useArchived() {
  const ctx = useContext(ArchivedContext)
  if (!ctx) throw new Error('useArchived must be used within ArchivedProvider')
  return ctx
}
