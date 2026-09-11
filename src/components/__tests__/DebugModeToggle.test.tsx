import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DebugModeToggle, DEBUG_MODE_STORAGE_KEY } from '../DebugModeToggle'

// The debug toggle used to be rendered unconditionally in ProposalsList, so
// clients and org admins could see and flip it. It is super_admin only now.

const mockUseAuth = vi.fn()
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

const asRole = (role: string | null) =>
  mockUseAuth.mockReturnValue({ profile: role ? { role } : null })

beforeEach(() => {
  localStorage.clear()
  mockUseAuth.mockReset()
})

describe('DebugModeToggle visibility', () => {
  it('renders for a super_admin', () => {
    asRole('super_admin')
    render(<DebugModeToggle />)
    expect(screen.getByTestId('debug-mode-toggle')).toBeTruthy()
  })

  it('is hidden from an org admin', () => {
    // The specific regression reported: admins could see it.
    asRole('admin')
    render(<DebugModeToggle />)
    expect(screen.queryByTestId('debug-mode-toggle')).toBeNull()
  })

  it('is hidden from a regular user', () => {
    asRole('user')
    render(<DebugModeToggle />)
    expect(screen.queryByTestId('debug-mode-toggle')).toBeNull()
  })

  it('is hidden from a client', () => {
    asRole('client')
    render(<DebugModeToggle />)
    expect(screen.queryByTestId('debug-mode-toggle')).toBeNull()
  })

  it('is hidden while the profile has not loaded yet', () => {
    // Safe direction: a super_admin sees it a beat late rather than everyone
    // glimpsing it and it disappearing.
    asRole(null)
    render(<DebugModeToggle />)
    expect(screen.queryByTestId('debug-mode-toggle')).toBeNull()
  })
})

describe('DebugModeToggle behaviour', () => {
  it('turns debug mode on and persists the flag', () => {
    asRole('super_admin')
    render(<DebugModeToggle />)
    fireEvent.click(screen.getByTestId('debug-mode-toggle'))
    expect(localStorage.getItem(DEBUG_MODE_STORAGE_KEY)).toBe('true')
    expect(screen.getByTestId('debug-mode-toggle').textContent).toBe('Debug ON')
  })

  it('turns debug mode off and clears the flag', () => {
    localStorage.setItem(DEBUG_MODE_STORAGE_KEY, 'true')
    asRole('super_admin')
    render(<DebugModeToggle />)
    expect(screen.getByTestId('debug-mode-toggle').textContent).toBe('Debug ON')
    fireEvent.click(screen.getByTestId('debug-mode-toggle'))
    expect(localStorage.getItem(DEBUG_MODE_STORAGE_KEY)).toBeNull()
    expect(screen.getByTestId('debug-mode-toggle').textContent).toBe('Debug')
  })

  it('reflects an already-set flag on mount', () => {
    localStorage.setItem(DEBUG_MODE_STORAGE_KEY, 'true')
    asRole('super_admin')
    render(<DebugModeToggle />)
    expect(screen.getByTestId('debug-mode-toggle').textContent).toBe('Debug ON')
  })

  it('does not leave the flag set for a non-super_admin who had it on', () => {
    // Hiding the control must not silently keep generation in debug mode for a
    // user who can no longer turn it off. The flag is read by
    // useProposalGeneration, so a stranded 'true' would shorten their output
    // with no visible way to undo it.
    localStorage.setItem(DEBUG_MODE_STORAGE_KEY, 'true')
    asRole('admin')
    render(<DebugModeToggle />)
    expect(localStorage.getItem(DEBUG_MODE_STORAGE_KEY)).toBeNull()
  })
})
