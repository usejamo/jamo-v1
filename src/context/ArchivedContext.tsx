import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

interface ArchivedContextValue {
  archivedIds: Set<string>
  archive: (id: string) => Promise<void>
  restore: (id: string) => Promise<void>
}

const ArchivedContext = createContext<ArchivedContextValue | null>(null)

export function ArchivedProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  const [archivedIds, setArchivedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!session) {
      setArchivedIds(new Set())
      return
    }

    supabase
      .from('proposals')
      .select('id')
      .eq('is_archived', true)
      .is('deleted_at', null)
      .then(({ data }) => {
        setArchivedIds(new Set((data ?? []).map((r) => r.id)))
      })
  }, [session])

  async function archive(id: string): Promise<void> {
    const { error } = await supabase
      .from('proposals')
      .update({ is_archived: true })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setArchivedIds((prev) => new Set([...prev, id]))
  }

  async function restore(id: string): Promise<void> {
    const { error } = await supabase
      .from('proposals')
      .update({ is_archived: false })
      .eq('id', id)
    if (error) throw new Error(error.message)
    setArchivedIds((prev) => {
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
