import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

// 14.7-05: ReferenceLibraryTab — 3 org master toggles, admin-gated, RPC-wired.
// Wave 0 gap (no Settings*test* file existed) — this is the first.

const mockOrgRow = { learn_from_won: true, learn_from_submitted: false, learn_from_lost: false }

function makeMockSupabase(rpcMock: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ error: null })) {
  return {
    supabase: {
      from: (table: string) => {
        if (table === 'organizations') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: mockOrgRow, error: null }),
              }),
            }),
          }
        }
        return { select: () => ({}) }
      },
      rpc: rpcMock,
    },
  }
}

describe('ReferenceLibraryTab (admin)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../context/AuthContext', () => ({
      useAuth: () => ({ profile: { org_id: 'org-1', role: 'admin' } }),
    }))
  })

  it('renders 3 toggles with the verbatim labels and reflects org defaults', async () => {
    vi.doMock('../../lib/supabase', () => makeMockSupabase())
    const { ReferenceLibraryTab } = await import('./ReferenceLibraryTab')
    render(<ReferenceLibraryTab />)

    expect(await screen.findByText('Learn from won proposals')).toBeInTheDocument()
    expect(screen.getByText('Learn from submitted (in-flight) proposals')).toBeInTheDocument()
    expect(screen.getByText('Learn from lost proposals')).toBeInTheDocument()

    const switches = screen.getAllByRole('switch')
    expect(switches).toHaveLength(3)

    await waitFor(() => {
      expect(switches[0]).toHaveAttribute('aria-checked', 'true')
      expect(switches[1]).toHaveAttribute('aria-checked', 'false')
      expect(switches[2]).toHaveAttribute('aria-checked', 'false')
    })
  })

  it('calls set_org_learning_switches with the full trio on toggle change', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: null })
    vi.doMock('../../lib/supabase', () => makeMockSupabase(rpcMock))
    const { ReferenceLibraryTab } = await import('./ReferenceLibraryTab')
    render(<ReferenceLibraryTab />)

    const switches = await screen.findAllByRole('switch')
    await waitFor(() => expect(switches[1]).toHaveAttribute('aria-checked', 'false'))

    await userEvent.click(switches[1])

    await waitFor(() => {
      expect(rpcMock).toHaveBeenCalledWith('set_org_learning_switches', {
        p_learn_from_won: true,
        p_learn_from_submitted: true,
        p_learn_from_lost: false,
      })
    })
  })

  it('reverts the optimistic toggle and shows an error when the RPC fails', async () => {
    const rpcMock = vi.fn().mockResolvedValue({ error: { message: 'not authorized' } })
    vi.doMock('../../lib/supabase', () => makeMockSupabase(rpcMock))
    const { ReferenceLibraryTab } = await import('./ReferenceLibraryTab')
    render(<ReferenceLibraryTab />)

    const switches = await screen.findAllByRole('switch')
    await waitFor(() => expect(switches[1]).toHaveAttribute('aria-checked', 'false'))

    await userEvent.click(switches[1])

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(switches[1]).toHaveAttribute('aria-checked', 'false')
  })
})

describe('ReferenceLibraryTab (non-admin)', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.doMock('../../context/AuthContext', () => ({
      useAuth: () => ({ profile: { org_id: 'org-1', role: 'user' } }),
    }))
    vi.doMock('../../lib/supabase', () => makeMockSupabase())
  })

  it('renders disabled toggles for role=user', async () => {
    const { ReferenceLibraryTab } = await import('./ReferenceLibraryTab')
    render(<ReferenceLibraryTab />)

    const switches = await screen.findAllByRole('switch')
    expect(switches).toHaveLength(3)
    switches.forEach(s => expect(s).toHaveAttribute('aria-disabled', 'true'))

    expect(screen.getByText(/only org admins can change/i)).toBeInTheDocument()
  })
})
