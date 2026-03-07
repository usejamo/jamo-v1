import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DocumentList } from '../DocumentList'

// Mock Supabase client
vi.mock('../../lib/supabase', () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    }),
    storage: {
      from: vi.fn().mockReturnValue({
        remove: vi.fn().mockResolvedValue({ error: null }),
      }),
    },
  },
}))

describe('DocumentList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render empty state when no documents', async () => {
    const { supabase } = await import('../../lib/supabase')
    ;(supabase.from as any)().order.mockResolvedValue({ data: [], error: null })

    render(<DocumentList proposalId="proposal-1" />)

    await waitFor(() => {
      expect(screen.getByText(/no documents uploaded yet/i)).toBeInTheDocument()
    })
  })

  it('should fetch and display documents for proposal', async () => {
    const { supabase } = await import('../../lib/supabase')
    const mockDocuments = [
      {
        id: 'doc-1',
        name: 'test.pdf',
        size_bytes: 1024,
        mime_type: 'application/pdf',
        parse_status: 'pending',
        storage_path: 'org-1/proposal-1/test.pdf',
        created_at: '2026-03-07T00:00:00Z',
      },
    ]
    ;(supabase.from as any)().order.mockResolvedValue({ data: mockDocuments, error: null })

    render(<DocumentList proposalId="proposal-1" />)

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument()
      expect(screen.getByText('1.0 KB')).toBeInTheDocument()
    })
  })

  it('should display status badges with correct colors for each state', async () => {
    const { supabase } = await import('../../lib/supabase')
    const mockDocuments = [
      {
        id: 'doc-1',
        name: 'pending.pdf',
        size_bytes: 1024,
        mime_type: 'application/pdf',
        parse_status: 'pending',
        storage_path: 'org-1/proposal-1/pending.pdf',
        created_at: '2026-03-07T00:00:00Z',
      },
      {
        id: 'doc-2',
        name: 'extracting.pdf',
        size_bytes: 2048,
        mime_type: 'application/pdf',
        parse_status: 'extracting',
        storage_path: 'org-1/proposal-1/extracting.pdf',
        created_at: '2026-03-07T00:01:00Z',
      },
      {
        id: 'doc-3',
        name: 'complete.pdf',
        size_bytes: 3072,
        mime_type: 'application/pdf',
        parse_status: 'complete',
        storage_path: 'org-1/proposal-1/complete.pdf',
        created_at: '2026-03-07T00:02:00Z',
      },
      {
        id: 'doc-4',
        name: 'error.pdf',
        size_bytes: 4096,
        mime_type: 'application/pdf',
        parse_status: 'error',
        storage_path: 'org-1/proposal-1/error.pdf',
        created_at: '2026-03-07T00:03:00Z',
      },
    ]
    ;(supabase.from as any)().order.mockResolvedValue({ data: mockDocuments, error: null })

    render(<DocumentList proposalId="proposal-1" />)

    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument()
      expect(screen.getByText('Extracting...')).toBeInTheDocument()
      expect(screen.getByText('Complete')).toBeInTheDocument()
      expect(screen.getByText('Failed')).toBeInTheDocument()
    })

    // Check badge classes for correct colors
    const pendingBadge = screen.getByText('Pending')
    expect(pendingBadge.className).toContain('bg-gray-100')
    expect(pendingBadge.className).toContain('text-gray-600')

    const extractingBadge = screen.getByText('Extracting...')
    expect(extractingBadge.className).toContain('bg-blue-100')
    expect(extractingBadge.className).toContain('text-blue-600')

    const completeBadge = screen.getByText('Complete')
    expect(completeBadge.className).toContain('bg-green-100')
    expect(completeBadge.className).toContain('text-green-600')

    const failedBadge = screen.getByText('Failed')
    expect(failedBadge.className).toContain('bg-red-100')
    expect(failedBadge.className).toContain('text-red-600')
  })

  it('should delete document when delete button clicked', async () => {
    const user = userEvent.setup()
    const { supabase } = await import('../../lib/supabase')
    const mockDocuments = [
      {
        id: 'doc-1',
        name: 'test.pdf',
        size_bytes: 1024,
        mime_type: 'application/pdf',
        parse_status: 'pending',
        storage_path: 'org-1/proposal-1/test.pdf',
        created_at: '2026-03-07T00:00:00Z',
      },
    ]
    ;(supabase.from as any)().order.mockResolvedValue({ data: mockDocuments, error: null })
    ;(supabase.from as any)().eq.mockResolvedValue({ error: null })
    ;(supabase.storage.from as any)().remove.mockResolvedValue({ error: null })

    const onDocumentDeleted = vi.fn()
    render(<DocumentList proposalId="proposal-1" onDocumentDeleted={onDocumentDeleted} />)

    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument()
    })

    const deleteButton = screen.getByRole('button', { name: /delete/i })
    await user.click(deleteButton)

    await waitFor(() => {
      expect(supabase.storage.from).toHaveBeenCalledWith('documents')
      expect(supabase.from).toHaveBeenCalledWith('proposal_documents')
      expect(onDocumentDeleted).toHaveBeenCalled()
    })
  })

  it('should display file size in human-readable format', async () => {
    const { supabase } = await import('../../lib/supabase')
    const mockDocuments = [
      {
        id: 'doc-1',
        name: 'small.pdf',
        size_bytes: 500,
        mime_type: 'application/pdf',
        parse_status: 'pending',
        storage_path: 'org-1/proposal-1/small.pdf',
        created_at: '2026-03-07T00:00:00Z',
      },
      {
        id: 'doc-2',
        name: 'medium.pdf',
        size_bytes: 15360, // 15 KB
        mime_type: 'application/pdf',
        parse_status: 'pending',
        storage_path: 'org-1/proposal-1/medium.pdf',
        created_at: '2026-03-07T00:01:00Z',
      },
      {
        id: 'doc-3',
        name: 'large.pdf',
        size_bytes: 2097152, // 2 MB
        mime_type: 'application/pdf',
        parse_status: 'pending',
        storage_path: 'org-1/proposal-1/large.pdf',
        created_at: '2026-03-07T00:02:00Z',
      },
    ]
    ;(supabase.from as any)().order.mockResolvedValue({ data: mockDocuments, error: null })

    render(<DocumentList proposalId="proposal-1" />)

    await waitFor(() => {
      expect(screen.getByText('500 B')).toBeInTheDocument()
      expect(screen.getByText('15.0 KB')).toBeInTheDocument()
      expect(screen.getByText('2.0 MB')).toBeInTheDocument()
    })
  })
})
