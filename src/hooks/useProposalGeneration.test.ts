import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  generationReducer,
  readSSEStream,
  fetchRagChunks,
  buildRegulatoryQuery,
} from './useProposalGeneration'
import type { GenerationState, SectionState } from '../types/generation'

// ---------------------------------------------------------------------------
// Mock supabase
// ---------------------------------------------------------------------------
vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke: vi.fn(),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}))

vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ session: { access_token: 'test-token' } })),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSectionState(overrides?: Partial<SectionState>): SectionState {
  return {
    id: 'sec-uuid-1',
    name: 'Understanding of the Study',
    position: 1,
    role: 'understanding',
    status: 'pending',
    liveText: '',
    finalContent: null,
    error: null,
    ...overrides,
  }
}

function makeInitialState(sections: SectionState[] = []): GenerationState {
  const sectionsMap = sections.reduce<Record<string, SectionState>>(
    (acc, s) => ({ ...acc, [s.id]: s }),
    {}
  )
  return {
    isGenerating: false,
    tone: 'formal',
    consistencyAnchor: '',
    sections: sectionsMap,
    completedCount: 0,
    totalCount: sections.length,
    creditsExhausted: false,
  }
}

// ---------------------------------------------------------------------------
// generationReducer tests
// ---------------------------------------------------------------------------

describe('generationReducer', () => {
  it('SET_TONE updates state.tone to regulatory', () => {
    const state = makeInitialState()
    const next = generationReducer(state, { type: 'SET_TONE', tone: 'regulatory' })
    expect(next.tone).toBe('regulatory')
  })

  it('START_GENERATION sets isGenerating=true and builds sections map from array', () => {
    const state = makeInitialState()
    const sections = [makeSectionState()]
    const next = generationReducer(state, { type: 'START_GENERATION', sections })
    expect(next.isGenerating).toBe(true)
    expect(next.sections['sec-uuid-1']).toBeDefined()
    expect(next.totalCount).toBe(1)
  })

  it('START_GENERATION resets completedCount to 0', () => {
    const state = { ...makeInitialState(), completedCount: 5 }
    const sections = [makeSectionState()]
    const next = generationReducer(state, { type: 'START_GENERATION', sections })
    expect(next.completedCount).toBe(0)
  })

  it('SECTION_GENERATING sets section status to generating', () => {
    const section = makeSectionState()
    const state = makeInitialState([section])
    const next = generationReducer(state, {
      type: 'SECTION_GENERATING',
      sectionId: 'sec-uuid-1',
    })
    expect(next.sections['sec-uuid-1'].status).toBe('generating')
  })

  it('SECTION_GENERATING clears liveText', () => {
    const section = makeSectionState({ liveText: 'existing text' })
    const state = makeInitialState([section])
    const next = generationReducer(state, {
      type: 'SECTION_GENERATING',
      sectionId: 'sec-uuid-1',
    })
    expect(next.sections['sec-uuid-1'].liveText).toBe('')
  })

  it('SECTION_TOKEN appends token to liveText', () => {
    const section = makeSectionState()
    const state = makeInitialState([section])
    const s1 = generationReducer(state, {
      type: 'SECTION_TOKEN',
      sectionId: 'sec-uuid-1',
      token: 'Hello ',
    })
    const s2 = generationReducer(s1, {
      type: 'SECTION_TOKEN',
      sectionId: 'sec-uuid-1',
      token: 'world',
    })
    expect(s2.sections['sec-uuid-1'].liveText).toBe('Hello world')
  })

  it('SECTION_COMPLETE sets status=complete, finalContent, increments completedCount', () => {
    const section = makeSectionState()
    const state = makeInitialState([section])
    const next = generationReducer(state, {
      type: 'SECTION_COMPLETE',
      sectionId: 'sec-uuid-1',
      content: 'Final content here',
    })
    expect(next.sections['sec-uuid-1'].status).toBe('complete')
    expect(next.sections['sec-uuid-1'].finalContent).toBe('Final content here')
    expect(next.completedCount).toBe(1)
  })

  it('SECTION_ERROR sets status=error and error message', () => {
    const section = makeSectionState()
    const state = makeInitialState([section])
    const next = generationReducer(state, {
      type: 'SECTION_ERROR',
      sectionId: 'sec-uuid-1',
      error: 'Network timeout',
    })
    expect(next.sections['sec-uuid-1'].status).toBe('error')
    expect(next.sections['sec-uuid-1'].error).toBe('Network timeout')
  })

  it('SECTION_ERROR leaves finalContent null so nothing is persisted for a truncated section', () => {
    const section = makeSectionState()
    const state = makeInitialState([section])
    const generating = generationReducer(state, { type: 'SECTION_GENERATING', sectionId: 'sec-uuid-1' })
    const withText = generationReducer(generating, {
      type: 'SECTION_TOKEN',
      sectionId: 'sec-uuid-1',
      token: 'cut off here',
    })
    const errored = generationReducer(withText, {
      type: 'SECTION_ERROR',
      sectionId: 'sec-uuid-1',
      error: 'truncated',
    })
    expect(errored.sections['sec-uuid-1'].status).toBe('error')
    expect(errored.sections['sec-uuid-1'].finalContent).toBeNull()
  })

  it('SET_ANCHOR updates consistencyAnchor', () => {
    const state = makeInitialState()
    const next = generationReducer(state, { type: 'SET_ANCHOR', anchor: 'anchor-text' })
    expect(next.consistencyAnchor).toBe('anchor-text')
  })

  it('GENERATION_COMPLETE sets isGenerating=false', () => {
    const state = { ...makeInitialState(), isGenerating: true }
    const next = generationReducer(state, { type: 'GENERATION_COMPLETE' })
    expect(next.isGenerating).toBe(false)
  })

  it('RESET returns initial state with empty sections', () => {
    const section = makeSectionState()
    const state = {
      ...makeInitialState([section]),
      isGenerating: true,
      completedCount: 7,
      consistencyAnchor: 'some anchor',
    }
    const next = generationReducer(state, { type: 'RESET' })
    expect(next.isGenerating).toBe(false)
    expect(next.completedCount).toBe(0)
    expect(next.consistencyAnchor).toBe('')
    expect(Object.keys(next.sections)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// readSSEStream tests
// ---------------------------------------------------------------------------

describe('readSSEStream', () => {
  it('extracts text tokens from content_block_delta SSE lines', async () => {
    const ssePayload = [
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":" world"}}',
      'data: [DONE]',
    ].join('\n') + '\n'

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload))
        controller.close()
      },
    })
    const response = new Response(stream)

    const tokens: string[] = []
    await readSSEStream(response, (t) => tokens.push(t))
    expect(tokens).toEqual(['Hello', ' world'])
  })

  it('ignores non-content_block_delta events', async () => {
    const ssePayload = [
      'data: {"type":"message_start","message":{}}',
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"OK"}}',
    ].join('\n') + '\n'

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload))
        controller.close()
      },
    })
    const response = new Response(stream)

    const tokens: string[] = []
    await readSSEStream(response, (t) => tokens.push(t))
    expect(tokens).toEqual(['OK'])
  })
})

// ---------------------------------------------------------------------------
// fetchRagChunks tests
// ---------------------------------------------------------------------------

describe('buildRegulatoryQuery', () => {
  it('composes all attributes into the documented shape', () => {
    expect(
      buildRegulatoryQuery({
        sectionName: 'Study Design',
        studyPhase: 'Phase 2',
        therapeuticArea: 'Oncology',
        indication: 'NSCLC',
      })
    ).toBe('Study Design — Phase 2 Oncology study of NSCLC')
  })

  it('returns just the section name when no attributes are present', () => {
    expect(buildRegulatoryQuery({ sectionName: 'Study Design' })).toBe('Study Design')
  })

  it('omits "study of {indication}" when indication is missing', () => {
    expect(
      buildRegulatoryQuery({ sectionName: 'Study Design', studyPhase: 'Phase 2', therapeuticArea: 'Oncology' })
    ).toBe('Study Design — Phase 2 Oncology')
  })

  it('drops null/empty attributes without dangling separators or double spaces', () => {
    const q = buildRegulatoryQuery({
      sectionName: 'Study Design',
      studyPhase: null,
      therapeuticArea: 'Oncology',
      indication: '',
    })
    expect(q).toBe('Study Design — Oncology')
    expect(q).not.toMatch(/ {2,}/)
    expect(q).not.toMatch(/study of\s*$/)
  })
})

describe('fetchRagChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('composes the query and passes studyPhase + geography in the invoke body', async () => {
    const { supabase } = await import('../lib/supabase')
    const invokeMock = vi.mocked(supabase.functions.invoke)
    invokeMock.mockResolvedValueOnce({
      data: { regulatoryChunks: [{ content: 'chunk1', doc_type: 'ICH', agency: 'FDA' }], proposalChunks: [] },
      error: null,
    })

    const result = await fetchRagChunks(
      'org-1',
      'proposal-1',
      'Study Design',
      'Oncology',
      'Phase 2',
      ['US', 'EU'],
      'NSCLC'
    )
    expect(invokeMock).toHaveBeenCalledWith('retrieve-context', {
      body: {
        orgId: 'org-1',
        proposalId: 'proposal-1',
        query: 'Study Design — Phase 2 Oncology study of NSCLC',
        therapeuticArea: 'Oncology',
        studyPhase: 'Phase 2',
        geography: ['US', 'EU'],
      },
    })
    // fetchRagChunks now returns the split object (Plan 14.6-01), not a merged array.
    // regulatoryCount falls back to regulatoryChunks.length when retrievalMeta is absent.
    expect(result.regulatoryChunks).toHaveLength(1)
    expect(result.regulatoryChunks[0].content).toBe('chunk1')
    expect(result.proposalChunks).toEqual([])
    expect(result.regulatoryCount).toBe(1)
  })

  it('returns the zeroed split on retrieve-context error', async () => {
    const { supabase } = await import('../lib/supabase')
    const invokeMock = vi.mocked(supabase.functions.invoke)
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error('connection failed'),
    })

    const result = await fetchRagChunks('org-1', 'proposal-1', 'understanding', 'Oncology')
    expect(result).toEqual({ regulatoryChunks: [], proposalChunks: [], regulatoryCount: 0 })
  })
})

// ---------------------------------------------------------------------------
// Realtime subscription (requires live Supabase — skip in unit tests)
// ---------------------------------------------------------------------------

describe('readSSEStream truncation control event', () => {
  function sseResponse(lines: string[]): Response {
    const body = new ReadableStream<Uint8Array>({
      start(c) { for (const l of lines) c.enqueue(new TextEncoder().encode(l + '\n')); c.close() },
    })
    return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })
  }

  it('routes jamo_truncated to onControl and never to onToken', async () => {
    const tokens: string[] = []
    const controls: string[] = []
    await readSSEStream(
      sseResponse([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"partial"}}',
        'data: {"type":"jamo_truncated"}',
      ]),
      (t) => tokens.push(t),
      undefined,
      (e) => controls.push(e.type),
    )
    expect(tokens).toEqual(['partial'])
    expect(controls).toEqual(['jamo_truncated'])
  })
})

describe('useProposalGeneration Realtime', () => {
  it.skip('subscribes to proposal_sections postgres_changes on mount', () => {
    expect(true).toBe(false)
  })
  it.skip('dispatches SECTION_COMPLETE when Realtime delivers complete status', () => {
    expect(true).toBe(false)
  })
})
