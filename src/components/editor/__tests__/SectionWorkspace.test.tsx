import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// Mutable, test-controlled fixture for proposal_section_versions rows — reset in
// beforeEach so the version-restore test doesn't leak into unrelated tests.
const { mockVersionsRef } = vi.hoisted(() => ({
  mockVersionsRef: { current: [] as Array<{ id: string; content: string; action_label: string; created_at: string }> },
}))

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'proposal_section_versions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(() => Promise.resolve({ data: mockVersionsRef.current, error: null })),
                })),
              })),
            })),
          })),
          insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        }
      }
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
            order: vi.fn(() => ({
              limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          })),
          order: vi.fn(() => ({
            limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        upsert: vi.fn(() => Promise.resolve({ error: null })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }
    }),
    functions: {
      invoke: vi.fn(() => Promise.resolve({ data: null, error: null })),
    },
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

vi.mock('../../../hooks/useAutosave', () => ({
  useAutosave: vi.fn(() => ({ triggerAutosave: vi.fn(), cancel: vi.fn() })),
}))

vi.mock('../../../hooks/useComplianceCheck', () => ({
  useComplianceCheck: vi.fn(() => ({ checkCompliance: vi.fn() })),
}))

vi.mock('../../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ user: null, profile: null, loading: false })),
}))

import SectionWorkspace from '../SectionWorkspace'
import { SectionWorkspaceProvider } from '../../../context/SectionWorkspaceContext'

const sections = [
  { section_key: 'executive_summary', name: 'Executive Summary', content: '<p>Summary content</p>', is_locked: false, status: 'complete', last_saved_content: null },
  { section_key: 'budget', name: 'Budget & Pricing', content: '<p>Budget content</p>', is_locked: false, status: 'complete', last_saved_content: null },
]

describe('SectionWorkspace', () => {
  beforeEach(() => {
    mockVersionsRef.current = []
  })

  it('renders three-panel layout with left nav, center editor, right slot', () => {
    const { container } = render(
      <SectionWorkspaceProvider>
        <SectionWorkspace proposalId="proposal-1" sections={sections} orgId="org-1" />
      </SectionWorkspaceProvider>
    )
    // Three-panel layout: nav + editors + right slot
    expect(container.firstChild).not.toBeNull()
    // Section nav renders section labels from SECTION_NAMES
    expect(screen.getAllByText('Executive Summary').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Budget & Pricing').length).toBeGreaterThanOrEqual(1)
  })

  it('renders SectionEditorBlock for each section in proposal', () => {
    render(
      <SectionWorkspaceProvider>
        <SectionWorkspace proposalId="proposal-1" sections={sections} orgId="org-1" />
      </SectionWorkspaceProvider>
    )
    // Each section has an editor-content block
    const editorBlocks = screen.getAllByTestId('editor-content')
    expect(editorBlocks.length).toBeGreaterThanOrEqual(sections.length)
  })

  it.skip('tracks active section via intersection observer or click', () => {
    expect(true).toBe(false)
  })

  // Regression test for the same bug class as the accept-edit revert fix: restoring
  // a version via VersionHistoryOverlay persists to the editor + DB via setContent's
  // onUpdate -> triggerAutosave path, but must ALSO notify the parent so its
  // proposalSections seed source doesn't go stale and revert the restore on remount.
  it('calls onSectionContentPersisted with the restored html when a version is restored', async () => {
    mockVersionsRef.current = [
      { id: 'v1', content: '<p>Restored content</p>', action_label: 'Before Restore', created_at: new Date().toISOString() },
    ]
    const onSectionContentPersisted = vi.fn()

    render(
      <SectionWorkspaceProvider>
        <SectionWorkspace
          proposalId="proposal-1"
          sections={sections}
          orgId="org-1"
          onSectionContentPersisted={onSectionContentPersisted}
        />
      </SectionWorkspaceProvider>
    )

    // Open history for the first section (executive_summary)
    fireEvent.click(screen.getAllByLabelText('History')[0])

    // Wait for the version list to load, then select the version
    const versionEntry = await screen.findByText('Before Restore')
    fireEvent.click(versionEntry)

    // Click restore
    const restoreButton = await screen.findByText('Restore this version')
    fireEvent.click(restoreButton)

    await waitFor(() => {
      expect(onSectionContentPersisted).toHaveBeenCalledWith('executive_summary', '<p>Restored content</p>')
    })
  })
})
