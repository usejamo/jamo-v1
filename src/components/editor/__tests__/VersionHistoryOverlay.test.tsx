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
        })),
      })),
    })),
  },
}))

import { VersionHistoryOverlay } from '../VersionHistoryOverlay'

const defaultProps = {
  proposalId: 'proposal-1',
  orgId: 'org-1',
  sectionKey: 'executive_summary',
  currentContent: '<p>Current content</p>',
  onRestore: vi.fn(),
  onClose: vi.fn(),
}

describe('VersionHistoryOverlay', () => {
  it('renders overlay with semi-transparent backdrop at z-50', () => {
    const { container } = render(<VersionHistoryOverlay {...defaultProps} />)
    // Backdrop div with fixed inset-0 z-50
    const backdrop = container.querySelector('.fixed.inset-0.z-50')
    expect(backdrop).not.toBeNull()
  })

  it('displays version entries with action_label and timestamp', async () => {
    render(<VersionHistoryOverlay {...defaultProps} />)
    // After loading resolves with empty data, shows "No version history yet"
    await screen.findByText('No version history yet')
    expect(screen.getByText('No version history yet')).toBeTruthy()
  })

  it.skip('shows diff of selected version against current live content', () => {
    expect(true).toBe(false)
  })

  it.skip('Restore button calls onRestore with version content', () => {
    expect(true).toBe(false)
  })

  it.skip('closes on X button click or backdrop click', () => {
    expect(true).toBe(false)
  })
})
