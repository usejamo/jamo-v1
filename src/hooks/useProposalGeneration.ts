import { useReducer, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  GenerationState,
  GenerationAction,
  ToneOption,
  WaveNumber,
  GenerateSectionPayload,
  AnchorPayload,
  SECTION_NAMES,
  TOTAL_SECTIONS,
  getWaveSections,
  createInitialSections,
} from '../types/generation'

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: GenerationState = {
  isGenerating: false,
  currentWave: null,
  tone: 'formal',
  consistencyAnchor: '',
  sections: createInitialSections(),
  completedCount: 0,
  totalCount: TOTAL_SECTIONS,
}

export function generationReducer(
  state: GenerationState,
  action: GenerationAction
): GenerationState {
  switch (action.type) {
    case 'SET_TONE':
      return { ...state, tone: action.tone }

    case 'START_GENERATION':
      return {
        ...state,
        isGenerating: true,
        currentWave: 1,
        completedCount: 0,
        sections: createInitialSections(),
      }

    case 'SECTION_GENERATING':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.sectionKey]: {
            ...state.sections[action.sectionKey],
            status: 'generating',
            liveText: '',
          },
        },
      }

    case 'SECTION_TOKEN':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.sectionKey]: {
            ...state.sections[action.sectionKey],
            liveText: state.sections[action.sectionKey].liveText + action.token,
          },
        },
      }

    case 'SECTION_COMPLETE':
      return {
        ...state,
        completedCount: state.completedCount + 1,
        sections: {
          ...state.sections,
          [action.sectionKey]: {
            ...state.sections[action.sectionKey],
            status: 'complete',
            finalContent: action.content,
          },
        },
      }

    case 'SECTION_ERROR':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.sectionKey]: {
            ...state.sections[action.sectionKey],
            status: 'error',
            error: action.error,
          },
        },
      }

    case 'SET_ANCHOR':
      return { ...state, consistencyAnchor: action.anchor }

    case 'WAVE_COMPLETE':
      return {
        ...state,
        currentWave: action.wave < 3 ? ((action.wave + 1) as WaveNumber) : state.currentWave,
      }

    case 'GENERATION_COMPLETE':
      return { ...state, isGenerating: false, currentWave: null }

    case 'RESET':
      return { ...initialState, sections: createInitialSections() }

    default:
      return state
  }
}

// ---------------------------------------------------------------------------
// SSE stream reader
// ---------------------------------------------------------------------------

export async function readSSEStream(
  response: Response,
  onToken: (token: string) => void
): Promise<void> {
  if (!response.body) return

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    // Keep the last (possibly incomplete) line in buffer
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const raw = line.slice(6).trim()
      if (raw === '[DONE]') return
      try {
        const parsed = JSON.parse(raw)
        if (
          parsed.type === 'content_block_delta' &&
          parsed.delta?.type === 'text_delta' &&
          typeof parsed.delta?.text === 'string'
        ) {
          onToken(parsed.delta.text)
        }
      } catch {
        // Ignore malformed SSE lines
      }
    }
  }
}

// ---------------------------------------------------------------------------
// RAG helper
// ---------------------------------------------------------------------------

export async function fetchRagChunks(
  orgId: string,
  sectionKey: string,
  therapeuticArea: string
): Promise<Array<{ content: string; doc_type: string; agency: string }>> {
  try {
    const query = SECTION_NAMES[sectionKey] || sectionKey
    const { data, error } = await supabase.functions.invoke('retrieve-context', {
      body: { orgId, query, therapeuticArea },
    })
    if (error) {
      console.warn('[useProposalGeneration] retrieve-context error:', error)
      return []
    }
    const regulatory: Array<{ content: string; doc_type: string; agency: string }> = data?.regulatoryChunks ?? []
    const proposal: Array<{ content: string; doc_type: string; agency: string }> = data?.proposalChunks ?? []
    return [...regulatory, ...proposal]
  } catch (err) {
    console.warn('[useProposalGeneration] fetchRagChunks failed:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Assumptions helper
// ---------------------------------------------------------------------------

async function fetchAssumptions(
  proposalId: string
): Promise<Array<{ category: string; value: string; confidence: string }>> {
  const { data, error } = await supabase
    .from('proposal_assumptions')
    .select('category, content, confidence')
    .eq('proposal_id', proposalId)
    .eq('status', 'approved')
  if (error || !data) return []
  return data.map((row: any) => ({
    category: row.category,
    value: row.content,
    confidence: row.confidence,
  }))
}

// ---------------------------------------------------------------------------
// Anchor extraction
// ---------------------------------------------------------------------------

export async function extractAnchor(
  text: string,
  session: { access_token: string }
): Promise<string> {
  try {
    const resp = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-proposal-section`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ _anchorMode: true, text } as AnchorPayload),
      }
    )
    const data = await resp.json()
    return data.anchor ?? ''
  } catch (err) {
    console.warn('[useProposalGeneration] extractAnchor failed:', err)
    return ''
  }
}

// ---------------------------------------------------------------------------
// Main hook
// ---------------------------------------------------------------------------

export function useProposalGeneration(proposalId: string) {
  const [state, dispatch] = useReducer(generationReducer, initialState)
  const { session, profile } = useAuth()

  // Hydrate completed sections from DB on mount (so navigating back restores progress)
  useEffect(() => {
    if (!proposalId) return
    supabase
      .from('proposal_sections')
      .select('section_key, content, status')
      .eq('proposal_id', proposalId)
      .eq('status', 'complete')
      .then(({ data }) => {
        if (!data || data.length === 0) return
        for (const row of data) {
          if (row.section_key && row.content) {
            dispatch({ type: 'SECTION_COMPLETE', sectionKey: row.section_key, content: row.content })
          }
        }
      })
  }, [proposalId])

  // Supabase Realtime subscription for proposal_sections changes (REQ-4.6)
  useEffect(() => {
    if (!proposalId) return
    const channel = supabase
      .channel(`proposal-sections-${proposalId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'proposal_sections',
          filter: `proposal_id=eq.${proposalId}`,
        },
        (payload: any) => {
          const section = payload.new
          if (section?.status === 'complete' && section?.content) {
            dispatch({
              type: 'SECTION_COMPLETE',
              sectionKey: section.section_key,
              content: section.content,
            })
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [proposalId])

  // streamSection: fire one section generation, read SSE, dispatch tokens
  const streamSection = useCallback(
    async (
      sectionKey: string,
      proposalInput: GenerateSectionPayload['proposalInput'],
      ragChunks: GenerateSectionPayload['ragChunks'],
      anchor: string
    ): Promise<string> => {
      dispatch({ type: 'SECTION_GENERATING', sectionKey })

      // Optimistic status update in DB
      if (session) {
        await supabase.from('proposal_sections').upsert(
          {
            proposal_id: proposalId,
            org_id: profile?.org_id,
            section_key: sectionKey,
            section_name: SECTION_NAMES[sectionKey],
            status: 'generating',
          },
          { onConflict: 'proposal_id,section_key' }
        )
      }

      const payload: GenerateSectionPayload = {
        proposalId,
        sectionId: sectionKey,
        proposalInput,
        ragChunks,
        consistencyAnchor: anchor,
        tone: state.tone,
      }

      let response: Response
      try {
        response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-proposal-section`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
            body: JSON.stringify(payload),
          }
        )
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        dispatch({ type: 'SECTION_ERROR', sectionKey, error: errMsg })
        return ''
      }

      if (!response.ok || !response.body) {
        const errText = await response.text()
        dispatch({ type: 'SECTION_ERROR', sectionKey, error: errText })
        return ''
      }

      let fullText = ''
      await readSSEStream(response, (token) => {
        fullText += token
        dispatch({ type: 'SECTION_TOKEN', sectionKey, token })
      })

      // Fallback: if Realtime hasn't confirmed within 10s, dispatch complete from local text
      setTimeout(() => {
        dispatch({ type: 'SECTION_COMPLETE', sectionKey, content: fullText })
      }, 10000)

      return fullText
    },
    [proposalId, session, state.tone]
  )

  // generateAll: three-wave orchestration per D-01/D-02 (REQ-4.2)
  const generateAll = useCallback(
    async (proposalInput: GenerateSectionPayload['proposalInput']) => {
      dispatch({ type: 'START_GENERATION' })

      try {
        // Fetch approved assumptions for enriched input
        const assumptions = await fetchAssumptions(proposalId)
        const enrichedInput = { ...proposalInput, assumptions }

        // Wave 1: Understanding (serial)
        const wave1Keys = getWaveSections(1)  // ['understanding']
        const ragChunks1 = await fetchRagChunks(
          profile?.org_id ?? '',
          wave1Keys[0],
          proposalInput.studyInfo.therapeuticArea
        )
        const wave1Text = await streamSection(wave1Keys[0], enrichedInput, ragChunks1, '')

        // Extract anchor after Wave 1 (REQ-4.3)
        const anchor1 = await extractAnchor(wave1Text, session!)
        dispatch({ type: 'SET_ANCHOR', anchor: anchor1 })
        dispatch({ type: 'WAVE_COMPLETE', wave: 1 })

        // Wave 2: Body sections in parallel (REQ-4.2, D-02)
        const wave2Keys = getWaveSections(2)
        const wave2Results = await Promise.all(
          wave2Keys.map(async (key) => {
            const ragChunks = await fetchRagChunks(
              proposalId,
              key,
              proposalInput.studyInfo.therapeuticArea
            )
            return streamSection(key, enrichedInput, ragChunks, anchor1)
          })
        )
        dispatch({ type: 'WAVE_COMPLETE', wave: 2 })

        // Extract full anchor after Wave 2 (REQ-4.3)
        const allText = [wave1Text, ...wave2Results].join('\n\n')
        const fullAnchor = await extractAnchor(allText, session!)
        dispatch({ type: 'SET_ANCHOR', anchor: fullAnchor })

        // Wave 3: Summary sections (serial)
        const wave3Keys = getWaveSections(3)
        for (const key of wave3Keys) {
          const ragChunks = await fetchRagChunks(
            proposalId,
            key,
            proposalInput.studyInfo.therapeuticArea
          )
          await streamSection(key, enrichedInput, ragChunks, fullAnchor)
        }
        dispatch({ type: 'WAVE_COMPLETE', wave: 3 })
        dispatch({ type: 'GENERATION_COMPLETE' })
      } catch (err) {
        console.error('[useProposalGeneration] generateAll error:', err)
        dispatch({ type: 'GENERATION_COMPLETE' })
      }
    },
    [proposalId, session, profile, streamSection]
  )

  // generateSection: single section independently (REQ-4.7)
  const generateSection = useCallback(
    async (
      sectionKey: string,
      proposalInput: GenerateSectionPayload['proposalInput']
    ): Promise<string> => {
      const ragChunks = await fetchRagChunks(
        proposalId,
        sectionKey,
        proposalInput.studyInfo.therapeuticArea
      )
      return streamSection(sectionKey, proposalInput, ragChunks, state.consistencyAnchor)
    },
    [proposalId, streamSection, state.consistencyAnchor]
  )

  // regenerateSection: reset + generate (REQ-4.7)
  const regenerateSection = useCallback(
    async (
      sectionKey: string,
      proposalInput: GenerateSectionPayload['proposalInput']
    ): Promise<string> => {
      dispatch({ type: 'SECTION_GENERATING', sectionKey })
      return generateSection(sectionKey, proposalInput)
    },
    [generateSection]
  )

  return { state, dispatch, generateAll, generateSection, regenerateSection }
}
