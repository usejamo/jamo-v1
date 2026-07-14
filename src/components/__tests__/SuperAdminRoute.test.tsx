import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const mockUseAuth = vi.fn()

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => mockUseAuth(),
}))

async function renderGuarded() {
  const { SuperAdminRoute } = await import('../SuperAdminRoute')
  render(
    <MemoryRouter initialEntries={['/admin']}>
      <Routes>
        <Route path="/" element={<div>Home Page</div>} />
        <Route element={<SuperAdminRoute />}>
          <Route path="/admin" element={<div>Admin Panel</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('SuperAdminRoute', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the Loading state while loading, without redirecting', async () => {
    mockUseAuth.mockReturnValue({ profile: null, loading: true })
    await renderGuarded()

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
    expect(screen.queryByText('Home Page')).not.toBeInTheDocument()
  })

  it('renders the Outlet when profile.role is super_admin', async () => {
    mockUseAuth.mockReturnValue({ profile: { role: 'super_admin' }, loading: false })
    await renderGuarded()

    expect(screen.getByText('Admin Panel')).toBeInTheDocument()
  })

  it('redirects to / when profile.role is admin', async () => {
    mockUseAuth.mockReturnValue({ profile: { role: 'admin' }, loading: false })
    await renderGuarded()

    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('redirects to / when profile.role is user', async () => {
    mockUseAuth.mockReturnValue({ profile: { role: 'user' }, loading: false })
    await renderGuarded()

    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })

  it('redirects to / when there is no profile', async () => {
    mockUseAuth.mockReturnValue({ profile: null, loading: false })
    await renderGuarded()

    expect(screen.getByText('Home Page')).toBeInTheDocument()
    expect(screen.queryByText('Admin Panel')).not.toBeInTheDocument()
  })
})
