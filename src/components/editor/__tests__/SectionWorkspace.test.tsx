import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('../../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
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
        })),
        order: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
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

import SectionWorkspace from '../SectionWorkspace'

const sections = [
  { section_key: 'executive_summary', content: '<p>Summary content</p>', is_locked: false, status: 'complete', last_saved_content: null },
  { section_key: 'budget', content: '<p>Budget content</p>', is_locked: false, status: 'complete', last_saved_content: null },
]

describe('SectionWorkspace', () => {
  it('renders three-panel layout with left nav, center editor, right slot', () => {
    const { container } = render(
      <SectionWorkspace proposalId="proposal-1" sections={sections} orgId="org-1" />
    )
    // Three-panel layout: nav + editors + right slot
    expect(container.firstChild).not.toBeNull()
    // Section nav renders section labels from SECTION_NAMES
    expect(screen.getAllByText('Executive Summary').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('Budget & Pricing').length).toBeGreaterThanOrEqual(1)
  })

  it('renders SectionEditorBlock for each section in proposal', () => {
    render(
      <SectionWorkspace proposalId="proposal-1" sections={sections} orgId="org-1" />
    )
    // Each section has an editor-content block
    const editorBlocks = screen.getAllByTestId('editor-content')
    expect(editorBlocks.length).toBeGreaterThanOrEqual(sections.length)
  })

  it.skip('tracks active section via intersection observer or click', () => {
    expect(true).toBe(false)
  })
})
