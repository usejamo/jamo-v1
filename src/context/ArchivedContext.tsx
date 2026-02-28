import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface ArchivedContextValue {
  archivedIds: Set<string>
  archive: (id: string) => void
  restore: (id: string) => void
}

const ArchivedContext = createContext<ArchivedContextValue | null>(null)

export function ArchivedProvider({ children }: { children: ReactNode }) {
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())

  function archive(id: string) {
    setArchivedIds(prev => new Set([...prev, id]))
  }

  function restore(id: string) {
    setArchivedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <ArchivedContext.Provider value={{ archivedIds, archive, restore }}>
      {children}
    </ArchivedContext.Provider>
  )
}

export function useArchived() {
  const ctx = useContext(ArchivedContext)
  if (!ctx) throw new Error('useArchived must be used within ArchivedProvider')
  return ctx
}
