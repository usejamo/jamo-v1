import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SaveAsDemoFixtureButton } from '../SaveAsDemoFixtureButton'

// 16-07 Task 3. Isolated component test: ProposalDetail's mount weight (TipTap,
// four contexts, useProposalGeneration) makes an integration test impractical,
// so the capture action lives in its own component — same precedent as
// ProposalReferenceControl.test.tsx. Inline vi.mock, never dynamic import.

const maybeSingle = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
    functions: { invoke: vi.fn() },
  },
}))

const DEMO_ORG = 'demo-org-uuid'
const REAL_ORG = 'real-org-uuid'

/** Runtime demo-org resolution: flagged org, never a hardcoded UUID. */
function mockOrgLookup(org: { slug: string; feature_flags: Record<string, unknown> } | null) {
  maybeSingle.mockResolvedValue(
    org ? { data: { id: DEMO_ORG, ...org }, error: null } : { data: null, error: null }
  )
}

beforeEach(async () => {
  vi.clearAllMocks()
  mockOrgLookup({ slug: 'jamo-demo', feature_flags: { is_demo: true } })
  const { supabase } = await import('../../lib/supabase')
  ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: { fixture_id: 'f1', version: 3 },
    error: null,
  })
})

const CAPTURE_LABEL = /save as demo fixture/i

describe('SaveAsDemoFixtureButton — role gate', () => {
  it('does not render for role=user', async () => {
    const { container } = render(
      <SaveAsDemoFixtureButton proposalId="p1" role="user" orgId={DEMO_ORG} />
    )
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })

  it('does not render for role=admin', async () => {
    const { container } = render(
      <SaveAsDemoFixtureButton proposalId="p1" role="admin" orgId={DEMO_ORG} />
    )
    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })

  it('renders for role=super_admin in the demo org', async () => {
    render(<SaveAsDemoFixtureButton proposalId="p1" role="super_admin" orgId={DEMO_ORG} />)
    expect(await screen.findByRole('button', { name: CAPTURE_LABEL })).toBeInTheDocument()
  })
})

describe('SaveAsDemoFixtureButton — demo-org gate', () => {
  it('does not render for a super_admin whose own org is not the demo org', async () => {
    // Two super_admins exist (demo presenter + internal); the check is org-scoped.
    mockOrgLookup({ slug: 'jamo-internal', feature_flags: {} })
    render(<SaveAsDemoFixtureButton proposalId="p1" role="super_admin" orgId={REAL_ORG} />)

    await waitFor(() => expect(maybeSingle).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })

  it('renders when only the is_demo feature flag identifies the org', async () => {
    mockOrgLookup({ slug: 'some-other-slug', feature_flags: { is_demo: true } })
    render(<SaveAsDemoFixtureButton proposalId="p1" role="super_admin" orgId={DEMO_ORG} />)
    expect(await screen.findByRole('button', { name: CAPTURE_LABEL })).toBeInTheDocument()
  })

  it('does not render when the org lookup fails', async () => {
    mockOrgLookup(null)
    render(<SaveAsDemoFixtureButton proposalId="p1" role="super_admin" orgId={DEMO_ORG} />)

    await waitFor(() => expect(maybeSingle).toHaveBeenCalled())
    expect(screen.queryByRole('button', { name: CAPTURE_LABEL })).toBeNull()
  })
})

describe('SaveAsDemoFixtureButton — capture', () => {
  it('invokes demo-capture-fixture with the proposal id and reports the version', async () => {
    const { supabase } = await import('../../lib/supabase')
    render(<SaveAsDemoFixtureButton proposalId="prop-123" role="super_admin" orgId={DEMO_ORG} />)

    await userEvent.click(await screen.findByRole('button', { name: CAPTURE_LABEL }))

    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('demo-capture-fixture', {
        body: { source_proposal_id: 'prop-123' },
      })
    })
    expect(await screen.findByRole('status')).toHaveTextContent('Captured as fixture v3')
  })

  it("surfaces the edge function's own message instead of a generic failure", async () => {
    const { supabase } = await import('../../lib/supabase')
    ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({ error: 'source proposal has ungenerated section(s): Budget' }),
        },
      },
    })
    render(<SaveAsDemoFixtureButton proposalId="prop-123" role="super_admin" orgId={DEMO_ORG} />)

    await userEvent.click(await screen.findByRole('button', { name: CAPTURE_LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'source proposal has ungenerated section(s): Budget'
    )
  })

  it('falls back to the error message when the body has no server text', async () => {
    const { supabase } = await import('../../lib/supabase')
    ;(supabase.functions.invoke as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch' },
    })
    render(<SaveAsDemoFixtureButton proposalId="prop-123" role="super_admin" orgId={DEMO_ORG} />)

    await userEvent.click(await screen.findByRole('button', { name: CAPTURE_LABEL }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to fetch')
  })
})
