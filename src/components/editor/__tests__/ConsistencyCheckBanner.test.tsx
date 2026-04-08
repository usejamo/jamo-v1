import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ConsistencyCheckBanner } from '../ConsistencyCheckBanner'
import type { ConsistencyFlag } from '../../../types/workspace'

const flags: ConsistencyFlag[] = [
  { id: 'cf-1', message: 'Budget and timeline are inconsistent', sections_involved: ['budget', 'timeline'] },
  { id: 'cf-2', message: 'Scope mismatch between sections', sections_involved: ['scope'] },
]

describe('ConsistencyCheckBanner', () => {
  it('renders full-width amber banner with Cross-Section Review heading', () => {
    render(<ConsistencyCheckBanner flags={flags} onDismiss={vi.fn()} />)
    expect(screen.getByText('Cross-Section Review')).toBeTruthy()
  })

  it('displays bulleted list of consistency flags', () => {
    render(<ConsistencyCheckBanner flags={flags} onDismiss={vi.fn()} />)
    expect(screen.getByText('Budget and timeline are inconsistent')).toBeTruthy()
    expect(screen.getByText('Scope mismatch between sections')).toBeTruthy()
  })

  it('dismiss button removes the banner', () => {
    const onDismiss = vi.fn()
    render(<ConsistencyCheckBanner flags={flags} onDismiss={onDismiss} />)
    const dismissBtn = screen.getByLabelText('Dismiss consistency check banner')
    fireEvent.click(dismissBtn)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('does not render when there are no consistency flags', () => {
    const { container } = render(<ConsistencyCheckBanner flags={[]} onDismiss={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})
