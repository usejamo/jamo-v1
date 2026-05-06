import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SalesforceConnection } from '../src/components/SalesforceConnection'

// Inline mock — NOT dynamic import (STATE.md: dynamic import OOMs on full supabase-js)
vi.mock('../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    }),
    functions: {
      invoke: vi.fn(),
    },
  },
}))

vi.mock('../src/context/AuthContext', () => ({
  useAuth: vi.fn(() => ({ profile: { org_id: 'test-org-id' } })),
}))

vi.mock('react-router-dom', () => ({
  useSearchParams: vi.fn(() => [new URLSearchParams(), vi.fn()]),
}))

// Helpers to re-import mocks after vi.mock hoisting
import { supabase } from '../src/lib/supabase'
import { useAuth } from '../src/context/AuthContext'
import { useSearchParams } from 'react-router-dom'

const mockSupabase = supabase as unknown as {
  from: ReturnType<typeof vi.fn>
  functions: { invoke: ReturnType<typeof vi.fn> }
}
const mockUseAuth = useAuth as ReturnType<typeof vi.fn>
const mockUseSearchParams = useSearchParams as ReturnType<typeof vi.fn>

function setMaybeSingleResult(data: unknown, error: unknown = null) {
  mockSupabase.from.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data, error }),
      }),
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockUseAuth.mockReturnValue({ profile: { org_id: 'test-org-id' } })
  mockUseSearchParams.mockReturnValue([new URLSearchParams(), vi.fn()])
  setMaybeSingleResult(null, null)
})

describe('SalesforceConnection', () => {
  it('renders disconnected state with Production/Sandbox radio and Connect Salesforce button', async () => {
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByText('Connect Salesforce')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Production')).toBeInTheDocument()
    expect(screen.getByLabelText('Sandbox')).toBeInTheDocument()
  })

  it('defaults to Production radio selected', async () => {
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByText('Connect Salesforce')).toBeInTheDocument()
    })
    const productionRadio = screen.getByLabelText('Production') as HTMLInputElement
    expect(productionRadio.checked).toBe(true)
    const sandboxRadio = screen.getByLabelText('Sandbox') as HTMLInputElement
    expect(sandboxRadio.checked).toBe(false)
  })

  it('renders connected state with sf_username and Disconnect button', async () => {
    setMaybeSingleResult({ sf_username: 'admin@test.com', is_sandbox: false })
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByText('admin@test.com')).toBeInTheDocument()
    })
    expect(screen.getByText('Disconnect')).toBeInTheDocument()
  })

  it('renders Connected status badge with green dot in connected state', async () => {
    setMaybeSingleResult({ sf_username: 'admin@test.com', is_sandbox: false })
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByText('Connected')).toBeInTheDocument()
    })
    expect(screen.getByLabelText('Salesforce connected')).toBeInTheDocument()
  })

  it('renders inline error banner when sf_error=user_denied query param is present', async () => {
    mockUseSearchParams.mockReturnValue([new URLSearchParams('sf_error=user_denied'), vi.fn()])
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Salesforce authorization was cancelled. Please try again.')
    ).toBeInTheDocument()
  })

  it('renders inline error banner when sf_error=state_mismatch query param is present', async () => {
    mockUseSearchParams.mockReturnValue([new URLSearchParams('sf_error=state_mismatch'), vi.fn()])
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(
      screen.getByText('The connection request expired or was tampered with. Please try again.')
    ).toBeInTheDocument()
  })

  it('renders inline error banner when sf_error=token_exchange_failed query param is present', async () => {
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams('sf_error=token_exchange_failed'),
      vi.fn(),
    ])
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(
      screen.getByText(
        'Could not complete the Salesforce connection. Please try again or contact support.'
      )
    ).toBeInTheDocument()
  })

  it('renders inline error banner when sf_error=userinfo_failed query param is present', async () => {
    mockUseSearchParams.mockReturnValue([
      new URLSearchParams('sf_error=userinfo_failed'),
      vi.fn(),
    ])
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(
      screen.getByText(
        'Connected to Salesforce but could not retrieve org details. Please try again.'
      )
    ).toBeInTheDocument()
  })

  it('renders inline error banner when sf_error=unknown query param is present', async () => {
    mockUseSearchParams.mockReturnValue([new URLSearchParams('sf_error=unknown'), vi.fn()])
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(
      screen.getByText('Something went wrong connecting to Salesforce. Please try again.')
    ).toBeInTheDocument()
  })

  it('removes sf_error from URL after rendering error banner (D-15)', async () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState')
    mockUseSearchParams.mockReturnValue([new URLSearchParams('sf_error=user_denied'), vi.fn()])
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })
    expect(replaceStateSpy).toHaveBeenCalledWith(
      {},
      '',
      expect.not.stringContaining('sf_error')
    )
    replaceStateSpy.mockRestore()
  })

  it('renders disconnected state (not thrown) when salesforce_connections returns null (REQ-12.6)', async () => {
    setMaybeSingleResult(null, null)
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByText('Connect Salesforce')).toBeInTheDocument()
    })
  })

  it('renders disconnected state (not thrown) when salesforce_connections fetch errors (REQ-12.6)', async () => {
    setMaybeSingleResult(null, new Error('DB error'))
    render(<SalesforceConnection />)
    await waitFor(() => {
      expect(screen.getByText('Connect Salesforce')).toBeInTheDocument()
    })
  })
})
