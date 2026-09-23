import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const updateEq = vi.fn().mockResolvedValue({ error: null })
const update = vi.fn(() => ({ eq: updateEq }))
const signInWithPassword = vi.fn().mockResolvedValue({ error: null })
const updateUser = vi.fn().mockResolvedValue({ error: null })
const refreshProfile = vi.fn().mockResolvedValue(undefined)

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ update }),
    auth: {
      signInWithPassword: (a: unknown) => signInWithPassword(a),
      updateUser: (a: unknown) => updateUser(a),
    },
  },
}))
vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@b.c' },
    profile: { full_name: 'Old Name', role: 'user', org_id: 'org1' },
    refreshProfile,
  }),
}))
vi.mock('react-router-dom', () => ({
  useSearchParams: () => [new URLSearchParams(''), vi.fn()],
}))

import Settings from './Settings'

describe('Settings → Profile tab → name editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateEq.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    refreshProfile.mockResolvedValue(undefined)
  })

  it('saves a new name and updates ONLY full_name', async () => {
    render(<Settings />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ full_name: 'New Name' }))
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ role: expect.anything() }))
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ org_id: expect.anything() }))
    expect(updateEq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('shows an error and does not call update for a whitespace-only name', async () => {
    render(<Settings />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await screen.findByText(/cannot be empty/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('trims the name before saving', async () => {
    render(<Settings />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Trimmed Name  ' } })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ full_name: 'Trimmed Name' }))
  })

  it('surfaces an error and does not claim success when the update fails', async () => {
    updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })
    render(<Settings />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await screen.findByText(/boom/i)
    expect(screen.queryByText(/name updated/i)).not.toBeInTheDocument()
    expect(refreshProfile).not.toHaveBeenCalled()
  })

  it('calls refreshProfile after a successful name save', async () => {
    render(<Settings />)
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /save name/i }))

    await waitFor(() => expect(refreshProfile).toHaveBeenCalled())
  })
})

describe('Settings → Profile tab → change password', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateEq.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    refreshProfile.mockResolvedValue(undefined)
  })

  function fillPasswordForm(current: string, next: string, confirm: string) {
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: current } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: next } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: confirm } })
    fireEvent.click(screen.getByRole('button', { name: /change password/i }))
  }

  it('shows "Current password is incorrect" and never calls updateUser on a wrong current password', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    render(<Settings />)
    fillPasswordForm('wrongpass', 'newpassword', 'newpassword')

    await screen.findByText(/current password is incorrect/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('verifies the current password BEFORE changing it on the happy path', async () => {
    render(<Settings />)
    fillPasswordForm('oldpassword', 'newpassword', 'newpassword')

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'oldpassword' })
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      updateUser.mock.invocationCallOrder[0]
    )
  })

  it('blocks submit when new and confirm passwords do not match', async () => {
    render(<Settings />)
    fillPasswordForm('oldpassword', 'newpassword', 'different')

    await screen.findByText(/do not match/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('blocks submit when the new password equals the current one', async () => {
    // Without this, signInWithPassword would succeed and updateUser would be
    // called to set the password to the value it already has — a no-op the
    // user would see reported as a successful change.
    render(<Settings />)
    fillPasswordForm('oldpassword', 'oldpassword', 'oldpassword')

    await screen.findByText(/must be different/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('blocks submit when the new password is shorter than 6 characters', async () => {
    render(<Settings />)
    fillPasswordForm('oldpassword', 'abc', 'abc')

    await screen.findByText(/at least 6 characters/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('calls updateUser with the new password and clears the fields on success', async () => {
    render(<Settings />)
    const current = screen.getByLabelText(/current password/i) as HTMLInputElement
    const next = screen.getByLabelText(/^new password/i) as HTMLInputElement
    const confirm = screen.getByLabelText(/confirm new password/i) as HTMLInputElement

    fillPasswordForm('oldpassword', 'newpassword', 'newpassword')

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword' }))
    await waitFor(() => {
      expect(current.value).toBe('')
      expect(next.value).toBe('')
      expect(confirm.value).toBe('')
    })
  })
})
