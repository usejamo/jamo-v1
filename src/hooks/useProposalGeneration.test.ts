import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generationReducer,
  readSSEStream,
  fetchRagChunks,
} from './useProposalGeneration'
import {
  GenerationState,
  createInitialSections,
  getWaveSections,
  TOTAL_SECTIONS,
} from '../types/generation'

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

function makeInitialState(): GenerationState {
  return {
    isGenerating: false,
    currentWave: null,
    tone: 'formal',
    consistencyAnchor: '',
    sections: createInitialSections(),
    completedCount: 0,
    totalCount: TOTAL_SECTIONS,
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

  it('START_GENERATION sets isGenerating=true and currentWave=1', () => {
    const state = makeInitialState()
    const next = generationReducer(state, { type: 'START_GENERATION' })
    expect(next.isGenerating).toBe(true)
    expect(next.currentWave).toBe(1)
  })

  it('START_GENERATION resets completedCount to 0', () => {
    const state = { ...makeInitialState(), completedCount: 5 }
    const next = generationReducer(state, { type: 'START_GENERATION' })
    expect(next.completedCount).toBe(0)
  })

  it('SECTION_GENERATING sets section status to generating', () => {
    const state = makeInitialState()
    const next = generationReducer(state, {
      type: 'SECTION_GENERATING',
      sectionKey: 'understanding',
    })
    expect(next.sections['understanding'].status).toBe('generating')
  })

  it('SECTION_GENERATING clears liveText', () => {
    const state = makeInitialState()
    // Pre-populate liveText
    state.sections['understanding'].liveText = 'existing text'
    const next = generationReducer(state, {
      type: 'SECTION_GENERATING',
      sectionKey: 'understanding',
    })
    expect(next.sections['understanding'].liveText).toBe('')
  })

  it('SECTION_TOKEN appends token to liveText', () => {
    const state = makeInitialState()
    const s1 = generationReducer(state, {
      type: 'SECTION_TOKEN',
      sectionKey: 'understanding',
      token: 'Hello ',
    })
    const s2 = generationReducer(s1, {
      type: 'SECTION_TOKEN',
      sectionKey: 'understanding',
      token: 'world',
    })
    expect(s2.sections['understanding'].liveText).toBe('Hello world')
  })

  it('SECTION_COMPLETE sets status=complete, finalContent, increments completedCount', () => {
    const state = makeInitialState()
    const next = generationReducer(state, {
      type: 'SECTION_COMPLETE',
      sectionKey: 'understanding',
      content: 'Final content here',
    })
    expect(next.sections['understanding'].status).toBe('complete')
    expect(next.sections['understanding'].finalContent).toBe('Final content here')
    expect(next.completedCount).toBe(1)
  })

  it('SECTION_ERROR sets status=error and error message', () => {
    const state = makeInitialState()
    const next = generationReducer(state, {
      type: 'SECTION_ERROR',
      sectionKey: 'understanding',
      error: 'Network timeout',
    })
    expect(next.sections['understanding'].status).toBe('error')
    expect(next.sections['understanding'].error).toBe('Network timeout')
  })

  it('SET_ANCHOR updates consistencyAnchor', () => {
    const state = makeInitialState()
    const next = generationReducer(state, { type: 'SET_ANCHOR', anchor: 'anchor-text' })
    expect(next.consistencyAnchor).toBe('anchor-text')
  })

  it('GENERATION_COMPLETE sets isGenerating=false and currentWave=null', () => {
    const state = { ...makeInitialState(), isGenerating: true, currentWave: 3 as const }
    const next = generationReducer(state, { type: 'GENERATION_COMPLETE' })
    expect(next.isGenerating).toBe(false)
    expect(next.currentWave).toBe(null)
  })

  it('RESET returns initial state', () => {
    const state = {
      ...makeInitialState(),
      isGenerating: true,
      completedCount: 7,
      consistencyAnchor: 'some anchor',
    }
    const next = generationReducer(state, { type: 'RESET' })
    expect(next.isGenerating).toBe(false)
    expect(next.completedCount).toBe(0)
    expect(next.consistencyAnchor).toBe('')
  })
})

// ---------------------------------------------------------------------------
// getWaveSections tests
// ---------------------------------------------------------------------------

describe('getWaveSections', () => {
  it('getWaveSections(1) returns ["understanding"]', () => {
    expect(getWaveSections(1)).toEqual(['understanding'])
  })

  it('getWaveSections(2) returns 6 body section keys', () => {
    const wave2 = getWaveSections(2)
    expect(wave2).toHaveLength(6)
    expect(wave2).toContain('scope_of_work')
    expect(wave2).toContain('proposed_team')
    expect(wave2).toContain('timeline')
    expect(wave2).toContain('budget')
    expect(wave2).toContain('regulatory_strategy')
    expect(wave2).toContain('quality_management')
  })

  it('getWaveSections(3) returns executive_summary and cover_letter', () => {
    const wave3 = getWaveSections(3)
    expect(wave3).toHaveLength(2)
    expect(wave3).toContain('executive_summary')
    expect(wave3).toContain('cover_letter')
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

describe('fetchRagChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls retrieve-context with sectionKey and therapeuticArea', async () => {
    const { supabase } = await import('../lib/supabase')
    const invokeMock = vi.mocked(supabase.functions.invoke)
    invokeMock.mockResolvedValueOnce({
      data: { chunks: [{ content: 'chunk1', doc_type: 'ICH', agency: 'FDA' }] },
      error: null,
    })

    const result = await fetchRagChunks('proposal-1', 'understanding', 'Oncology')
    expect(invokeMock).toHaveBeenCalledWith('retrieve-context', {
      body: {
        proposalId: 'proposal-1',
        sectionKey: 'understanding',
        therapeuticArea: 'Oncology',
        topK: 5,
      },
    })
    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('chunk1')
  })

  it('returns empty array on retrieve-context error', async () => {
    const { supabase } = await import('../lib/supabase')
    const invokeMock = vi.mocked(supabase.functions.invoke)
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: new Error('connection failed'),
    })

    const result = await fetchRagChunks('proposal-1', 'understanding', 'Oncology')
    expect(result).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Realtime subscription (requires live Supabase — skip in unit tests)
// ---------------------------------------------------------------------------

describe('useProposalGeneration Realtime', () => {
  it.skip('subscribes to proposal_sections postgres_changes on mount', () => {
    expect(true).toBe(false)
  })
  it.skip('dispatches SECTION_COMPLETE when Realtime delivers complete status', () => {
    expect(true).toBe(false)
  })
})
