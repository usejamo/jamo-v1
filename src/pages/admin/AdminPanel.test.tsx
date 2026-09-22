import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'

const invoke = vi.fn()
const from = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    functions: { invoke: (name: string, opts: unknown) => invoke(name, opts) },
    from: (table: string) => from(table),
  },
}))

const ORG = { id: 'org-1', name: 'Acme Clinical Research', slug: 'acme', plan: 'trial', created_at: '2026-01-01T00:00:00Z' }

function mockOrgsQuery(orgs: typeof ORG[] = [ORG]) {
  from.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return {
        select: () => ({
          order: () => Promise.resolve({ data: orgs, error: null }),
        }),
      }
    }
    throw new Error(`unexpected table ${table}`)
  })
}

const PREVIEW_OK = {
  preview: true,
  org: { id: ORG.id, name: ORG.name },
  counts: { members: 3, proposals: 68, invites: 2, chat_sessions: 21 },
  blocked: null,
}

async function renderPanel() {
  const { default: AdminPanel } = await import('./AdminPanel')
  render(<AdminPanel />)
}

async function openDeleteDialog() {
  const deleteButtons = await screen.findAllByRole('button', { name: /delete/i })
  fireEvent.click(deleteButtons[0])
  await screen.findByText(/type the organization/i)
}

describe('AdminPanel — delete organization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOrgsQuery()
    invoke.mockImplementation((name: string, opts: { body?: { preview?: boolean } }) => {
      if (name === 'admin-invites-lifecycle') {
        return Promise.resolve({ data: { invites: [] }, error: null })
      }
      if (name === 'admin-delete-org') {
        if (opts?.body?.preview) {
          return Promise.resolve({ data: PREVIEW_OK, error: null })
        }
        return Promise.resolve({
          data: {
            deleted: { org: ORG.name, members: 3, proposals: 68, invites: 2, chat_sessions: 21 },
            member_failures: [],
          },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })
  })

  it('disables confirm until the typed name matches exactly, then enables it', async () => {
    await renderPanel()
    await openDeleteDialog()

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('admin-delete-org', {
      body: { org_id: ORG.id, confirm_name: '', preview: true },
    }))

    const confirmButton = screen.getByRole('button', { name: /^delete organization$/i })
    expect(confirmButton).toBeDisabled()

    const input = screen.getByLabelText(/organization name/i)
    fireEvent.change(input, { target: { value: ORG.name } })
    expect(confirmButton).toBeEnabled()
  })

  it('leaves confirm disabled on a near-miss (trailing char / wrong case)', async () => {
    await renderPanel()
    await openDeleteDialog()
    await screen.findByLabelText(/organization name/i)

    const confirmButton = screen.getByRole('button', { name: /^delete organization$/i })
    const input = screen.getByLabelText(/organization name/i)

    fireEvent.change(input, { target: { value: ORG.name + 'x' } })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(input, { target: { value: ORG.name.toLowerCase() } })
    expect(confirmButton).toBeDisabled()
  })

  it('shows the blocked reason and offers no way to proceed, even with correct name typed', async () => {
    invoke.mockImplementation((name: string, opts: { body?: { preview?: boolean } }) => {
      if (name === 'admin-invites-lifecycle') return Promise.resolve({ data: { invites: [] }, error: null })
      if (name === 'admin-delete-org' && opts?.body?.preview) {
        return Promise.resolve({
          data: {
            preview: true,
            org: { id: ORG.id, name: ORG.name },
            counts: { members: 1, proposals: 0, invites: 0, chat_sessions: 0 },
            blocked: 'Cannot delete: admin@acme.com is a super_admin in this organization. Move them to another organization first.',
          },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    await renderPanel()
    const deleteButtons = await screen.findAllByRole('button', { name: /delete/i })
    fireEvent.click(deleteButtons[0])

    await screen.findByText(/is a super_admin in this organization/i)

    // No confirm input, and no enabled "delete" control of any kind inside the dialog.
    expect(screen.queryByLabelText(/organization name/i)).toBeNull()
    expect(screen.queryByRole('button', { name: /^delete organization$/i })).toBeNull()

    // Only Cancel is available.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeEnabled()

    expect(invoke).not.toHaveBeenCalledWith('admin-delete-org', expect.objectContaining({
      body: expect.not.objectContaining({ preview: true }),
    }))
  })

  it('confirms by invoking admin-delete-org with org_id + confirm_name and without preview', async () => {
    await renderPanel()
    await openDeleteDialog()
    await screen.findByLabelText(/organization name/i)

    const input = screen.getByLabelText(/organization name/i)
    fireEvent.change(input, { target: { value: ORG.name } })

    const confirmButton = screen.getByRole('button', { name: /^delete organization$/i })
    fireEvent.click(confirmButton)

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('admin-delete-org', {
        body: { org_id: ORG.id, confirm_name: ORG.name },
      })
    )

    // Dialog closes on success.
    await waitFor(() => expect(screen.queryByLabelText(/organization name/i)).toBeNull())
  })

  it('surfaces a server error and does not report success', async () => {
    invoke.mockImplementation((name: string, opts: { body?: { preview?: boolean } }) => {
      if (name === 'admin-invites-lifecycle') return Promise.resolve({ data: { invites: [] }, error: null })
      if (name === 'admin-delete-org') {
        if (opts?.body?.preview) return Promise.resolve({ data: PREVIEW_OK, error: null })
        return Promise.resolve({
          data: null,
          error: {
            context: {
              json: () => Promise.resolve({ error: 'Cannot delete: someone@acme.com is a super_admin in this organization. Move them to another organization first.' }),
            },
          },
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    await renderPanel()
    await openDeleteDialog()
    await screen.findByLabelText(/organization name/i)

    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: ORG.name } })
    fireEvent.click(screen.getByRole('button', { name: /^delete organization$/i }))

    await screen.findByText(/someone@acme.com is a super_admin/i)
    expect(screen.queryByText(/success/i)).toBeNull()
    // Dialog stays open on error — the confirm input is still present.
    expect(screen.getByLabelText(/organization name/i)).toBeInTheDocument()
  })

  it('does not present a clean success when member_failures is non-empty', async () => {
    invoke.mockImplementation((name: string, opts: { body?: { preview?: boolean } }) => {
      if (name === 'admin-invites-lifecycle') return Promise.resolve({ data: { invites: [] }, error: null })
      if (name === 'admin-delete-org') {
        if (opts?.body?.preview) return Promise.resolve({ data: PREVIEW_OK, error: null })
        return Promise.resolve({
          data: {
            deleted: { org: ORG.name, members: 3, proposals: 68, invites: 2, chat_sessions: 21 },
            member_failures: [{ user_id: 'u-9', error: 'User not found' }],
          },
          error: null,
        })
      }
      return Promise.resolve({ data: null, error: null })
    })

    await renderPanel()
    await openDeleteDialog()
    await screen.findByLabelText(/organization name/i)

    fireEvent.change(screen.getByLabelText(/organization name/i), { target: { value: ORG.name } })
    fireEvent.click(screen.getByRole('button', { name: /^delete organization$/i }))

    await screen.findByText(/member account.*fail|fail.*member account/i)
  })
})
