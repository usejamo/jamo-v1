import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import type { WizardState, WizardAction } from '../../types/wizard'

interface Step4GenerateProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
  onGenerate: () => Promise<void>
}

interface Template {
  id: string
  name: string
  description: string | null
  source: 'prebuilt' | 'uploaded'
  parse_status: string
}

function getOutputQuality(hasStudyInfo: boolean, documentCount: number): 'full' | 'reduced' | 'limited' {
  if (hasStudyInfo && documentCount > 0) return 'full'
  if (hasStudyInfo || documentCount > 0) return 'reduced'
  return 'limited'
}

function TemplateSelector({
  selectedTemplateId,
  templates,
  loading,
  onSelect,
}: {
  selectedTemplateId: string | null
  templates: Template[]
  loading: boolean
  onSelect: (id: string | null) => void
}) {
  const prebuilt = templates.filter((t) => t.source === 'prebuilt')
  const uploaded = templates.filter((t) => t.source === 'uploaded')

  if (loading) {
    return (
      <div className="text-sm text-gray-400 py-2">Loading templates...</div>
    )
  }

  if (templates.length === 0) {
    return (
      <div className="text-sm text-gray-400 italic py-2">No templates available.</div>
    )
  }

  function renderCard(t: Template) {
    const isSelected = selectedTemplateId === t.id
    const cardClass = isSelected
      ? 'bg-jamo-50 border-jamo-300 ring-2 ring-jamo-200 rounded-lg p-4 cursor-pointer transition-colors'
      : 'bg-white border border-gray-200 hover:border-jamo-200 rounded-lg p-4 cursor-pointer transition-colors'

    return (
      <div
        key={t.id}
        role="radio"
        aria-checked={isSelected}
        onClick={() => onSelect(isSelected ? null : t.id)}
        className={cardClass}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900">{t.name}</span>
          {t.source === 'prebuilt' ? (
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">Pre-built</span>
          ) : (
            <span className="text-xs text-jamo-600 bg-jamo-50 px-2 py-0.5 rounded-full whitespace-nowrap">Your template</span>
          )}
        </div>
        {t.description && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">{t.description}</p>
        )}
      </div>
    )
  }

  return (
    <div role="radiogroup" aria-label="Template selection">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {prebuilt.map(renderCard)}
      </div>
      {prebuilt.length > 0 && uploaded.length > 0 && (
        <div className="my-2 flex items-center gap-2">
          <hr className="flex-1 border-gray-200" />
          <span className="text-xs text-gray-400">Your organization's templates</span>
          <hr className="flex-1 border-gray-200" />
        </div>
      )}
      {uploaded.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {uploaded.map(renderCard)}
        </div>
      )}
    </div>
  )
}

function ContextSummary({
  state,
  templates,
}: {
  state: WizardState
  templates: Template[]
}) {
  const { studyInfo } = state
  const hasStudyInfo = Boolean(studyInfo.sponsorName && studyInfo.therapeuticArea)
  const documentCount = state.documentCount
  const quality = getOutputQuality(hasStudyInfo, documentCount)

  const qualityLabel: Record<typeof quality, string> = {
    full: 'Full quality output expected',
    reduced: 'Reduced quality — add more context for better results',
    limited: 'Limited quality — study info and documents improve output',
  }

  const qualityColor: Record<typeof quality, string> = {
    full: 'text-green-500',
    reduced: 'text-yellow-500',
    limited: 'text-gray-400',
  }

  const approvedCount = state.assumptions.filter((a) => a.status === 'approved').length
  const assumptionLabel = approvedCount > 0
    ? `${approvedCount} assumption${approvedCount === 1 ? '' : 's'} approved`
    : 'No assumptions (fast draft)'

  const templateLabel = state.selectedTemplateId
    ? templates.find((t) => t.id === state.selectedTemplateId)?.name ?? 'Selected'
    : null

  return (
    <div className="rounded-lg bg-gray-50 px-4 py-3 space-y-2" data-testid="context-summary">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">Context Summary</p>
      <div className="flex items-center gap-2">
        <span className={`text-xs ${hasStudyInfo ? 'text-gray-700' : 'text-gray-400'}`}>
          {hasStudyInfo
            ? `Study info: ${studyInfo.sponsorName} / ${studyInfo.therapeuticArea}`
            : 'Study info: not provided'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          Documents: {documentCount}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">
          {assumptionLabel}
        </span>
      </div>
      <p className={state.selectedTemplateId ? 'text-xs text-gray-700' : 'text-xs text-gray-400 italic'}>
        Template: {state.selectedTemplateId ? templateLabel : 'No template — using standard structure'}
      </p>
      <p className={`text-xs ${qualityColor[quality]}`}>{qualityLabel[quality]}</p>
    </div>
  )
}

export function Step4Generate({ state, dispatch, onGenerate }: Step4GenerateProps) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('templates')
      .select('id, name, description, source, parse_status')
      .eq('parse_status', 'ready')
      .order('source', { ascending: true })
      .order('name', { ascending: true })
      .then(({ data }) => {
        setTemplates((data as Template[]) || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="space-y-5" data-testid="step-generate">
      <div>
        <h3 className="text-base font-semibold text-gray-900">Template &amp; Generate</h3>
        <p className="mt-1 text-sm text-gray-500">
          Review your context and generate the proposal.
        </p>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Choose a template (optional)</p>
        <TemplateSelector
          selectedTemplateId={state.selectedTemplateId}
          templates={templates}
          loading={loading}
          onSelect={(id) => dispatch({ type: 'SET_TEMPLATE', templateId: id })}
        />
      </div>

      <ContextSummary state={state} templates={templates} />

      <div className="flex justify-between pt-2">
        <button
          type="button"
          onClick={() => dispatch({ type: 'SET_STEP', step: 2 })}
          className="rounded-md border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Back
        </button>
        <button
          type="button"
          data-testid="generate-button"
          onClick={onGenerate}
          disabled={state.submitting}
          className="inline-flex items-center gap-2 rounded-md bg-jamo-500 px-5 py-2 text-sm font-medium text-white hover:bg-jamo-600 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {state.submitting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Creating...
            </>
          ) : (
            'Generate Proposal'
          )}
        </button>
      </div>
    </div>
  )
}
