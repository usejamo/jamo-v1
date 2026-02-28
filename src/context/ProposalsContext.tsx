import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import rawProposals from '../data/proposals.json'
import type { Proposal } from '../types/proposal'

interface ProposalsContextValue {
  proposals: Proposal[]
  createProposal: (data: Omit<Proposal, 'id' | 'createdAt'>) => string
  updateProposal: (id: string, data: Partial<Omit<Proposal, 'id' | 'createdAt'>>) => void
  permanentlyDelete: (id: string) => void
}

const ProposalsContext = createContext<ProposalsContextValue | null>(null)

export function ProposalsProvider({ children }: { children: ReactNode }) {
  const [proposals, setProposals] = useState<Proposal[]>(rawProposals as Proposal[])

  function createProposal(data: Omit<Proposal, 'id' | 'createdAt'>): string {
    const id = 'prop-' + Date.now()
    const createdAt = new Date().toISOString().slice(0, 10)
    const newProposal: Proposal = { ...data, id, createdAt }
    setProposals(prev => [newProposal, ...prev])
    return id
  }

  function updateProposal(id: string, data: Partial<Omit<Proposal, 'id' | 'createdAt'>>) {
    setProposals(prev => prev.map(p => p.id === id ? { ...p, ...data } : p))
  }

  function permanentlyDelete(id: string) {
    setProposals(prev => prev.filter(p => p.id !== id))
  }

  return (
    <ProposalsContext.Provider value={{ proposals, createProposal, updateProposal, permanentlyDelete }}>
      {children}
    </ProposalsContext.Provider>
  )
}

export function useProposals() {
  const ctx = useContext(ProposalsContext)
  if (!ctx) throw new Error('useProposals must be used within ProposalsProvider')
  return ctx
}
