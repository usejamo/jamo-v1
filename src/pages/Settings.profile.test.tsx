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

function openNameEditor() {
  fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
}

describe('Settings → Profile tab → name editing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    updateEq.mockResolvedValue({ error: null })
    signInWithPassword.mockResolvedValue({ error: null })
    updateUser.mockResolvedValue({ error: null })
    refreshProfile.mockResolvedValue(undefined)
  })

  it('renders the name as text at rest, with no input in the DOM', () => {
    render(<Settings />)
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByText('Old Name')).toBeInTheDocument()
  })

  it('saves a new name and updates ONLY full_name', async () => {
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ full_name: 'New Name' }))
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ role: expect.anything() }))
    expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ org_id: expect.anything() }))
    expect(updateEq).toHaveBeenCalledWith('user_id', 'u1')
  })

  it('shows an error and does not call update for a whitespace-only name', async () => {
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await screen.findByText(/cannot be empty/i)
    expect(update).not.toHaveBeenCalled()
  })

  it('trims the name before saving', async () => {
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '  Trimmed Name  ' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(update).toHaveBeenCalledWith({ full_name: 'Trimmed Name' }))
  })

  it('surfaces an error and does not claim success when the update fails', async () => {
    updateEq.mockResolvedValueOnce({ error: { message: 'boom' } })
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await screen.findByText(/boom/i)
    expect(screen.queryByText(/name updated/i)).not.toBeInTheDocument()
    expect(refreshProfile).not.toHaveBeenCalled()
  })

  it('calls refreshProfile after a successful name save', async () => {
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(refreshProfile).toHaveBeenCalled())
  })

  it('restores the stored value when the name editor is cancelled', () => {
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Something Else' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Editor collapsed back to rest state, showing the stored value, not the typed one.
    expect(screen.getByText('Old Name')).toBeInTheDocument()
    expect(screen.queryByText('Something Else')).not.toBeInTheDocument()

    openNameEditor()
    expect((screen.getByLabelText('Name') as HTMLInputElement).value).toBe('Old Name')
  })

  it('returns to rest state and shows the confirmation after a successful name save', async () => {
    render(<Settings />)
    openNameEditor()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await screen.findByText(/name updated/i)
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument()
    expect(screen.getByText('New Name')).toBeInTheDocument()
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

  function openPasswordForm() {
    fireEvent.click(screen.getByRole('button', { name: /^change password$/i }))
  }

  function fillPasswordForm(current: string, next: string, confirm: string) {
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: current } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: next } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: confirm } })
    fireEvent.click(screen.getByRole('button', { name: /^update password$/i }))
  }

  it('renders no password inputs in the DOM at rest', () => {
    render(<Settings />)
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/confirm new password/i)).not.toBeInTheDocument()
  })

  it('shows "Current password is incorrect" and never calls updateUser on a wrong current password', async () => {
    signInWithPassword.mockResolvedValueOnce({ error: { message: 'Invalid login credentials' } })
    render(<Settings />)
    openPasswordForm()
    fillPasswordForm('wrongpass', 'newpassword', 'newpassword')

    await screen.findByText(/current password is incorrect/i)
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('verifies the current password BEFORE changing it on the happy path', async () => {
    render(<Settings />)
    openPasswordForm()
    fillPasswordForm('oldpassword', 'newpassword', 'newpassword')

    await waitFor(() => expect(updateUser).toHaveBeenCalled())
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.c', password: 'oldpassword' })
    expect(signInWithPassword.mock.invocationCallOrder[0]).toBeLessThan(
      updateUser.mock.invocationCallOrder[0]
    )
  })

  it('blocks submit when new and confirm passwords do not match', async () => {
    render(<Settings />)
    openPasswordForm()
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
    openPasswordForm()
    fillPasswordForm('oldpassword', 'oldpassword', 'oldpassword')

    await screen.findByText(/must be different/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('blocks submit when the new password is shorter than 6 characters', async () => {
    render(<Settings />)
    openPasswordForm()
    fillPasswordForm('oldpassword', 'abc', 'abc')

    await screen.findByText(/at least 6 characters/i)
    expect(signInWithPassword).not.toHaveBeenCalled()
    expect(updateUser).not.toHaveBeenCalled()
  })

  it('calls updateUser with the new password and clears the fields on success', async () => {
    render(<Settings />)
    openPasswordForm()
    fillPasswordForm('oldpassword', 'newpassword', 'newpassword')

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'newpassword' }))
    // The form collapses on success (see the dedicated collapse test below), so
    // the cleared-fields assertion is verified by reopening it.
    await screen.findByText(/password updated/i)
    openPasswordForm()
    expect((screen.getByLabelText(/current password/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/^new password/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/confirm new password/i) as HTMLInputElement).value).toBe('')
  })

  it('clears all three fields when the password form is cancelled', () => {
    render(<Settings />)
    openPasswordForm()
    fireEvent.change(screen.getByLabelText(/current password/i), { target: { value: 'abc' } })
    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'def' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'def' } })
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }))

    // Collapsed back to rest state.
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()

    openPasswordForm()
    expect((screen.getByLabelText(/current password/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/^new password/i) as HTMLInputElement).value).toBe('')
    expect((screen.getByLabelText(/confirm new password/i) as HTMLInputElement).value).toBe('')
  })

  it('collapses the form and shows the confirmation after a successful password change', async () => {
    render(<Settings />)
    openPasswordForm()
    fillPasswordForm('oldpassword', 'newpassword', 'newpassword')

    await screen.findByText(/password updated/i)
    expect(screen.queryByLabelText(/current password/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^new password/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/confirm new password/i)).not.toBeInTheDocument()
  })
})
