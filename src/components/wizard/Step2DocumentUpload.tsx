import { useState, useEffect, useRef } from 'react'
import type { WizardState, WizardAction, WizardAssumption } from '../../types/wizard'
import { supabase } from '../../lib/supabase'
import { FileUpload } from '../FileUpload'
import { DocumentList } from '../DocumentList'

interface Step2DocumentUploadProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}

interface DocumentRow {
  id: string
  parse_status: string
}

export function Step2DocumentUpload({ state, dispatch }: Step2DocumentUploadProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [refreshKey, setRefreshKey] = useState(0)
  const extractionFiredRef = useRef(false)

  // Poll proposal_documents to detect when all docs reach parse_status=complete
  useEffect(() => {
    if (!state.proposalId) return

    async function fetchDocuments() {
      const { data } = await supabase
        .from('proposal_documents')
        .select('id, parse_status')
        .eq('proposal_id', state.proposalId!)
        .order('created_at', { ascending: false })
      const docs = (data as DocumentRow[]) || []
      setDocuments(docs)
      dispatch({ type: 'SET_DOCUMENT_COUNT', count: docs.length })
    }

    fetchDocuments()

    const hasActiveProcessing = documents.some(
      (d) => d.parse_status === 'pending' || d.parse_status === 'extracting'
    )
    if (!hasActiveProcessing && documents.length === 0) return

    if (hasActiveProcessing) {
      const interval = setInterval(fetchDocuments, 2000)
      return () => clearInterval(interval)
    }
  }, [state.proposalId, refreshKey, documents.length])

  // Extraction trigger: fires once when all docs are complete
  useEffect(() => {
    if (!state.proposalId) return
    const hasAssumptions = state.assumptions && state.assumptions.length > 0
    const allComplete =
      documents.length > 0 && documents.every((d) => d.parse_status === 'complete')

    if (allComplete && !hasAssumptions && !extractionFiredRef.current) {
      extractionFiredRef.current = true
      dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'extracting' })
      supabase.functions
        .invoke('extract-assumptions', {
          body: { proposalId: state.proposalId },
        })
        .then(({ data, error }) => {
          if (error) {
            dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'error' })
            return
          }
          const mapped: WizardAssumption[] = (data?.assumptions ?? []).map((a: {
            category: string
            value: string
            confidence: number
            source?: string
          }) => ({
            id: crypto.randomUUID(),
            category: a.category,
            value: a.value,
            confidence:
              a.confidence >= 0.8 ? 'high' : a.confidence >= 0.5 ? 'medium' : 'low',
            source: a.source || 'document',
            status: 'pending' as const,
          }))
          dispatch({
            type: 'SET_ASSUMPTIONS',
            assumptions: mapped,
            missing: data?.missing ?? [],
          })
          dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'complete' })
        })
        .catch((err) => {
          console.error('extract-assumptions failed:', err)
          dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'error' })
        })
    }
  }, [documents, state.assumptions, state.proposalId])

  return (
    <div className="space-y-5" data-testid="step-document-upload">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Upload Documents</h3>
        <p className="mt-1 text-sm text-gray-500">
          Upload your RFP, protocol, budget, or other study documents. AI will extract
          assumptions once all documents finish parsing.
        </p>
      </div>

      {state.proposalId ? (
        <div className="space-y-4">
          <FileUpload
            proposalId={state.proposalId}
            onUploadComplete={() => setRefreshKey((k) => k + 1)}
          />
          <DocumentList
            proposalId={state.proposalId}
            onDocumentDeleted={() => setRefreshKey((k) => k + 1)}
            refreshKey={refreshKey}
          />
          {state.extractionStatus === 'extracting' && (
            <div className="flex items-center gap-2 text-sm text-jamo-600">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing documents for assumptions...
            </div>
          )}
          {state.extractionStatus === 'complete' && (
            <p className="text-sm text-green-600">
              Assumption extraction complete — review in the next step.
            </p>
          )}
          {state.extractionStatus === 'error' && (
            <p className="text-sm text-red-600">
              Assumption extraction failed. You can proceed and add assumptions manually.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-200 px-6 py-8 text-center">
          <svg
            className="mx-auto mb-3 h-10 w-10 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z"
            />
          </svg>
          <p className="text-sm font-medium text-gray-600">Documents upload after proposal creation</p>
          <p className="mt-1 text-xs text-gray-400">
            Proceed to Generate — you can upload RFP, protocol, and budget files from the proposal
            detail page once the record is created.
          </p>
        </div>
      )}

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_STEP', step: 0 })}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="next-button"
          onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
          className="rounded-md bg-jamo-500 px-5 py-2 text-sm font-medium text-white hover:bg-jamo-600"
        >
          Next
        </button>
      </div>
    </div>
  )
}
