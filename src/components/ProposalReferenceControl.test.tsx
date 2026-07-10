import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ProposalReferenceControl } from './ProposalReferenceControl'

// 14.7-05: isolated component test per plan Task 2 preference (ProposalDetail's
// mount weight makes an integration test impractical here — see SUMMARY).

vi.mock('../lib/supabase', () => ({
  supabase: { rpc: vi.fn().mockResolvedValue({ error: null }) },
}))

describe('ProposalReferenceControl', () => {
  it('renders nothing for a draft proposal (no include-path)', () => {
    const { container } = render(
      <ProposalReferenceControl proposalId="p1" status="draft" value={null} />
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the tri-state control for a non-draft proposal', () => {
    render(<ProposalReferenceControl proposalId="p1" status="submitted" value={null} />)
    expect(screen.getByText('Follow settings')).toBeInTheDocument()
  })

  it('opens the tri-state options and calls set_reference_override on select', async () => {
    const { supabase } = await import('../lib/supabase')
    render(<ProposalReferenceControl proposalId="p1" status="won" value={null} />)

    await userEvent.click(screen.getByRole('button', { name: /use as reference/i }))
    await userEvent.click(screen.getByRole('button', { name: /always include/i }))

    await waitFor(() => {
      expect(supabase.rpc).toHaveBeenCalledWith('set_reference_override', {
        p_proposal_id: 'p1',
        p_value: true,
      })
    })
    expect(await screen.findByText('Always include')).toBeInTheDocument()
  })

  it('is disabled for role=user (passed via disabled prop)', () => {
    render(<ProposalReferenceControl proposalId="p1" status="lost" value={null} disabled />)
    expect(screen.getByRole('button', { name: /use as reference/i })).toBeDisabled()
  })

  it('reverts and shows an error when the RPC is not authorized', async () => {
    const { supabase } = await import('../lib/supabase')
    ;(supabase.rpc as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      error: { message: 'not authorized' },
    })
    render(<ProposalReferenceControl proposalId="p1" status="submitted" value={null} />)

    await userEvent.click(screen.getByRole('button', { name: /use as reference/i }))
    await userEvent.click(screen.getByRole('button', { name: /never include/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('Follow settings')).toBeInTheDocument()
  })
})
