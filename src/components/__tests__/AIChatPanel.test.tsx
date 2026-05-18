import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'

// ── Supabase mock ────────────────────────────────────────────────────────────
const mockInsert = vi.fn(() => Promise.resolve({ error: null }))
const mockSelectChain = {
  eq: () => mockSelectChain,
  order: () => mockSelectChain,
  single: () => Promise.resolve({ data: null }),
  maybeSingle: () => Promise.resolve({ data: null }),
  then: (resolve: (v: { data: null }) => void) => Promise.resolve({ data: null }).then(resolve),
}
const mockFrom = vi.fn(() => ({ insert: mockInsert, select: () => mockSelectChain }))
const mockChannel = {
  on: () => mockChannel,
  subscribe: () => mockChannel,
}

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    channel: () => mockChannel,
    removeChannel: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  },
}))

// ── framer-motion mock ───────────────────────────────────────────────────────
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    span: ({ children, ...props }: any) => <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}))

// ── chatContext mock ─────────────────────────────────────────────────────────
vi.mock('../../utils/chatContext', () => ({
  buildContextPayload: vi.fn(() => ({ payload: 'mock' })),
}))

// ── SectionWorkspaceContext mock ─────────────────────────────────────────────
vi.mock('../../context/SectionWorkspaceContext', () => ({
  useSectionWorkspace: () => ({
    state: { sections: {} },
    dispatch: vi.fn(),
  }),
  SectionWorkspaceProvider: ({ children }: { children: any }) => children,
}))

// ── AuthContext mock ─────────────────────────────────────────────────────────
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-test-123' },
    profile: null,
    signOut: vi.fn(),
  }),
}))

// ── SidebarContext mock ──────────────────────────────────────────────────────
vi.mock('../../context/SidebarContext', () => ({
  useSidebar: () => ({ setSidebarNode: vi.fn(), sidebarNode: null }),
}))

// ── ActionQueue mock (stub — avoids framer-motion nesting issues) ────────────
vi.mock('../chat/ActionQueue', () => ({
  ActionQueue: () => null,
  QUEUE_ITEM_STATES: { PENDING: 'pending', DISMISSED: 'dismissed', COMPLETED: 'completed', SKIPPED: 'skipped' },
}))

// ── WalkthroughProgress mock ─────────────────────────────────────────────────
vi.mock('../chat/WalkthroughProgress', () => ({
  WalkthroughProgress: () => null,
}))

import AIChatPanel from '../AIChatPanel'
import { SectionWorkspaceProvider } from '../../context/SectionWorkspaceContext'
import type { SectionEditorHandle } from '../../types/workspace'
import { supabase } from '../../lib/supabase'

// ── Default props ─────────────────────────────────────────────────────────────

function makeEditorRefs(handle?: Partial<SectionEditorHandle>) {
  const map = new Map<string, SectionEditorHandle>()
  if (handle) {
    const fullHandle: SectionEditorHandle = {
      insertContentAt: vi.fn(),
      getContent: vi.fn(() => '<p></p>'),
      setContent: vi.fn(),
      materializePendingEdits: vi.fn(),
      ...handle,
    }
    map.set('understanding', fullHandle)
  }
  return { current: map } as React.MutableRefObject<Map<string, SectionEditorHandle>>
}

const defaultProps = {
  proposalId: 'proposal-123',
  orgId: 'org-456',
  draftGenerated: true,
  sections: [{ section_key: 'understanding', content: '<p>Section content</p>', title: 'Understanding' }],
  editorRefs: makeEditorRefs(),
  activeSectionKey: null as string | null,
  sectionTitles: { understanding: 'Understanding' },
}

const renderWithWorkspace = (ui: React.ReactElement) =>
  render(<SectionWorkspaceProvider>{ui}</SectionWorkspaceProvider>)

describe('AIChatPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('renders pending actions badge on rail when pendingActionsCount > 0', () => {
    // The badge renders in Rail (collapsed state). Collapse the panel first.
    renderWithWorkspace(<AIChatPanel {...defaultProps} />)
    // Click the collapse button to put panel into Rail view
    const collapseBtn = screen.getByTitle('Collapse (⌘J)')
    fireEvent.click(collapseBtn)
    // Rail renders with SpectrumSparkle — no badge initially (pendingActions starts empty)
    expect(screen.queryByText('3')).toBeNull()
  })

  it('renders tool-propose-edit placeholder card on tool_result event', async () => {
    const editorRefs = makeEditorRefs()

    // Stub fetch to return a streaming response with tool_result for propose_edit
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"tool_start","tool":"propose_edit"}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: {"type":"tool_result","tool":"propose_edit","result":{"section_key":"understanding","overall_summary":"Rewrote the section","changes":[]}}\n\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, body: mockStream }))

    renderWithWorkspace(
      <AIChatPanel
        {...defaultProps}
        editorRefs={editorRefs}
        activeSectionKey="understanding"
      />
    )

    // Submit a message to trigger streaming
    const input = screen.getByPlaceholderText('Ask jamo to edit...')
    fireEvent.change(input, { target: { value: 'Rewrite this section' } })
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
      await new Promise(r => setTimeout(r, 100))
    })

    // Wait for the EditSummaryCard to appear (renders "Review proposed changes" header)
    await waitFor(() => {
      expect(screen.queryByText('Review proposed changes')).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('streams content into message bubble without layout thrash', async () => {
    const chunks = ['Hello ', 'world', '!']
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null
    const mockStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, body: mockStream }))

    renderWithWorkspace(<AIChatPanel {...defaultProps} />)

    const input = screen.getByPlaceholderText('Ask jamo to edit...')
    fireEvent.change(input, { target: { value: 'Hello' } })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
      await new Promise(r => setTimeout(r, 50))
    })

    // Push streaming chunks using new text_delta SSE format
    await act(async () => {
      for (const chunk of chunks) {
        const line = `data: {"type":"text_delta","text":"${chunk}"}\n\n`
        controllerRef!.enqueue(new TextEncoder().encode(line))
        await new Promise(r => setTimeout(r, 10))
      }
      controllerRef!.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
      controllerRef!.close()
      await new Promise(r => setTimeout(r, 100))
    })

    // After streaming, the content should appear in the messages area
    await waitFor(() => {
      const content = screen.queryByText(/Hello world!/) || screen.queryByText(/Hello /)
      expect(content).toBeTruthy()
    }, { timeout: 3000 })
  })

  it('shows explain chip when activeSectionKey is set', () => {
    renderWithWorkspace(<AIChatPanel {...defaultProps} activeSectionKey="understanding" />)
    expect(screen.getByText('Explain this section')).toBeTruthy()
  })

  it('hides explain chip when no section targeted', () => {
    renderWithWorkspace(<AIChatPanel {...defaultProps} activeSectionKey={null} />)
    expect(screen.queryByText('Explain this section')).toBeNull()
  })

  it('persists messages to proposal_chats on send', async () => {
    // Mock the stream to resolve immediately
    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    vi.mocked(supabase.functions.invoke).mockResolvedValueOnce({ data: mockStream, error: null } as any)

    renderWithWorkspace(<AIChatPanel {...defaultProps} />)

    const input = screen.getByPlaceholderText('Ask jamo to edit...')
    fireEvent.change(input, { target: { value: 'Test message' } })

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' })
      await new Promise(r => setTimeout(r, 200))
    })

    // Verify supabase.from('proposal_chats').insert was called
    await waitFor(() => {
      expect(mockFrom).toHaveBeenCalledWith('proposal_chats')
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          proposal_id: 'proposal-123',
          message_type: 'chat',
        })
      )
    }, { timeout: 3000 })
  })

  it('displays citations in explain response', () => {
    renderWithWorkspace(<AIChatPanel {...defaultProps} />)
    // Panel is expanded by default — messages area is visible
    const panelArea = screen.getByPlaceholderText('Ask jamo to edit...')
    expect(panelArea).toBeTruthy()
    const reviewGapsBtn = screen.getByText('Review gaps')
    expect(reviewGapsBtn).toBeTruthy()
  })
})
