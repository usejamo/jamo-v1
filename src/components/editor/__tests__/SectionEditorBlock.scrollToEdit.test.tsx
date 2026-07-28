// Regression: clicking "Review in editor" on an EditSummaryCard did not move the
// viewport to the edit.
//
// Root cause (docs/handoffs/2026-07-27-chat-suggestion-bugs-rootcause.md):
// materializePendingEdits DOES scroll (SectionEditorBlock.tsx, end of the callback),
// but propose_edit auto-materializes on arrival (AIChatPanel.tsx:770-788) using edit
// ids `${msgId}-${i}`. "Review in editor" re-mints the SAME ids, so the idempotency
// guard near the top of materializePendingEdits early-returns BEFORE reaching the
// scroll. Nothing moves.
//
// The fix is a dedicated scrollToEdit() on the handle: "Review in editor" is a
// NAVIGATION action and must scroll regardless of materialization state.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { createRef } from 'react'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ upsert: vi.fn(() => Promise.resolve({ error: null })) })),
  },
}))

vi.mock('@tiptap/react', () => ({
  // Richer than the sibling SectionEditorBlock.test.tsx mock: this suite seeds
  // pending_edits, which drives the decorations-refresh effect through
  // editor.view.dispatch / editor.state.tr, and materializePendingEdits walks
  // editor.state.doc.descendants.
  useEditor: vi.fn(() => ({
    commands: { setContent: vi.fn(), insertContentAt: vi.fn() },
    getHTML: vi.fn(() => '<p data-id="para-42">test content</p>'),
    setEditable: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: false,
    view: { dispatch: vi.fn(), dom: document.createElement('div') },
    state: {
      tr: { setMeta: vi.fn(() => ({})) },
      // The anchor paragraph exists in the doc, so materializePendingEdits keeps
      // the edit rather than skipping it as stale.
      doc: {
        descendants: (fn: (node: { attrs: { id: string } }) => boolean | void) => {
          fn({ attrs: { id: 'para-42' } })
        },
      },
    },
  })),
  EditorContent: () => <div data-testid="editor-content">editor</div>,
}))

vi.mock('@tiptap/starter-kit', () => ({ default: {} }))

const mockWorkspace = {
  state: {
    sections: {} as Record<string, unknown>,
    active_section: '',
    version_history_open: null,
    consistency_flags: [],
    consistency_dismissed: false,
  },
  dispatch: vi.fn(),
}

vi.mock('../../../context/SectionWorkspaceContext', () => ({
  useSectionWorkspace: vi.fn(() => mockWorkspace),
}))

vi.mock('../../../hooks/useAutosave', () => ({
  useAutosave: vi.fn(() => ({ triggerAutosave: vi.fn(), cancel: vi.fn(), saveNow: vi.fn(() => Promise.resolve()) })),
}))
vi.mock('../../../hooks/useComplianceCheck', () => ({
  useComplianceCheck: vi.fn(() => ({ checkCompliance: vi.fn() })),
}))
vi.mock('../../../hooks/useSectionAIAction', () => ({
  useSectionAIAction: vi.fn(() => ({ triggerAction: vi.fn() })),
}))

import { SectionEditorBlock } from '../SectionEditorBlock'
import type { SectionEditorState, SectionEditorHandle, PendingEdit } from '../../../types/workspace'

const SECTION_KEY = 'executive_summary'
const MSG_ID = 'msg-abc'

const pendingEdit: PendingEdit = {
  id: `${MSG_ID}-0`,
  paragraph_id: 'para-42',
  section_key: SECTION_KEY,
  operation: 'replace',
  before_html: '<p data-id="para-42">old</p>',
  after_html: '<p data-id="para-42">new</p>',
  change_summary: 'tighten wording',
  resolution: 'pending',
  message_id: MSG_ID,
  change_index: 0,
  created_at: new Date().toISOString(),
}

const baseEditorState: SectionEditorState = {
  section_key: SECTION_KEY,
  name: 'Executive Summary',
  content: '<p>Hello world</p>',
  last_saved_content: null,
  is_locked: false,
  status: 'complete',
  autosave_status: 'idle',
  compliance_flags: [],
  compliance_checking: false,
  issues: {},
  ai_action: null,
  pending_edits: [pendingEdit],
}

function renderBlock() {
  const ref = createRef<SectionEditorHandle>()
  const { container } = render(
    <SectionEditorBlock
      ref={ref}
      sectionKey={SECTION_KEY}
      sectionTitle="Executive Summary"
      proposalId="proposal-1"
      editorState={baseEditorState}
    />
  )
  return { ref, container }
}

describe('SectionEditorHandle.scrollToEdit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // The section is already materialized — exactly the state that made the old
    // materializePendingEdits early-return without scrolling.
    mockWorkspace.state.sections = {
      [SECTION_KEY]: { ...baseEditorState, pending_edits: [pendingEdit] },
    }
  })

  it('scrolls to the edited paragraph when its data-id anchor is in the DOM', () => {
    const { ref, container } = renderBlock()

    // Section root carries id={sectionKey}; place the anchor paragraph inside it.
    const root = container.querySelector(`#${SECTION_KEY}`) as HTMLElement
    expect(root).toBeTruthy()
    const para = document.createElement('p')
    para.setAttribute('data-id', 'para-42')
    root.appendChild(para)

    const paraScroll = vi.fn()
    para.scrollIntoView = paraScroll

    const scrolled = ref.current!.scrollToEdit(MSG_ID)

    expect(scrolled).toBe(true)
    expect(paraScroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('falls back to the section root when the paragraph anchor is missing', () => {
    const { ref, container } = renderBlock()
    const root = container.querySelector(`#${SECTION_KEY}`) as HTMLElement
    const rootScroll = vi.fn()
    root.scrollIntoView = rootScroll

    const scrolled = ref.current!.scrollToEdit(MSG_ID)

    expect(scrolled).toBe(true)
    expect(rootScroll).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
  })

  it('scrolls even when the edits are ALREADY materialized (the regression)', () => {
    // materializePendingEdits returns early here and never scrolls; scrollToEdit
    // must be independent of that guard.
    const { ref, container } = renderBlock()
    const root = container.querySelector(`#${SECTION_KEY}`) as HTMLElement
    const rootScroll = vi.fn()
    root.scrollIntoView = rootScroll

    const result = ref.current!.materializePendingEdits(MSG_ID, [pendingEdit])
    expect(result.ok).toBe(true)
    expect(rootScroll).not.toHaveBeenCalled() // early return — no scroll

    expect(ref.current!.scrollToEdit(MSG_ID)).toBe(true)
    expect(rootScroll).toHaveBeenCalledTimes(1)
  })

  it('returns false when the section root is not in the DOM', () => {
    const { ref, container } = renderBlock()
    const root = container.querySelector(`#${SECTION_KEY}`) as HTMLElement
    // Rename rather than remove(): the node is React-owned, and detaching it
    // makes RTL's unmount cleanup throw removeChild-on-wrong-parent. Clearing the
    // id is the same lookup failure from scrollToEdit's point of view.
    root.id = 'not-the-section-root'
    expect(ref.current!.scrollToEdit(MSG_ID)).toBe(false)
  })
})
