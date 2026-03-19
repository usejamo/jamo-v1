import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

const mockInvoke = vi.fn().mockResolvedValue({
  data: { success: true, documentId: 'doc-123' },
  error: null,
})

vi.mock('../../lib/supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({
          data: { path: 'test-org/test-proposal/test.pdf' },
          error: null,
        }),
        remove: vi.fn().mockResolvedValue({ data: null, error: null }),
      }),
    },
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'doc-123',
              org_id: 'test-org',
              proposal_id: 'test-proposal',
              name: 'test.pdf',
              storage_path: 'test-org/test-proposal/test.pdf',
              mime_type: 'application/pdf',
              size_bytes: 1024,
              parse_status: 'pending',
            },
            error: null,
          }),
        }),
      }),
    }),
    functions: {
      invoke: mockInvoke,
    },
  },
}))

vi.mock('../../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    user: { id: 'user-123' },
    profile: { org_id: 'test-org', user_id: 'user-123' },
    session: {},
    loading: false,
  })),
}))

describe('FileUpload component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue({
      data: { success: true, documentId: 'doc-123' },
      error: null,
    })
  })

  it('Test 1: Component renders with file picker and drop zone', async () => {
    const { FileUpload } = await import('../FileUpload')
    render(<FileUpload proposalId="test-proposal" />)
    expect(screen.getByText(/drag files here or click to browse/i)).toBeInTheDocument()
    expect(screen.getByText(/supports.*pdf.*docx.*xlsx.*txt/i)).toBeInTheDocument()
  })

  it('Test 2: Drag-and-drop area accepts PDF, DOCX, XLSX, TXT files', async () => {
    const { FileUpload } = await import('../FileUpload')
    const onUploadComplete = vi.fn()
    render(<FileUpload proposalId="test-proposal" onUploadComplete={onUploadComplete} />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('doc-123'))
  })

  it('Test 3: Invalid file types show error', async () => {
    const { FileUpload } = await import('../FileUpload')
    render(<FileUpload proposalId="test-proposal" />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const invalidFile = new File(['content'], 'virus.exe', { type: 'application/x-msdownload' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [invalidFile] } })
    await waitFor(() => expect(screen.getByText(/unsupported file type/i)).toBeInTheDocument())
  })

  it('Test 4: Upload updates proposal_documents table with metadata', async () => {
    const { supabase } = await import('../../lib/supabase')
    const { FileUpload } = await import('../FileUpload')
    render(<FileUpload proposalId="test-proposal" />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(supabase.from).toHaveBeenCalledWith('proposal_documents'))
  })

  it('Test 5: Storage path follows pattern', async () => {
    const { supabase } = await import('../../lib/supabase')
    const { FileUpload } = await import('../FileUpload')
    render(<FileUpload proposalId="test-proposal" />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() => {
      const mockUpload = (supabase.storage.from as any)().upload
      expect(mockUpload).toHaveBeenCalledWith('test-org/test-proposal/test.pdf', file, expect.objectContaining({ cacheControl: '3600', upsert: false }))
    })
  })

  it('Test 6: After successful upload, extract-document Edge Function is called', async () => {
    const { supabase } = await import('../../lib/supabase')
    const { FileUpload } = await import('../FileUpload')
    render(<FileUpload proposalId="test-proposal" />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith('extract-document', {
        body: { documentId: 'doc-123' },
      })
    })
  })

  it('Test 7: Edge Function receives correct documentId', async () => {
    const { supabase } = await import('../../lib/supabase')
    const { FileUpload } = await import('../FileUpload')
    render(<FileUpload proposalId="test-proposal" />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() => {
      expect(supabase.functions.invoke).toHaveBeenCalledWith(
        'extract-document',
        expect.objectContaining({ body: { documentId: 'doc-123' } })
      )
    })
  })

  it('Test 8: onUploadComplete fires after extraction triggered (not after completion)', async () => {
    const { FileUpload } = await import('../FileUpload')
    const onUploadComplete = vi.fn()
    // Make invoke never resolve to confirm callback fires before extraction finishes
    mockInvoke.mockReturnValue(new Promise(() => {}))
    render(<FileUpload proposalId="test-proposal" onUploadComplete={onUploadComplete} />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() => expect(onUploadComplete).toHaveBeenCalledWith('doc-123'))
  })

  it('Test 9: Extraction error displays user-friendly message', async () => {
    const { FileUpload } = await import('../FileUpload')
    mockInvoke.mockRejectedValue(new Error('Edge Function timeout'))
    render(<FileUpload proposalId="test-proposal" />)
    const dropzone = screen.getByText(/drag files here or click to browse/i).closest('div')
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' })
    fireEvent.drop(dropzone!, { dataTransfer: { files: [file] } })
    await waitFor(() =>
      expect(screen.getByText(/failed to start extraction/i)).toBeInTheDocument()
    )
  })
})
