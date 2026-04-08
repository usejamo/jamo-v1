import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ComplianceFlag } from '../ComplianceFlag'
import type { ComplianceFlag as ComplianceFlagType } from '../../../types/workspace'

const warningFlag: ComplianceFlagType = {
  id: 'flag-1',
  section_key: 'executive_summary',
  type: 'warning',
  message: 'Section is too short (under 100 words)',
  source: 'rule',
}

const failFlag: ComplianceFlagType = {
  id: 'flag-2',
  section_key: 'budget',
  type: 'fail',
  message: 'Missing required budget breakdown',
  source: 'haiku',
}

describe('ComplianceFlag', () => {
  it('renders amber chip for warning type flag', () => {
    const { container } = render(<ComplianceFlag flag={warningFlag} />)
    const chip = container.querySelector('span')
    expect(chip).not.toBeNull()
    expect(chip!.className).toContain('amber')
  })

  it('renders red chip for fail type flag', () => {
    const { container } = render(<ComplianceFlag flag={failFlag} />)
    const chip = container.querySelector('span')
    expect(chip).not.toBeNull()
    expect(chip!.className).toContain('red')
  })

  it('displays flag message text from Haiku response', () => {
    render(<ComplianceFlag flag={failFlag} />)
    expect(screen.getByText('Missing required budget breakdown')).toBeTruthy()
  })
})
