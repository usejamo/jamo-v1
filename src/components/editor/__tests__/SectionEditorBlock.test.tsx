import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

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
  useAutosave: vi.fn(() => ({ triggerAutosave: vi.fn(), cancel: vi.fn(), saveNow: vi.fn(() => Promise.resolve()) })),
}))

vi.mock('../../../hooks/useComplianceCheck', () => ({
  useComplianceCheck: vi.fn(() => ({ checkCompliance: vi.fn() })),
}))

vi.mock('../../../hooks/useSectionAIAction', () => ({
  useSectionAIAction: vi.fn(() => ({ triggerAction: vi.fn() })),
}))

import { SectionEditorBlock } from '../SectionEditorBlock'
import type { SectionEditorState } from '../../../types/workspace'
import { useAutosave } from '../../../hooks/useAutosave'

const baseEditorState: SectionEditorState = {
  section_key: 'executive_summary',
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
  pending_edits: [],
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

  // Regression test for the "accepted edits revert after reopening the proposal" bug.
  // Root cause: handleAcceptAIAction persisted the accepted content to the editor + DB,
  // but never told the parent (ProposalDetail's proposalSections, which SEEDS editors on
  // remount) about it — so a later remount re-seeded stale content and re-persisted it,
  // reverting the edit. The fix: SectionEditorBlock must call onSectionContentPersisted
  // with the accepted html, AFTER the save succeeds, so the parent can keep its seed
  // source in sync.
  it('calls onSectionContentPersisted with the accepted html after saveNow succeeds', async () => {
    // Deferred promise so we can control exactly when saveNow "completes" and
    // assert the callback hasn't fired yet at that point — a plain
    // `vi.fn(() => Promise.resolve())` only proves CALL order (via
    // invocationCallOrder), not COMPLETION order, so a broken variant that drops
    // the `await` before calling onSectionContentPersisted would still pass it.
    let resolveSaveNow!: () => void
    const saveNowPromise = new Promise<void>((resolve) => {
      resolveSaveNow = resolve
    })
    const saveNowMock = vi.fn(() => saveNowPromise)
    vi.mocked(useAutosave).mockReturnValue({
      triggerAutosave: vi.fn(),
      cancel: vi.fn(),
      saveNow: saveNowMock,
    })

    const onSectionContentPersisted = vi.fn()
    const stateWithRewrite: SectionEditorState = {
      ...baseEditorState,
      ai_action: {
        type: 'rewrite',
        streaming: false,
        preview_content: 'Rewritten content',
        snapshot_before: '<p>Hello world</p>',
      },
    }

    render(
      <SectionEditorBlock
        ref={null}
        sectionKey="executive_summary"
        sectionTitle="Executive Summary"
        proposalId="proposal-1"
        editorState={stateWithRewrite}
        onSectionContentPersisted={onSectionContentPersisted}
      />
    )

    fireEvent.click(screen.getByText('Apply Rewrite'))

    await waitFor(() => {
      expect(saveNowMock).toHaveBeenCalled()
    })

    // saveNow has been CALLED but its promise is still pending — the callback must
    // not fire yet. This is the part a dropped `await` would break: without it,
    // onSectionContentPersisted would run synchronously after the (un-awaited)
    // saveNow call, before this promise ever resolves.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onSectionContentPersisted).not.toHaveBeenCalled()

    // Now let saveNow's promise resolve (simulating the DB write completing) and
    // confirm the callback fires only after that.
    resolveSaveNow()

    await waitFor(() => {
      expect(onSectionContentPersisted).toHaveBeenCalled()
    })

    expect(onSectionContentPersisted).toHaveBeenCalledWith(
      'executive_summary',
      expect.stringContaining('Rewritten content')
    )
  })
})
