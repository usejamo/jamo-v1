import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SectionActionToolbar } from '../SectionActionToolbar'

const defaultProps = {
  sectionKey: 'executive_summary',
  sectionTitle: 'Executive Summary',
  hasContent: false,
  isLocked: false,
  isStreaming: false,
  onAction: vi.fn(),
  onToggleLock: vi.fn(),
  onOpenHistory: vi.fn(),
}

describe('SectionActionToolbar', () => {
  it('renders Generate button when section has no content', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={false} />)
    expect(screen.getByText('Generate Section')).toBeTruthy()
  })

  it('renders Expand/Condense/Rewrite when section has content', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    expect(screen.getByText('Expand')).toBeTruthy()
    expect(screen.getByText('Condense')).toBeTruthy()
    expect(screen.getByText('Rewrite')).toBeTruthy()
  })

  it('disables all action buttons when section is locked', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} isLocked={true} />)
    const expandBtn = screen.getByText('Expand').closest('button')
    expect(expandBtn).not.toBeNull()
    expect(expandBtn!.disabled).toBe(true)
  })

  it('lock toggle remains active even when section is locked', () => {
    render(<SectionActionToolbar {...defaultProps} isLocked={true} />)
    const lockBtn = screen.getByTitle('Unlock')
    expect(lockBtn).not.toBeNull()
    expect(lockBtn.disabled).toBeFalsy()
  })

  it('shows History icon button with title attribute', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    const historyBtn = screen.getByTitle('History')
    expect(historyBtn).not.toBeNull()
    expect(historyBtn.disabled).toBeFalsy()
  })
})
