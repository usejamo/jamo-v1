import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'
import { useProposalGeneration } from '../hooks/useProposalGeneration'

interface GenerationContextValue {
  /** The proposal the single hook instance is currently bound to. */
  activeProposalId: string | null
  /** The proposal with a loop actually running, if any. */
  generatingProposalId: string | null
  /** Bind the hook to a proposal. Returns false if another proposal is mid-generation. */
  claimGeneration: (proposalId: string) => boolean
  generation: ReturnType<typeof useProposalGeneration>
}

const GenerationContext = createContext<GenerationContextValue | null>(null)

/**
 * Holds exactly one useProposalGeneration instance, above the routes.
 *
 * This is NOT what keeps generation alive across navigation — the loop is a plain
 * async closure and already survives unmount on its own. The provider exists for:
 *
 *   1. UI continuity. The reducer state survives, so returning to the page shows
 *      live progress instead of a stale "Generated".
 *   2. ONE re-entrancy guard. isGeneratingRef lives inside the hook instance. If the
 *      hook remounted per page visit, returning mid-generation and pressing Resume
 *      would create a fresh guard and start a SECOND concurrent loop writing the same
 *      sections. Keeping one instance alive is what makes Resume safe.
 */
export function GenerationProvider({ children }: { children: ReactNode }) {
  const [activeProposalId, setActiveProposalId] = useState<string | null>(null)
  const generation = useProposalGeneration(activeProposalId ?? '')

  // Mirrors isGenerating without making claimGeneration depend on render timing.
  const generatingIdRef = useRef<string | null>(null)
  if (generation.state.isGenerating && activeProposalId) {
    generatingIdRef.current = activeProposalId
  } else if (!generation.state.isGenerating) {
    generatingIdRef.current = null
  }

  const claimGeneration = useCallback(
    (proposalId: string) => {
      const busyWith = generatingIdRef.current
      if (busyWith && busyWith !== proposalId) return false
      setActiveProposalId(prev => (prev === proposalId ? prev : proposalId))
      return true
    },
    []
  )

  return (
    <GenerationContext.Provider
      value={{
        activeProposalId,
        generatingProposalId: generatingIdRef.current,
        claimGeneration,
        generation,
      }}
    >
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext)
  if (!ctx) throw new Error('useGeneration must be used within a GenerationProvider')
  return ctx
}
