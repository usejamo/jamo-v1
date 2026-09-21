import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AcceptInviteCmp from './AcceptInvite'

const invoke = vi.fn().mockResolvedValue({ error: null })
const updateUser = vi.fn().mockResolvedValue({ error: null })
const getSession = vi.fn().mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
const verifyOtp = vi.fn().mockResolvedValue({ error: null })
const navigate = vi.fn()
const refreshProfile = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      updateUser: (a: unknown) => updateUser(a),
      verifyOtp: (a: unknown) => verifyOtp(a),
    },
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
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ refreshProfile }),
}))

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
    expect(refreshProfile).toHaveBeenCalled()
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
    const form = screen.getByLabelText('Password').closest('form') as HTMLFormElement
    fireEvent.submit(form)

    await screen.findByText(/enter your name/i)
    expect(updateUser).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('blocks submit for a whitespace-only name', async () => {
    const { default: AcceptInvite } = await import('./AcceptInvite')
    render(
      <MemoryRouter>
        <AcceptInvite />
      </MemoryRouter>
    )
    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    const form = screen.getByLabelText('Password').closest('form') as HTMLFormElement
    fireEvent.submit(form)

    await screen.findByText(/enter your name/i)
    expect(updateUser).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })
})

describe('AcceptInvite — token_hash link (scanner-safe path)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invoke.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ error: null })
    refreshProfile.mockResolvedValue(undefined)
  })

  function renderWithToken() {
    return render(
      <MemoryRouter initialEntries={['/accept-invite?token_hash=tok123&type=invite']}>
        <AcceptInviteCmp />
      </MemoryRouter>
    )
  }

  it('verifies the token on submit, not on page load', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    renderWithToken()
    const name = await screen.findByLabelText(/full name/i)

    // The whole point: merely opening the page must not spend the token.
    expect(verifyOtp).not.toHaveBeenCalled()

    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'invite' })
    )
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' }))
  })

  it('does not set a password when the token is already spent', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    renderWithToken()

    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await screen.findByText(/no longer valid/i)
    expect(updateUser).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('skips verifyOtp when a session already exists (old-style link)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <AcceptInviteCmp />
      </MemoryRouter>
    )
    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('shows the invalid-link state with a sign-in exit when there is neither session nor token', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/accept-invite']}>
        <AcceptInviteCmp />
      </MemoryRouter>
    )
    await screen.findByText(/no longer valid/i)
    expect(screen.queryByLabelText(/full name/i)).toBeNull()
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('verifies the token even when a session already exists (the token wins)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'someone-else' } } } })
    renderWithToken()

    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'invite' })
    )
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'secret123' }))
    expect(verifyOtp.mock.invocationCallOrder[0]).toBeLessThan(
      updateUser.mock.invocationCallOrder[0]
    )
  })

  it('does not overwrite the signed-in user when the token fails to verify with a session present', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'someone-else' } } } })
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    renderWithToken()

    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await screen.findByText(/no longer valid/i)
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok123', type: 'invite' })
    expect(updateUser).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
  })

  it('lets a retry after a failed updateUser proceed without re-spending the token', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    updateUser
      .mockResolvedValueOnce({ error: { message: 'Password should be at least 6 characters' } })
      .mockResolvedValueOnce({ error: null })
    renderWithToken()

    const name = await screen.findByLabelText(/full name/i)
    fireEvent.change(name, { target: { value: 'Ada Lovelace' } })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await screen.findByText(/at least 6 characters/i)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'secret123' } })
    fireEvent.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(2))
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/no longer valid/i)).toBeNull()
  })
})
