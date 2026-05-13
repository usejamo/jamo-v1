import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ComplianceCard } from './ComplianceCard'
import type { CompliancePayload } from '../../types/chat'

const basePayload: CompliancePayload = {
  section_key: 'sec-1',
  passes: false,
  issues: [
    { severity: 'critical', message: 'Missing required disclosure', rule_reference: 'Rule 1.1' },
    { severity: 'warning', message: 'Incomplete address', rule_reference: 'Rule 2.3' },
    { severity: 'info', message: 'Optional field recommended', rule_reference: 'Rule 3.0' },
  ],
  summary: 'Section has compliance issues.',
}

describe('ComplianceCard', () => {
  it('renders red dot for critical severity flag', () => {
    const { container } = render(<ComplianceCard payload={basePayload} />)
    const dots = container.querySelectorAll('.bg-red-500')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('renders amber dot for warning severity flag', () => {
    const { container } = render(<ComplianceCard payload={basePayload} />)
    const dots = container.querySelectorAll('.bg-amber-400')
    expect(dots.length).toBeGreaterThan(0)
  })

  it('dismiss button calls onDismiss with flag id', () => {
    const onDismiss = vi.fn()
    render(<ComplianceCard payload={basePayload} onDismiss={onDismiss} />)
    const buttons = screen.getAllByRole('button', { name: /dismiss flag/i })
    fireEvent.click(buttons[0])
    expect(onDismiss).toHaveBeenCalledWith(0)
  })

  it('dismissed row shows opacity-40', () => {
    const { container } = render(
      <ComplianceCard payload={basePayload} onDismiss={() => {}} dismissedIndices={[1]} />
    )
    const rows = container.querySelectorAll('.opacity-40')
    expect(rows.length).toBe(1)
  })
})
