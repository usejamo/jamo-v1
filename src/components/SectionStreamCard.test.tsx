import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SectionStreamCard, highlightPlaceholders } from './SectionStreamCard'
import type { SectionState } from '../types/generation'

function makeSection(overrides: Partial<SectionState> = {}): SectionState {
  return {
    id: 'sec-uuid-1',
    name: 'Understanding of the Study',
    position: 1,
    role: 'understanding',
    status: 'pending',
    liveText: '',
    finalContent: null,
    error: null,
    ...overrides,
  }
}

describe('SectionStreamCard', () => {
  it('renders section name', () => {
    render(<SectionStreamCard section={makeSection()} />)
    expect(screen.getByText('Understanding of the Study')).toBeTruthy()
  })

  it('shows "Pending" status badge when status is pending', () => {
    render(<SectionStreamCard section={makeSection({ status: 'pending' })} />)
    expect(screen.getByText('Pending')).toBeTruthy()
    // No live text area, no Regenerate button
    expect(screen.queryByText('Regenerate')).toBeNull()
  })

  it('shows live text area with blinking cursor when status is generating', () => {
    render(
      <SectionStreamCard
        section={makeSection({ status: 'generating', liveText: 'hello world' })}
      />
    )
    expect(screen.getByText(/hello world/)).toBeTruthy()
    // Blinking cursor character
    expect(screen.getByText('|')).toBeTruthy()
  })

  it('shows "Complete" badge and final content with placeholder highlight when status is complete', () => {
    render(
      <SectionStreamCard
        section={makeSection({
          status: 'complete',
          finalContent: 'The study phase is [PLACEHOLDER: study phase] pending.',
        })}
        onRegenerate={vi.fn()}
      />
    )
    expect(screen.getByText('Complete')).toBeTruthy()
    // Amber mark element exists
    const mark = document.querySelector('mark.bg-amber-100')
    expect(mark).toBeTruthy()
    expect(mark?.textContent).toBe('[PLACEHOLDER: study phase]')
  })

  it('shows error message and Retry button when status is error', () => {
    const onRetry = vi.fn()
    render(
      <SectionStreamCard
        section={makeSection({ status: 'error' })}
        onRetry={onRetry}
        onRegenerate={vi.fn()}
      />
    )
    expect(screen.getAllByText(/Generation failed/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy()
  })

  it('shows Regenerate button when status is complete', async () => {
    const onRegenerate = vi.fn()
    render(
      <SectionStreamCard
        section={makeSection({ status: 'complete', finalContent: 'Done.' })}
        onRegenerate={onRegenerate}
      />
    )
    const btn = screen.getByRole('button', { name: 'Regenerate' })
    expect(btn).toBeTruthy()
    await userEvent.click(btn)
    expect(onRegenerate).toHaveBeenCalledOnce()
  })

  it('does not show live text area or Regenerate button when status is pending', () => {
    render(<SectionStreamCard section={makeSection({ status: 'pending' })} />)
    // No blinking cursor — live text area hidden
    expect(screen.queryByText('|')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Regenerate' })).toBeNull()
  })
})

describe('highlightPlaceholders', () => {
  it('returns JSX with amber marks for placeholder patterns', () => {
    const { container } = render(<>{highlightPlaceholders('Before [PLACEHOLDER: foo] after')}</>)
    const mark = container.querySelector('mark')
    expect(mark).toBeTruthy()
    expect(mark?.textContent).toBe('[PLACEHOLDER: foo]')
  })

  it('returns plain text when no placeholders present', () => {
    const { container } = render(<>{highlightPlaceholders('No markers here')}</>)
    expect(container.querySelector('mark')).toBeNull()
    expect(container.textContent).toBe('No markers here')
  })
})
