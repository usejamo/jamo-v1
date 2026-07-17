import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const single = vi.fn().mockResolvedValue({ data: { name: 'Acme CRO' }, error: null })

vi.mock('../lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ single }) }) }) },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ profile: { org_id: 'org1' }, user: { email: 'a@b.c' } }),
}))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
}))

import Settings from './Settings'

describe('Settings → General tab', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows the real org name and drops the mockup fields', async () => {
    render(<Settings />)
    fireEvent.click(screen.getByRole('button', { name: 'General' }))

    expect(await screen.findByDisplayValue('Acme CRO')).toBeInTheDocument()
    expect(screen.queryByText('Default Currency')).not.toBeInTheDocument()
    expect(screen.queryByText('Tax / VAT ID')).not.toBeInTheDocument()
    expect(screen.queryByText('Timezone')).not.toBeInTheDocument()
  })
})
