import { useCallback, useReducer, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { extractInvokeErrorMessage } from '../lib/invokeError'
import { wizardReducer } from '../lib/wizardReducer'
import { DEFAULT_WIZARD_STATE } from '../types/wizard'
import type { WizardAssumption, ConfidenceLevel } from '../types/wizard'
import { generationReducer } from './useProposalGeneration'
import type { SectionState } from '../types/generation'

// ── useDemoRun (16-08, D-01/D-03) ────────────────────────────────────────────
//
// The demo driver. Everything demo-aware in the run flow lives HERE and in
// DemoRunSurface — nowhere else. That isolation is SPEC Req 6 and it is what
// makes the demo evidence about the real product: once `demo-run-start` has
// materialized the run's rows, retrieval, the editor, chat, rewrite,
// regeneration and export all execute the ordinary production code path with
// no knowledge that a demo is happening. `no-demo-branch-below-population.test.ts`
// fences that boundary.
//
// What this driver does:
//   1. Calls the deployed `demo-run-start` edge function, which server-side
//      mints ONE fresh isolated draft proposal in the demo org with its
//      sections already written `status='complete'` from the active fixture,
//      plus assumptions, an RFP document row and cloned RFP chunk embeddings.
//      Zero model calls, zero embedding calls — the phase's central invariant.
//   2. Adopts the RETURNED proposal_id into the real wizard reducer. It never
//      creates a second draft (ProposalCreationWizard's eager step-1
//      createProposal is deliberately not part of this path).
//   3. Paces the reveal: reads the already-written rows and marks them complete
//      one at a time on a fixed delay. It does NOT call the generation edge
//      function and does NOT simulate a character-by-character stream.
//
// Everything below the reveal is untouched production code.

/** Req 4 / D-02: demo runs are standard-template-only. */
export const STANDARD_TEMPLATE_ID = '00000000-0000-0000-0000-000000000001'

/**
 * D-03: fixed per-section reveal delay. Long enough to read as work happening,
 * short enough not to drag a live sales call. Real runs are far slower; the
 * presenter says so out loud.
 */
export const DEMO_SECTION_DELAY_MS = 350

export type DemoRunPhase =
  | 'idle' // pre-run: "Add demo RFP"
  | 'starting' // demo-run-start in flight
  | 'wizard' // run materialized; presenter walking the real wizard steps
  | 'populating' // paced reveal in progress
  | 'complete' // all sections revealed
  | 'error'

export interface DemoRunInfo {
  proposalId: string
  /** `demo_run_id` — the run handle the reset control (16-09) needs. */
  demoRunId: string
  fixtureId: string | null
  fixtureVersion: number | null
  templateId: string
  documentId: string | null
  sectionCount: number
  assumptionCount: number
  rfpChunkCount: number
}

interface StartResponse {
  proposal_id?: string
  demo_run_id?: string
  fixture_id?: string
  fixture_version?: number
  template_id?: string
  document_id?: string
  sections?: number
  assumptions?: number
  rfp_chunks?: number
}

interface SectionRow {
  id: string
  name: string | null
  section_name: string | null
  position: number | null
  role: string | null
  content: string | null
}

interface AssumptionRow {
  id: string
  category: string | null
  content: string | null
  confidence: string | null
}

const START_FALLBACK_ERROR = 'Could not start the demo run. Please try again.'

function toConfidence(raw: string | null): ConfidenceLevel {
  return raw === 'medium' || raw === 'low' ? raw : 'high'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface UseDemoRunOptions {
  /** Override the per-section reveal delay (tests pass 0). */
  sectionDelayMs?: number
}

export function useDemoRun(options: UseDemoRunOptions = {}) {
  const sectionDelayMs = options.sectionDelayMs ?? DEMO_SECTION_DELAY_MS

  const [phase, setPhase] = useState<DemoRunPhase>('idle')
  const [run, setRun] = useState<DemoRunInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  // The REAL wizard reducer and the REAL generation reducer — not demo copies.
  const [wizardState, wizardDispatch] = useReducer(wizardReducer, DEFAULT_WIZARD_STATE)
  const [generationState, generationDispatch] = useReducer(generationReducer, {
    isGenerating: false,
    tone: 'formal',
    consistencyAnchor: '',
    sections: {},
    completedCount: 0,
    totalCount: 0,
    creditsExhausted: false,
  })

  /** Bumped on reset so an in-flight reveal from a previous run stops. */
  const revealGeneration = useRef(0)

  const startRun = useCallback(async () => {
    if (phase === 'starting' || phase === 'populating') return
    setError(null)
    setPhase('starting')

    try {
      const { data, error: invokeError } = await supabase.functions.invoke('demo-run-start', {
        body: { template_id: STANDARD_TEMPLATE_ID },
      })

      if (invokeError) {
        // Surface the edge function's OWN message. Before the first fixture is
        // captured this is "no active demo fixture for the standard template",
        // which is the correct pre-capture answer and must read as such rather
        // than as a broken screen.
        setError(await extractInvokeErrorMessage(invokeError, START_FALLBACK_ERROR))
        setPhase('error')
        return
      }

      const payload = (data ?? {}) as StartResponse
      const proposalId = payload.proposal_id
      const demoRunId = payload.demo_run_id
      if (!proposalId || !demoRunId) {
        setError('demo-run-start returned no run. Nothing was created.')
        setPhase('error')
        return
      }

      // Fixture-materialized assumptions, read back from the rows the server
      // just wrote — the demo shows the SAME table the real flow populates.
      const { data: assumptionRows } = await supabase
        .from('proposal_assumptions')
        .select('id, category, content, confidence')
        .eq('proposal_id', proposalId)

      const assumptions: WizardAssumption[] = ((assumptionRows ?? []) as AssumptionRow[]).map(
        (a) => ({
          id: a.id,
          category: a.category ?? 'scope',
          value: a.content ?? '',
          confidence: toConfidence(a.confidence),
          source: 'Demo RFP',
          status: 'approved' as const,
        })
      )

      // Adopt the SERVER's proposal — never mint a second draft.
      wizardDispatch({ type: 'SET_PROPOSAL_ID', id: proposalId })
      wizardDispatch({ type: 'SET_ASSUMPTIONS', assumptions, missing: [] })
      wizardDispatch({ type: 'SET_DOCUMENT_COUNT', count: payload.document_id ? 1 : 0 })
      wizardDispatch({ type: 'SET_TEMPLATE', templateId: payload.template_id ?? STANDARD_TEMPLATE_ID })
      // Seeding extraction as already-complete is load-bearing, not cosmetic:
      // Step2DocumentUpload fires a LIVE `extract-assumptions` call the moment
      // its documents are parsed AND `extractionStatus === 'idle'`. The demo's
      // document row is materialized already-complete, so an idle status here
      // would spend a model call on every run and overwrite the fixture's
      // assumptions — breaking the phase's zero-model-call invariant. The fix
      // belongs in the state handed to the step, NOT in a branch inside it.
      wizardDispatch({ type: 'SET_EXTRACTION_STATUS', status: 'complete' })
      wizardDispatch({ type: 'SET_STEP', step: 1 })

      setRun({
        proposalId,
        demoRunId,
        fixtureId: payload.fixture_id ?? null,
        fixtureVersion: typeof payload.fixture_version === 'number' ? payload.fixture_version : null,
        templateId: payload.template_id ?? STANDARD_TEMPLATE_ID,
        documentId: payload.document_id ?? null,
        sectionCount: payload.sections ?? 0,
        assumptionCount: payload.assumptions ?? 0,
        rfpChunkCount: payload.rfp_chunks ?? 0,
      })
      setPhase('wizard')
    } catch (err) {
      setError(await extractInvokeErrorMessage(err, START_FALLBACK_ERROR))
      setPhase('error')
    }
  }, [phase])

  /**
   * D-03: paced reveal. The rows are ALREADY written `status='complete'` by
   * demo-run-start, so this only walks them into view on a fixed delay.
   */
  const populate = useCallback(async () => {
    const proposalId = run?.proposalId
    if (!proposalId || phase === 'populating') return

    const revealId = revealGeneration.current
    setError(null)

    const { data, error: readError } = await supabase
      .from('proposal_sections')
      .select('id, name, section_name, position, role, content')
      .eq('proposal_id', proposalId)
      .order('position', { ascending: true })

    const rows = (data ?? []) as SectionRow[]
    if (readError || rows.length === 0) {
      setError('The demo run has no sections. Nothing will be shown.')
      setPhase('error')
      return
    }

    // Req 7: never render a blank section mid-demo. demo-run-start validates
    // the fixture against the template before its first write, so this should
    // be unreachable — fail loudly rather than reveal an empty card if it is not.
    const blank = rows.filter((r) => !(r.content ?? '').trim())
    if (blank.length > 0) {
      const names = blank.map((r) => r.section_name ?? r.name ?? r.id).join(', ')
      setError(`Demo run aborted: empty section content for ${names}.`)
      setPhase('error')
      return
    }

    const sections: SectionState[] = rows.map((r) => ({
      id: r.id,
      name: r.section_name ?? r.name ?? 'Section',
      position: r.position ?? 0,
      role: r.role,
      status: 'pending',
      liveText: '',
      finalContent: null,
      error: null,
    }))

    generationDispatch({ type: 'START_GENERATION', sections })
    setPhase('populating')

    for (const row of rows) {
      await sleep(sectionDelayMs)
      if (revealGeneration.current !== revealId) return // reset mid-reveal
      generationDispatch({
        type: 'SECTION_COMPLETE',
        sectionId: row.id,
        content: row.content ?? '',
      })
    }

    generationDispatch({ type: 'GENERATION_COMPLETE' })
    setPhase('complete')
  }, [run, phase, sectionDelayMs])

  /**
   * Return the surface to the "Add demo RFP" start entirely in-session — no
   * page reload. Local state only; the row-deleting `demo-reset` call is wired
   * by the reset control in 16-09, which calls this after the server confirms.
   */
  const reset = useCallback(() => {
    revealGeneration.current += 1
    wizardDispatch({ type: 'RESET' })
    generationDispatch({ type: 'RESET' })
    setRun(null)
    setError(null)
    setPhase('idle')
  }, [])

  return {
    phase,
    run,
    error,
    wizardState,
    wizardDispatch,
    generationState,
    startRun,
    populate,
    reset,
    sectionDelayMs,
  }
}
