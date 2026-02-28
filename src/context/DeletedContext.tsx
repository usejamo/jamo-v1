import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

export function isWithin30Days(date: Date): boolean {
  return Date.now() - date.getTime() < 30 * 86_400_000
}

interface DeletedContextValue {
  deletedMap: Map<string, Date>
  deletedIds: Set<string>
  deleteProposal: (id: string) => void
  restoreFromTrash: (id: string) => void
  purgeFromTrash: (id: string) => void
}

const DeletedContext = createContext<DeletedContextValue | null>(null)

export function DeletedProvider({ children }: { children: ReactNode }) {
  const [deletedMap, setDeletedMap] = useState<Map<string, Date>>(new Map())

  const deletedIds = new Set(deletedMap.keys())

  function deleteProposal(id: string) {
    setDeletedMap(prev => new Map([...prev, [id, new Date()]]))
  }

  function restoreFromTrash(id: string) {
    setDeletedMap(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  function purgeFromTrash(id: string) {
    setDeletedMap(prev => {
      const next = new Map(prev)
      next.delete(id)
      return next
    })
  }

  return (
    <DeletedContext.Provider value={{ deletedMap, deletedIds, deleteProposal, restoreFromTrash, purgeFromTrash }}>
      {children}
    </DeletedContext.Provider>
  )
}

export function useDeleted() {
  const ctx = useContext(DeletedContext)
  if (!ctx) throw new Error('useDeleted must be used within DeletedProvider')
  return ctx
}
