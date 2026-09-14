import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const updateUser = vi.fn().mockResolvedValue({ error: null })
const verifyOtp = vi.fn().mockResolvedValue({ error: null })
const getSession = vi.fn().mockResolvedValue({ data: { session: null } })
const navigate = vi.fn()

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => getSession(),
      updateUser: (a: unknown) => updateUser(a),
      verifyOtp: (a: unknown) => verifyOtp(a),
    },
  },
}))
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigate }
})

import ResetPassword from './ResetPassword'

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newsecret1' } })
  fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newsecret1' } })
  fireEvent.click(screen.getByRole('button', { name: /set new password/i }))
}

describe('ResetPassword', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateUser.mockResolvedValue({ error: null })
    verifyOtp.mockResolvedValue({ error: null })
  })

  it('does not verify the token on page load', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('verifies with type recovery on submit, then sets the password', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fillAndSubmit()

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'rec123', type: 'recovery' })
    )
    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newsecret1' }))
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/'))
  })

  it('does not set a password when the token is already spent', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired or is invalid' } })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fillAndSubmit()

    await screen.findByText(/no longer valid/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('skips verifyOtp when a session already exists (old-style link)', async () => {
    getSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } })
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fillAndSubmit()

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    expect(verifyOtp).not.toHaveBeenCalled()
  })

  it('shows the invalid-link state with a request-new-link exit', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    render(
      <MemoryRouter initialEntries={['/reset-password']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByText(/no longer valid/i)
    expect(screen.queryByLabelText('Password')).toBeNull()
    expect(screen.getByRole('link', { name: /request a new link/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    )
  })

  it('lets a retry after a failed updateUser proceed without re-spending the token', async () => {
    getSession.mockResolvedValue({ data: { session: null } })
    updateUser
      .mockResolvedValueOnce({ error: { message: 'Password should be at least 6 characters' } })
      .mockResolvedValueOnce({ error: null })
    render(
      <MemoryRouter initialEntries={['/reset-password?token_hash=rec123&type=recovery']}>
        <ResetPassword />
      </MemoryRouter>
    )
    await screen.findByLabelText('Password')
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'abc' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))

    await screen.findByText(/at least 6 characters/i)

    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'newsecret1' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newsecret1' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))

    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(2))
    expect(verifyOtp).toHaveBeenCalledTimes(1)
    expect(screen.queryByText(/no longer valid/i)).toBeNull()
  })
})
