import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { DocumentList } from '../DocumentList'

const pendingDoc = {
  id: 'doc-1',
  name: 'rfp.pdf',
  mime_type: 'application/pdf',
  size_bytes: 102400,
  parse_status: 'pending',
  storage_path: 'org-1/proposal-1/rfp.pdf',
  proposal_id: 'proposal-1',
  org_id: 'org-1',
  created_at: '2026-03-01T00:00:00Z',
  document_extracts: [],
}

const extractingDoc = { ...pendingDoc, parse_status: 'extracting' }
const completeDoc = {
  ...pendingDoc,
  parse_status: 'complete',
  document_extracts: [{ parse_error: null, word_count: 1500, page_count: 3 }],
}
const errorDoc = {
  ...pendingDoc,
  parse_status: 'error',
  document_extracts: [{ parse_error: 'Unsupported format', word_count: null, page_count: null }],
}

// Build a chainable mock that resolves at .order()
function makeMockChain(resolvedData: any) {
  const chain: any = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockResolvedValue({ data: resolvedData, error: null })
  chain.delete = vi.fn().mockReturnValue(chain)
  // make chain awaitable for delete().eq() pattern
  chain[Symbol.iterator] = undefined
  return chain
}

const mockFrom = vi.fn()
const mockRemove = vi.fn()

vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    storage: {
      from: vi.fn().mockReturnValue({
        remove: (...args: any[]) => mockRemove(...args),
      }),
    },
  },
}))

describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRemove.mockResolvedValue({ data: null, error: null })
  })

  it('should render document list with status badges', async () => {
    mockFrom.mockReturnValue(makeMockChain([completeDoc]))
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('rfp.pdf')).toBeInTheDocument())
    expect(screen.getByText('Complete')).toBeInTheDocument()
  })

  it('Test 1: Polling starts when any document has parse_status="pending"', async () => {
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return makeMockChain([pendingDoc])
    })
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('Pending')).toBeInTheDocument())
    const countAfterLoad = callCount
    // Wait for at least one poll cycle (2s interval + buffer)
    await new Promise(r => setTimeout(r, 2200))
    expect(callCount).toBeGreaterThan(countAfterLoad)
  })

  it('Test 2: Polling starts when any document has parse_status="extracting"', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return makeMockChain([extractingDoc])
    })
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('Extracting...')).toBeInTheDocument())

    const countAfterLoad = callCount
    await act(async () => {
      vi.advanceTimersByTime(2100)
      await Promise.resolve()
    })
    expect(callCount).toBeGreaterThan(countAfterLoad)
    vi.useRealTimers()
  })

  it('Test 3: Polling stops when all documents reach terminal status (complete)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return makeMockChain([completeDoc])
    })
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('Complete')).toBeInTheDocument())

    const countAfterLoad = callCount
    vi.advanceTimersByTime(6100)
    // Give time for any errant polling to fire
    await new Promise(r => setTimeout(r, 100))
    expect(callCount).toBe(countAfterLoad)
    vi.useRealTimers()
  })

  it('Test 4: Polling stops when all documents reach terminal status (error)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      return makeMockChain([errorDoc])
    })
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument())

    const countAfterLoad = callCount
    vi.advanceTimersByTime(6100)
    await new Promise(r => setTimeout(r, 100))
    expect(callCount).toBe(countAfterLoad)
    vi.useRealTimers()
  })

  it('Test 5: Status badge shows error message on hover (title attribute)', async () => {
    mockFrom.mockReturnValue(makeMockChain([errorDoc]))
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('Failed')).toBeInTheDocument())
    const badge = screen.getByText('Failed')
    expect(badge).toHaveAttribute('title', 'Unsupported format')
  })

  it('Test 6: Word count displays for completed documents', async () => {
    mockFrom.mockReturnValue(makeMockChain([completeDoc]))
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText(/1,500 words/i)).toBeInTheDocument())
  })

  it('should have delete button for documents', async () => {
    mockFrom.mockReturnValue(makeMockChain([completeDoc]))
    render(<DocumentList proposalId="proposal-1" />)
    await waitFor(() => expect(screen.getByText('rfp.pdf')).toBeInTheDocument())
    expect(screen.getByLabelText('Delete document')).toBeInTheDocument()
  })
})
