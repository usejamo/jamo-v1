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
  const { isLoopRunning } = generation

  // The binding, readable synchronously. `activeProposalId` is React state, so within the
  // tick claimGeneration runs it still holds the PREVIOUS value; this is the one
  // claimGeneration itself compares against. claimGeneration is the ONLY writer of
  // activeProposalId, so keeping the ref in step there (rather than during render) is
  // sufficient and cannot regress on a re-render that carries older state.
  const activeProposalIdRef = useRef<string | null>(null)

  // Mirrors the loop's OWN synchronous guard, not state.isGenerating. The reducer flag
  // only flips two awaited round-trips into generateAll/resumeGeneration, and during that
  // window the loop is genuinely live — reading state.isGenerating here reported "nobody
  // is generating" and let another proposal take the binding out from under a running
  // loop. This value is still render-derived (it is exposed to consumers as a render
  // value); the authority for a refusal is the isLoopRunning() call inside claimGeneration.
  const generatingIdRef = useRef<string | null>(null)
  const loopRunning = isLoopRunning()
  if (loopRunning && activeProposalId) {
    generatingIdRef.current = activeProposalId
  } else if (!loopRunning) {
    generatingIdRef.current = null
  }

  const claimGeneration = useCallback(
    (proposalId: string) => {
      // Refuse from the instant the loop starts, not from the instant the reducer
      // notices. Both operands are read synchronously at call time so the answer cannot
      // be stale by a render.
      const busyWith = isLoopRunning() ? activeProposalIdRef.current : null
      if (busyWith && busyWith !== proposalId) return false
      activeProposalIdRef.current = proposalId
      setActiveProposalId(prev => (prev === proposalId ? prev : proposalId))
      return true
    },
    [isLoopRunning]
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
