import { useReducer, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  GenerationState,
  GenerationAction,
  SectionState,
  SectionStatus,
  ToneOption,
  GenerateSectionPayloadV2,
  AnchorPayload,
} from '../types/generation'

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

const initialState: GenerationState = {
  isGenerating: false,
  tone: 'formal',
  consistencyAnchor: '',
  sections: {},
  completedCount: 0,
  totalCount: 0,
}

export function generationReducer(
  state: GenerationState,
  action: GenerationAction
): GenerationState {
  switch (action.type) {
    case 'SET_TONE':
      return { ...state, tone: action.tone }

    case 'START_GENERATION': {
      const sections = action.sections.reduce<Record<string, SectionState>>(
        (acc, s) => ({ ...acc, [s.id]: s }),
        {}
      )
      return {
        ...state,
        isGenerating: true,
        completedCount: 0,
        totalCount: action.sections.length,
        sections,
      }
    }

    case 'SECTION_GENERATING':
      return {
        ...state,
        sections: {
          ...state.sections,
          [action.sectionId]: {
            ...state.sections[action.sectionId],
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
          [action.sectionId]: {
            ...state.sections[action.sectionId],
            liveText: (state.sections[action.sectionId]?.liveText ?? '') + action.token,
          },
        },
      }

    case 'SECTION_COMPLETE':
      return {
        ...state,
        completedCount: state.completedCount + 1,
        sections: {
          ...state.sections,
          [action.sectionId]: {
            ...state.sections[action.sectionId],
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
          [action.sectionId]: {
            ...state.sections[action.sectionId],
            status: 'error',
            error: action.error,
          },
        },
      }

    case 'SET_ANCHOR':
      return { ...state, consistencyAnchor: action.anchor }

    case 'GENERATION_COMPLETE':
      return { ...state, isGenerating: false }

    case 'RESET':
      return { ...initialState, sections: {}, totalCount: 0 }

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
  sectionName: string,
  therapeuticArea: string
): Promise<Array<{ content: string; doc_type: string; agency: string }>> {
  try {
    const query = sectionName
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

  // Hydrate all sections from DB on mount (builds nav, restores completed state)
  useEffect(() => {
    if (!proposalId) return
    supabase
      .from('proposal_sections')
      .select('id, content, status, name, position, role, section_key')
      .eq('proposal_id', proposalId)
      .order('position', { ascending: true })
      .then(({ data }) => {
        if (!data || data.length === 0) return
        const sections: SectionState[] = data.map((row: any) => ({
          id: row.id,
          name: row.name ?? row.section_key ?? 'Section',
          position: row.position ?? 99,
          role: row.role ?? null,
          status: (
            row.status === 'complete' ? 'complete' :
            row.status === 'generating' ? 'generating' : 'pending'
          ) as SectionStatus,
          liveText: '',
          finalContent: row.status === 'complete' ? (row.content ?? null) : null,
          error: null,
        }))
        dispatch({ type: 'START_GENERATION', sections })
        // After building nav, mark as not generating (hydration only)
        dispatch({ type: 'GENERATION_COMPLETE' })
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
              sectionId: section.id,
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
      section: SectionState,
      sectionDescription: string | null,
      priorSections: Array<{ id: string; name: string; content: string }>,
      anchor: string,
      proposalContext: GenerateSectionPayloadV2['proposalContext'],
      ragChunks: GenerateSectionPayloadV2['ragChunks'],
      debug?: boolean
    ): Promise<string> => {
      dispatch({ type: 'SECTION_GENERATING', sectionId: section.id })

      // Optimistic status update in DB
      await supabase
        .from('proposal_sections')
        .update({ status: 'generating' })
        .eq('id', section.id)

      const payload: GenerateSectionPayloadV2 = {
        version: 2,
        proposalId,
        sectionId: section.id,
        sectionName: section.name,
        sectionDescription,
        sectionRole: section.role,
        priorSections,
        proposalContext,
        ragChunks,
        tone: state.tone,
        consistencyAnchor: anchor,
        debug,
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
        dispatch({ type: 'SECTION_ERROR', sectionId: section.id, error: errMsg })
        return ''
      }

      if (!response.ok || !response.body) {
        const errText = await response.text()
        dispatch({ type: 'SECTION_ERROR', sectionId: section.id, error: errText })
        return ''
      }

      let fullText = ''
      await readSSEStream(response, (token) => {
        fullText += token
        dispatch({ type: 'SECTION_TOKEN', sectionId: section.id, token })
      })

      // Fallback: if Realtime hasn't confirmed within 10s, dispatch complete from local text
      setTimeout(() => {
        dispatch({ type: 'SECTION_COMPLETE', sectionId: section.id, content: fullText })
      }, 10000)

      return fullText
    },
    [proposalId, session, state.tone]
  )

  // generateAll: position-ordered sequential loop (replaces wave-based orchestration)
  const generateAll = useCallback(
    async (
      proposalContext: GenerateSectionPayloadV2['proposalContext'],
      debug?: boolean
    ) => {
      try {
        // Fetch approved assumptions for enriched context
        const assumptions = await fetchAssumptions(proposalId)
        const enrichedContext: GenerateSectionPayloadV2['proposalContext'] = {
          ...proposalContext,
          assumptions,
        }

        // Fetch sections ordered by position
        const { data: sectionRows } = await supabase
          .from('proposal_sections')
          .select('id, name, description, position, role, status, section_key')
          .eq('proposal_id', proposalId)
          .order('position', { ascending: true })

        if (!sectionRows || sectionRows.length === 0) {
          console.error('[useProposalGeneration] No sections found for proposal')
          dispatch({ type: 'GENERATION_COMPLETE' })
          return
        }

        const sections: SectionState[] = sectionRows.map((row: any) => ({
          id: row.id,
          name: row.name ?? row.section_key ?? 'Section',
          position: row.position ?? 99,
          role: row.role ?? null,
          status: 'pending' as SectionStatus,
          liveText: '',
          finalContent: null,
          error: null,
        }))
        dispatch({ type: 'START_GENERATION', sections })

        const completedSections: Array<{ id: string; name: string; content: string }> = []
        let anchor = ''

        for (const section of sections) {
          const ragChunks = await fetchRagChunks(
            profile?.org_id ?? '',
            section.name,
            enrichedContext.studyInfo.therapeuticArea
          )
          const sectionDescription = (sectionRows.find((r: any) => r.id === section.id) as any)?.description ?? null
          const content = await streamSection(
            section,
            sectionDescription,
            completedSections,
            anchor,
            enrichedContext,
            ragChunks,
            debug
          )
          if (content) {
            completedSections.push({ id: section.id, name: section.name, content })
            // Update anchor with latest content (after every section)
            if (session) {
              const newAnchor = await extractAnchor(content, session)
              if (newAnchor) anchor = newAnchor
              dispatch({ type: 'SET_ANCHOR', anchor })
            }
          }
        }
        dispatch({ type: 'GENERATION_COMPLETE' })
      } catch (err) {
        console.error('[useProposalGeneration] generateAll error:', err)
        dispatch({ type: 'GENERATION_COMPLETE' })
      }
    },
    [proposalId, session, profile, streamSection]
  )

  // generateSection: single section by UUID (REQ-4.7)
  const generateSection = useCallback(
    async (
      sectionId: string,
      proposalContext: GenerateSectionPayloadV2['proposalContext']
    ): Promise<string> => {
      // Fetch the section row by id
      const { data: row } = await supabase
        .from('proposal_sections')
        .select('id, name, description, position, role, section_key')
        .eq('id', sectionId)
        .single()

      if (!row) {
        console.error('[useProposalGeneration] Section not found:', sectionId)
        return ''
      }

      const section: SectionState = {
        id: row.id,
        name: row.name ?? row.section_key ?? 'Section',
        position: row.position ?? 99,
        role: row.role ?? null,
        status: 'pending',
        liveText: '',
        finalContent: null,
        error: null,
      }

      const ragChunks = await fetchRagChunks(
        profile?.org_id ?? '',
        section.name,
        proposalContext.studyInfo.therapeuticArea
      )

      return streamSection(
        section,
        row.description ?? null,
        [],
        state.consistencyAnchor,
        proposalContext,
        ragChunks
      )
    },
    [proposalId, profile, streamSection, state.consistencyAnchor]
  )

  // regenerateSection: reset + generate (REQ-4.7)
  const regenerateSection = useCallback(
    async (
      sectionId: string,
      proposalContext: GenerateSectionPayloadV2['proposalContext']
    ): Promise<string> => {
      dispatch({ type: 'SECTION_GENERATING', sectionId })
      return generateSection(sectionId, proposalContext)
    },
    [generateSection]
  )

  // Sorted sections array for consumers (D-12)
  const sortedSections = Object.values(state.sections).sort((a, b) => a.position - b.position)

  return { state, dispatch, generateAll, generateSection, regenerateSection, sortedSections }
}
