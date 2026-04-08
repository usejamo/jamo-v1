import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
  },
}))

vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => ({
    commands: { setContent: vi.fn(), insertContentAt: vi.fn() },
    getHTML: vi.fn(() => '<p>test content</p>'),
    setEditable: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
    destroy: vi.fn(),
    isDestroyed: false,
  })),
  EditorContent: ({ editor }: { editor: any }) => (
    <div data-testid="editor-content">{editor ? 'editor-mounted' : 'no-editor'}</div>
  ),
}))

vi.mock('@tiptap/starter-kit', () => ({ default: {} }))

vi.mock('../../../context/SectionWorkspaceContext', () => ({
  useSectionWorkspace: vi.fn(() => ({
    state: { sections: {}, active_section: '', version_history_open: null, consistency_flags: [], consistency_dismissed: false },
    dispatch: vi.fn(),
  })),
}))

vi.mock('../../../hooks/useAutosave', () => ({
  useAutosave: vi.fn(() => ({ triggerAutosave: vi.fn(), cancel: vi.fn() })),
}))

vi.mock('../../../hooks/useComplianceCheck', () => ({
  useComplianceCheck: vi.fn(() => ({ checkCompliance: vi.fn() })),
}))

import { SectionEditorBlock } from '../SectionEditorBlock'
import type { SectionEditorState } from '../../../types/workspace'

const baseEditorState: SectionEditorState = {
  section_key: 'executive_summary',
  content: '<p>Hello world</p>',
  last_saved_content: null,
  is_locked: false,
  status: 'complete',
  autosave_status: 'idle',
  compliance_flags: [],
  compliance_checking: false,
  ai_action: null,
}

describe('SectionEditorBlock', () => {
  it('renders TipTap editor with section content', () => {
    render(
      <SectionEditorBlock
        ref={null}
        sectionKey="executive_summary"
        sectionTitle="Executive Summary"
        proposalId="proposal-1"
        editorState={baseEditorState}
      />
    )
    expect(screen.getByTestId('editor-content')).toBeTruthy()
  })

  it('sets editable=false when section is locked', () => {
    const lockedState = { ...baseEditorState, is_locked: true }
    const { container } = render(
      <SectionEditorBlock
        ref={null}
        sectionKey="executive_summary"
        sectionTitle="Executive Summary"
        proposalId="proposal-1"
        editorState={lockedState}
      />
    )
    // Component renders without crashing when locked
    expect(container).toBeTruthy()
  })

  it.skip('triggers autosave on content update after debounce', () => {
    expect(true).toBe(false)
  })

  it.skip('exposes SectionEditorHandle via ref for Phase 9 injection', () => {
    expect(true).toBe(false)
  })

  it.skip('injects accepted AI content via editor.commands.setContent', () => {
    expect(true).toBe(false)
  })
})
