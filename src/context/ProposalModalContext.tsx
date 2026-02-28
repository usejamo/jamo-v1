import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { Proposal } from '../types/proposal'

interface ProposalModalContextValue {
  openModal: (proposal?: Proposal) => void
  closeModal: () => void
  isOpen: boolean
  modalProposal: Proposal | undefined
  toast: string | null
  showToast: (msg: string) => void
}

const ProposalModalContext = createContext<ProposalModalContextValue | null>(null)

export function ProposalModalProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [modalProposal, setModalProposal] = useState<Proposal | undefined>(undefined)
  const [toast, setToast] = useState<string | null>(null)

  function openModal(proposal?: Proposal) {
    setModalProposal(proposal)
    setIsOpen(true)
  }

  function closeModal() {
    setIsOpen(false)
    setModalProposal(undefined)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  return (
    <ProposalModalContext.Provider value={{ openModal, closeModal, isOpen, modalProposal, toast, showToast }}>
      {children}
    </ProposalModalContext.Provider>
  )
}

export function useProposalModal() {
  const ctx = useContext(ProposalModalContext)
  if (!ctx) throw new Error('useProposalModal must be used within ProposalModalProvider')
  return ctx
}
