import { useState } from 'react'
import type { WizardState, WizardAction, WizardAssumption, MissingField, ConfidenceLevel } from '../../types/wizard'

interface Step3Props {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}

function ConfidenceBadge({ confidence }: { confidence: ConfidenceLevel }) {
  if (confidence === 'high')
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-600">
        High
      </span>
    )
  if (confidence === 'medium')
    return (
      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-600">
        Medium
      </span>
    )
  return (
    <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600">
      Low
    </span>
  )
}

function AssumptionCard({
  assumption,
  dispatch,
}: {
  assumption: WizardAssumption
  dispatch: React.Dispatch<WizardAction>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(assumption.value)

  const isApproved = assumption.status === 'approved'
  const isRejected = assumption.status === 'rejected'

  const borderClass = isApproved
    ? 'border-green-500'
    : 'border-gray-200'

  const containerClass = `border-2 rounded-lg p-3 mb-2 ${borderClass}${isRejected ? ' opacity-50' : ''}`

  function handleApprove() {
    if (assumption.status !== 'approved') {
      dispatch({ type: 'UPDATE_ASSUMPTION', id: assumption.id, updates: { status: 'approved' } })
    }
  }

  function handleReject() {
    if (assumption.status !== 'rejected') {
      dispatch({ type: 'UPDATE_ASSUMPTION', id: assumption.id, updates: { status: 'rejected' } })
    }
  }

  function handleBlur() {
    setIsEditing(false)
    if (editValue !== assumption.value) {
      dispatch({ type: 'UPDATE_ASSUMPTION', id: assumption.id, updates: { value: editValue } })
    }
  }

  return (
    <div className={containerClass} data-testid="assumption-card">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-gray-500 uppercase">{assumption.category}</span>
        <ConfidenceBadge confidence={assumption.confidence} />
        <span className="text-xs text-gray-400 ml-auto">{assumption.source}</span>
      </div>
      <div className="mb-2">
        {isEditing ? (
          <input
            type="text"
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleBlur}
            autoFocus
            data-testid="assumption-value-input"
          />
        ) : (
          <span
            className={`text-sm cursor-pointer${isRejected ? ' line-through' : ''}`}
            onClick={() => {
              setEditValue(assumption.value)
              setIsEditing(true)
            }}
            data-testid="assumption-value"
          >
            {assumption.value}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleApprove}
          className={`text-sm px-2 py-1 rounded ${isApproved ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-green-100'}`}
          data-testid="approve-button"
          aria-label="Approve"
        >
          ✓
        </button>
        <button
          onClick={handleReject}
          className={`text-sm px-2 py-1 rounded ${isRejected ? 'bg-red-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-100'}`}
          data-testid="reject-button"
          aria-label="Reject"
        >
          ✗
        </button>
      </div>
    </div>
  )
}

function MissingFieldItem({
  field,
  dispatch,
}: {
  field: MissingField
  dispatch: React.Dispatch<WizardAction>
}) {
  const [inputValue, setInputValue] = useState(field.filledValue || '')
  const [saved, setSaved] = useState(!!field.filledValue)

  function humanize(str: string) {
    return str.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function handleSave() {
    if (inputValue.trim()) {
      dispatch({ type: 'FILL_MISSING', field: field.field, value: inputValue.trim() })
      setSaved(true)
    }
  }

  return (
    <div className="mb-3" data-testid="missing-field-item">
      <label className="block text-sm font-medium text-amber-800 mb-1">
        {humanize(field.field)}
      </label>
      <p className="text-xs text-amber-700 mb-1">{field.description}</p>
      <div className="flex gap-2">
        <input
          type="text"
          className="flex-1 border border-amber-300 rounded px-2 py-1 text-sm bg-white"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          disabled={saved}
          placeholder="Enter value..."
          data-testid="missing-field-input"
        />
        {saved ? (
          <span className="text-green-600 px-2 py-1 text-sm" data-testid="missing-field-saved">
            ✓
          </span>
        ) : (
          <button
            onClick={handleSave}
            className="px-3 py-1 text-sm bg-amber-500 text-white rounded hover:bg-amber-600"
            data-testid="missing-field-save"
          >
            Save
          </button>
        )}
      </div>
    </div>
  )
}

export function Step3AssumptionReview({ state, dispatch }: Step3Props) {
  if (state.extractionStatus === 'extracting') {
    return (
      <div className="flex flex-col items-center justify-center py-16" data-testid="extraction-spinner">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-jamo-500 mb-4" />
        <p className="text-gray-600">Analyzing documents...</p>
      </div>
    )
  }

  const unfilledMissingFields = state.missingFields.filter((f) => !f.filledValue)
  const missingCount = unfilledMissingFields.length

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Review Extracted Assumptions</h2>

      {/* Missing fields amber section */}
      {state.missingFields.length > 0 && (
        <div
          className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4"
          data-testid="missing-fields-section"
        >
          <h3 className="text-sm font-semibold text-amber-800 mb-3">
            Missing Information ({missingCount})
          </h3>
          {state.missingFields.map((field) => (
            <MissingFieldItem key={field.field} field={field} dispatch={dispatch} />
          ))}
        </div>
      )}

      {/* Assumptions list */}
      {state.assumptions.length === 0 && state.extractionStatus === 'idle' ? (
        <p className="text-gray-500 text-sm mb-4">
          No documents uploaded. You can add assumptions manually.
        </p>
      ) : (
        <div data-testid="assumptions-list">
          {state.assumptions.map((assumption) => (
            <AssumptionCard key={assumption.id} assumption={assumption} dispatch={dispatch} />
          ))}
        </div>
      )}

      {/* Add assumption button */}
      <button
        onClick={() => dispatch({ type: 'ADD_ASSUMPTION' })}
        className="text-sm text-jamo-600 border border-jamo-300 rounded px-3 py-2 hover:bg-jamo-50 mb-6"
        data-testid="add-assumption-button"
      >
        + Add assumption
      </button>

      {/* Navigation row */}
      <div className="flex justify-between mt-4">
        <button
          onClick={() => dispatch({ type: 'SET_STEP', step: 1 })}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
          data-testid="back-button"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}
          className="px-4 py-2 text-sm bg-jamo-500 text-white rounded hover:bg-jamo-600"
          data-testid="next-button"
        >
          {missingCount > 0 ? `Next (${missingCount} missing)` : 'Next'}
        </button>
      </div>
    </div>
  )
}
