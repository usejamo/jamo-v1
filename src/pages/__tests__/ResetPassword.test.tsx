import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const mockUpdateUser = vi.fn().mockResolvedValue({ data: { user: {} }, error: null })
const mockGetSession = vi.fn().mockResolvedValue({ data: { session: { user: {} } }, error: null })

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: mockUpdateUser,
      getSession: mockGetSession,
    },
  },
}))

describe('ResetPassword page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUpdateUser.mockResolvedValue({ data: { user: {} }, error: null })
    mockGetSession.mockResolvedValue({ data: { session: { user: {} } }, error: null })
  })

  it('renders a password input and a "Set New Password" button', async () => {
    const { default: ResetPassword } = await import('../ResetPassword')
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /set new password/i })).toBeInTheDocument()
  })

  it('shows a validation error and does NOT call updateUser when passwords do not match', async () => {
    const { default: ResetPassword } = await import('../ResetPassword')
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'differentPassword' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))

    await waitFor(() => {
      expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()
    })
    expect(mockUpdateUser).not.toHaveBeenCalled()
  })

  it('calls supabase.auth.updateUser with the new password when passwords match', async () => {
    const { default: ResetPassword } = await import('../ResetPassword')
    render(
      <MemoryRouter>
        <ResetPassword />
      </MemoryRouter>
    )

    await waitFor(() => expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'newSecurePass1' } })
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'newSecurePass1' } })
    fireEvent.click(screen.getByRole('button', { name: /set new password/i }))

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledTimes(1)
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'newSecurePass1' })
    })
  })
})
