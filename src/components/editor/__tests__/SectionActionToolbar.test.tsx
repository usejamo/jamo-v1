import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SectionActionToolbar } from '../SectionActionToolbar'

// ResizeObserver is not available in jsdom — stub it so the hook doesn't throw.
// Narrow-mode behavior is tested via the forceNarrow prop instead.
beforeAll(() => {
  global.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

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

  it('renders Expand/Condense/Rewrite (not Regenerate) when section has content', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    expect(screen.getByText('Expand')).toBeTruthy()
    expect(screen.getByText('Condense')).toBeTruthy()
    expect(screen.getByText('Rewrite')).toBeTruthy()
    expect(screen.queryByText('Regenerate')).toBeNull()
  })

  it('clicking Expand opens inline input with correct placeholder', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    fireEvent.click(screen.getByText('Expand'))
    expect(screen.getByPlaceholderText('What should we go deeper on?')).toBeTruthy()
  })

  it('clicking Condense opens inline input with correct placeholder', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    fireEvent.click(screen.getByText('Condense'))
    expect(screen.getByPlaceholderText('Anything that must stay in?')).toBeTruthy()
  })

  it('clicking Rewrite opens inline input with correct placeholder', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    fireEvent.click(screen.getByText('Rewrite'))
    expect(screen.getByPlaceholderText('What tone or angle are you going for?')).toBeTruthy()
  })

  it('clicking Run without input calls onAction with actionType only', () => {
    const onAction = vi.fn()
    render(<SectionActionToolbar {...defaultProps} hasContent={true} onAction={onAction} />)
    fireEvent.click(screen.getByText('Expand'))
    fireEvent.click(screen.getByText('Run'))
    expect(onAction).toHaveBeenCalledWith('expand', undefined)
  })

  it('clicking Run with input calls onAction with actionType and userInstructions', () => {
    const onAction = vi.fn()
    render(<SectionActionToolbar {...defaultProps} hasContent={true} onAction={onAction} />)
    fireEvent.click(screen.getByText('Expand'))
    fireEvent.change(screen.getByPlaceholderText('What should we go deeper on?'), {
      target: { value: 'focus on safety data' },
    })
    fireEvent.click(screen.getByText('Run'))
    expect(onAction).toHaveBeenCalledWith('expand', 'focus on safety data')
  })

  it('pressing Enter in input fires action', () => {
    const onAction = vi.fn()
    render(<SectionActionToolbar {...defaultProps} hasContent={true} onAction={onAction} />)
    fireEvent.click(screen.getByText('Expand'))
    const input = screen.getByPlaceholderText('What should we go deeper on?')
    fireEvent.change(input, { target: { value: 'add more examples' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onAction).toHaveBeenCalledWith('expand', 'add more examples')
  })

  it('pressing Escape closes the input without firing action', () => {
    const onAction = vi.fn()
    render(<SectionActionToolbar {...defaultProps} hasContent={true} onAction={onAction} />)
    fireEvent.click(screen.getByText('Expand'))
    expect(screen.getByPlaceholderText('What should we go deeper on?')).toBeTruthy()
    fireEvent.keyDown(screen.getByPlaceholderText('What should we go deeper on?'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('What should we go deeper on?')).toBeNull()
    expect(onAction).not.toHaveBeenCalled()
  })

  it('clicking a second action button switches the active input', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    fireEvent.click(screen.getByText('Expand'))
    expect(screen.getByPlaceholderText('What should we go deeper on?')).toBeTruthy()
    fireEvent.click(screen.getByText('Condense'))
    expect(screen.queryByPlaceholderText('What should we go deeper on?')).toBeNull()
    expect(screen.getByPlaceholderText('Anything that must stay in?')).toBeTruthy()
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

  it('shows History icon button', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} />)
    expect(screen.getByTitle('History')).not.toBeNull()
  })

  // Narrow / responsive dropdown tests (use forceNarrow prop to bypass ResizeObserver)
  it('in narrow mode shows Actions dropdown button instead of individual buttons', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} forceNarrow={true} />)
    expect(screen.getByText('Actions')).toBeTruthy()
    expect(screen.queryByText('Expand')).toBeNull()
    expect(screen.queryByText('Condense')).toBeNull()
    expect(screen.queryByText('Rewrite')).toBeNull()
  })

  it('in narrow mode clicking Actions opens dropdown with all three items', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} forceNarrow={true} />)
    fireEvent.click(screen.getByText('Actions'))
    expect(screen.getByText('Expand')).toBeTruthy()
    expect(screen.getByText('Condense')).toBeTruthy()
    expect(screen.getByText('Rewrite')).toBeTruthy()
  })

  it('in narrow mode clicking a dropdown item closes dropdown and opens inline input', () => {
    render(<SectionActionToolbar {...defaultProps} hasContent={true} forceNarrow={true} />)
    fireEvent.click(screen.getByText('Actions'))
    fireEvent.click(screen.getByText('Rewrite'))
    // dropdown closed
    expect(screen.queryByText('Expand')).toBeNull()
    // inline input opened
    expect(screen.getByPlaceholderText('What tone or angle are you going for?')).toBeTruthy()
  })
})
