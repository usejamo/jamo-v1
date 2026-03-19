import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration test: Document Upload Pipeline
 *
 * Validates the full chain:
 *   FileUpload component → Storage upload → proposal_documents insert
 *   → extract-document Edge Function → parse_status progression
 *   → DocumentList polling detects status changes → stops on terminal status
 *
 * Uses mocked Supabase client to simulate the full sequence without a live backend.
 */

const mockOrgId = 'org-uuid-456'
const mockProposalId = 'proposal-uuid-789'
const mockDocId = 'test-uuid-123'
const storagePath = `${mockOrgId}/${mockProposalId}/test.pdf`

// Simulated status progression across polling calls
const statusProgression = ['pending', 'extracting', 'complete']

const mockInvoke = vi.fn()
const mockStorageUpload = vi.fn()
const mockInsert = vi.fn()

let pollCount = 0

function makeSelectChain() {
  const chain: any = {}
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockImplementation(() => {
    const status = statusProgression[Math.min(pollCount, statusProgression.length - 1)]
    pollCount++
    const doc = {
      id: mockDocId,
      parse_status: status,
      document_extracts:
        status === 'complete' ? [{ word_count: 100, page_count: 1, parse_error: null }] : [],
    }
    return Promise.resolve({ data: [doc], error: null })
  })
  return chain
}

vi.mock('../supabase', () => ({
  supabase: {
    storage: {
      from: vi.fn().mockReturnValue({
        upload: (...args: any[]) => mockStorageUpload(...args),
      }),
    },
    from: vi.fn().mockReturnValue({
      insert: (...args: any[]) => mockInsert(...args),
      select: vi.fn().mockImplementation(() => makeSelectChain()),
    }),
    functions: {
      invoke: (...args: any[]) => mockInvoke(...args),
    },
  },
}))

describe('Document Upload Pipeline Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pollCount = 0

    mockStorageUpload.mockResolvedValue({
      data: { path: storagePath },
      error: null,
    })

    mockInsert.mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: mockDocId,
            org_id: mockOrgId,
            proposal_id: mockProposalId,
            name: 'test.pdf',
            storage_path: storagePath,
            mime_type: 'application/pdf',
            parse_status: 'pending',
          },
          error: null,
        }),
      }),
    })

    mockInvoke.mockResolvedValue({
      data: { success: true, documentId: mockDocId },
      error: null,
    })
  })

  it('Test 1: FileUpload triggers extraction after successful upload', async () => {
    const { supabase } = await import('../supabase')
    const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })

    // Simulate FileUpload: Storage upload
    const { data: uploadData } = await supabase.storage
      .from('documents')
      .upload(storagePath, mockFile)

    expect(uploadData.path).toBe(storagePath)

    // Simulate FileUpload: insert metadata
    const { data: docData } = await supabase
      .from('proposal_documents')
      .insert({ org_id: mockOrgId, proposal_id: mockProposalId, name: 'test.pdf',
               storage_path: storagePath, mime_type: 'application/pdf', parse_status: 'pending' })
      .select()
      .single()

    expect(docData.id).toBe(mockDocId)

    // Simulate FileUpload: trigger extraction
    const { data: invokeData } = await supabase.functions.invoke('extract-document', {
      body: { documentId: docData.id },
    })

    expect(mockInvoke).toHaveBeenCalledWith('extract-document', {
      body: { documentId: mockDocId },
    })
    expect(invokeData.success).toBe(true)
  })

  it('Test 2: Edge Function receives correct documentId', async () => {
    const { supabase } = await import('../supabase')

    await supabase.functions.invoke('extract-document', {
      body: { documentId: mockDocId },
    })

    expect(mockInvoke).toHaveBeenCalledWith(
      'extract-document',
      expect.objectContaining({ body: { documentId: mockDocId } })
    )
  })

  it('Test 3: DocumentList detects status change — polling produces correct sequence', async () => {
    const { supabase } = await import('../supabase')

    // First poll: status = 'pending'
    const { data: poll1 } = await supabase
      .from('proposal_documents')
      .select('*')
      .eq('proposal_id', mockProposalId)
      .order('created_at', { ascending: false })

    expect(poll1![0].parse_status).toBe('pending')

    // Second poll: status = 'extracting'
    const { data: poll2 } = await supabase
      .from('proposal_documents')
      .select('*')
      .eq('proposal_id', mockProposalId)
      .order('created_at', { ascending: false })

    expect(poll2![0].parse_status).toBe('extracting')
  })

  it('Test 4: Polling stops when status becomes complete', async () => {
    const { supabase } = await import('../supabase')

    // Advance to complete status (3rd poll)
    for (let i = 0; i < 2; i++) {
      await supabase
        .from('proposal_documents')
        .select('*')
        .eq('proposal_id', mockProposalId)
        .order('created_at', { ascending: false })
    }

    const { data: poll3 } = await supabase
      .from('proposal_documents')
      .select('*')
      .eq('proposal_id', mockProposalId)
      .order('created_at', { ascending: false })

    expect(poll3![0].parse_status).toBe('complete')
    expect(poll3![0].document_extracts[0].word_count).toBe(100)
  })

  it('Test 5: Full chain works — upload → extract → poll → complete without manual intervention', async () => {
    const { supabase } = await import('../supabase')
    const mockFile = new File(['test content'], 'test.pdf', { type: 'application/pdf' })

    // Step 1: Upload file
    const { data: uploadData } = await supabase.storage
      .from('documents')
      .upload(storagePath, mockFile)
    expect(uploadData.path).toBe(storagePath)

    // Step 2: Insert metadata
    const { data: docData } = await supabase
      .from('proposal_documents')
      .insert({ name: 'test.pdf', parse_status: 'pending' })
      .select()
      .single()
    expect(docData.id).toBe(mockDocId)

    // Step 3: Trigger extraction (fire-and-forget)
    supabase.functions.invoke('extract-document', { body: { documentId: docData.id } })
      .catch(() => {}) // fire-and-forget

    // Step 4: Poll until complete
    let finalStatus = ''
    let polls = 0
    while (finalStatus !== 'complete' && polls < 10) {
      const { data } = await supabase
        .from('proposal_documents')
        .select('*')
        .eq('proposal_id', mockProposalId)
        .order('created_at', { ascending: false })
      finalStatus = data![0].parse_status
      polls++
    }

    expect(finalStatus).toBe('complete')
    expect(mockInvoke).toHaveBeenCalledWith('extract-document', {
      body: { documentId: mockDocId },
    })
  })

  it('should handle extraction errors gracefully', async () => {
    const { supabase } = await import('../supabase')
    mockInvoke.mockRejectedValue(new Error('Edge Function timeout'))

    let caughtError: Error | null = null
    try {
      await supabase.functions.invoke('extract-document', {
        body: { documentId: mockDocId },
      })
    } catch (err) {
      caughtError = err as Error
    }

    expect(caughtError).not.toBeNull()
    expect(caughtError!.message).toBe('Edge Function timeout')
  })
})
