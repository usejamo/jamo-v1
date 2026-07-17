import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const invoke = vi.fn().mockResolvedValue({ error: null })
const updateUser = vi.fn().mockResolvedValue({ error: null })
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
const navigate = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: { getSession: () => getSession(), updateUser: (a: unknown) => updateUser(a) },
    functions: { invoke: (name: string, opts: unknown) => invoke(name, opts) },
  },
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigate,
  }
})

describe('AcceptInvite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('collects a name and passes it to accept-invite', async () => {
    const { default: AcceptInvite } = await import('./AcceptInvite')
    render(
      <MemoryRouter>
        <AcceptInvite />
      </MemoryRouter>
    )
    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' }))
    expect(invoke).toHaveBeenCalledWith('accept-invite', { body: { full_name: 'Ada Lovelace' } })
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('blocks submit and shows an error when the name is empty', async () => {
    const { default: AcceptInvite } = await import('./AcceptInvite')
    render(
      <MemoryRouter>
        <AcceptInvite />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await screen.findByText(/enter your name/i)
    expect(updateUser).not.toHaveBeenCalled()
  })
})
