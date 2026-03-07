import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { Database } from '../types/database.types'

type DocumentRow = Database['public']['Tables']['proposal_documents']['Row']

interface DocumentListProps {
  proposalId: string
  onDocumentDeleted?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'pending')
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-600">
        Pending
      </span>
    )
  if (status === 'extracting')
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-600">
        Extracting...
      </span>
    )
  if (status === 'complete')
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-600">
        Complete
      </span>
    )
  if (status === 'error')
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600">
        Failed
      </span>
    )
  return null
}

function FileIcon({ mimeType }: { mimeType: string }) {
  if (mimeType === 'application/pdf') {
    return (
      <svg className="h-8 w-8 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M4 18h12V6h-4V2H4v16zm-2 1V1h10l4 4v14H2z" />
      </svg>
    )
  }
  if (mimeType.includes('word') || mimeType.includes('docx')) {
    return (
      <svg className="h-8 w-8 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M4 18h12V6h-4V2H4v16zm-2 1V1h10l4 4v14H2z" />
      </svg>
    )
  }
  if (mimeType.includes('sheet') || mimeType.includes('xlsx')) {
    return (
      <svg className="h-8 w-8 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path d="M4 18h12V6h-4V2H4v16zm-2 1V1h10l4 4v14H2z" />
      </svg>
    )
  }
  return (
    <svg className="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
      <path d="M4 18h12V6h-4V2H4v16zm-2 1V1h10l4 4v14H2z" />
    </svg>
  )
}

export function DocumentList({ proposalId, onDocumentDeleted }: DocumentListProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function fetchDocuments() {
    const { data, error } = await supabase
      .from('proposal_documents')
      .select('*')
      .eq('proposal_id', proposalId)
      .order('created_at', { ascending: false })

    if (error) {
      setError('Failed to load documents')
      console.error('Error fetching documents:', error)
    } else {
      setDocuments(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchDocuments()
  }, [proposalId])

  // Poll for status updates when any document is extracting
  useEffect(() => {
    const hasExtractingDocs = documents.some((doc) => doc.parse_status === 'extracting')

    if (!hasExtractingDocs) return

    const interval = setInterval(() => {
      fetchDocuments()
    }, 2000) // Poll every 2 seconds

    return () => clearInterval(interval)
  }, [documents, proposalId])

  async function handleDelete(document: DocumentRow) {
    // Delete from Storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.storage_path])

    if (storageError) {
      console.error('Failed to delete from storage:', storageError)
      alert('Failed to delete document')
      return
    }

    // Delete from database (CASCADE will handle document_extracts)
    const { error: dbError } = await supabase
      .from('proposal_documents')
      .delete()
      .eq('id', document.id)

    if (dbError) {
      console.error('Failed to delete from database:', dbError)
      alert('Failed to delete document')
      return
    }

    // Remove from local state
    setDocuments((prev) => prev.filter((d) => d.id !== document.id))

    // Call callback if provided
    if (onDocumentDeleted) {
      onDocumentDeleted()
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-gray-500">Loading documents...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-red-600">{error}</div>
      </div>
    )
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <svg
          className="h-12 w-12 text-gray-400 mb-3"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <div className="text-gray-500">No documents uploaded yet</div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-200">
      {documents.map((document) => (
        <div
          key={document.id}
          className="flex items-center gap-4 py-4 px-4 hover:bg-gray-50 transition"
        >
          <FileIcon mimeType={document.mime_type} />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">{document.name}</div>
            <div className="text-sm text-gray-500">
              {document.size_bytes ? formatBytes(document.size_bytes) : 'Unknown size'}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={document.parse_status} />
            <button
              onClick={() => handleDelete(document)}
              className="text-gray-400 hover:text-red-600 transition"
              aria-label="Delete document"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
