import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

interface SidebarContextValue {
  sidebarNode: ReactNode
  setSidebarNode: (node: ReactNode) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarNode, setSidebarNode] = useState<ReactNode>(null)
  return (
    <SidebarContext.Provider value={{ sidebarNode, setSidebarNode }}>
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  const ctx = useContext(SidebarContext)
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider')
  return ctx
}
