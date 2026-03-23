import { AVAILABLE_SERVICES, groupServicesByCategory, THERAPEUTIC_AREAS, STUDY_PHASES } from '../../../cro-proposal-generator.js'
import type { WizardState, WizardAction, StudyInfo } from '../../types/wizard'

interface Step1StudyInfoProps {
  state: WizardState
  dispatch: React.Dispatch<WizardAction>
}

function validateStep1(studyInfo: StudyInfo): Partial<Record<keyof StudyInfo, string>> {
  const errors: Partial<Record<keyof StudyInfo, string>> = {}
  if (!studyInfo.sponsorName.trim()) errors.sponsorName = 'Required'
  if (!studyInfo.therapeuticArea) errors.therapeuticArea = 'Required'
  if (!studyInfo.indication.trim()) errors.indication = 'Required'
  if (!studyInfo.studyPhase) errors.studyPhase = 'Required'
  return errors
}

export function Step1StudyInfo({ state, dispatch }: Step1StudyInfoProps) {
  const { studyInfo, errors } = state

  const grouped = groupServicesByCategory(AVAILABLE_SERVICES)

  const optionalIncomplete =
    !studyInfo.dueDate ||
    studyInfo.regions.length === 0 ||
    studyInfo.services.length === 0

  function handleTextChange(field: keyof StudyInfo, value: string) {
    dispatch({ type: 'UPDATE_STUDY_INFO', field, value })
  }

  function handleRegionsBlur(value: string) {
    const arr = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    dispatch({ type: 'UPDATE_STUDY_INFO', field: 'regions', value: arr })
  }

  function handleNext() {
    const validationErrors = validateStep1(studyInfo)
    if (Object.keys(validationErrors).length > 0) {
      dispatch({ type: 'SET_ERRORS', errors: validationErrors })
      return
    }
    dispatch({ type: 'SET_STEP', step: 1 })
  }

  return (
    <div className="space-y-5">
      {/* Sponsor Name */}
      <div>
        <label htmlFor="sponsorName" className="block text-sm font-medium text-gray-700 mb-1">
          Sponsor Name
        </label>
        <input
          id="sponsorName"
          type="text"
          value={studyInfo.sponsorName}
          onChange={(e) => handleTextChange('sponsorName', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Sponsor Name"
        />
        {errors.sponsorName && (
          <p className="mt-1 text-xs text-red-600">{errors.sponsorName}</p>
        )}
      </div>

      {/* Therapeutic Area */}
      <div>
        <label htmlFor="therapeuticArea" className="block text-sm font-medium text-gray-700 mb-1">
          Therapeutic Area
        </label>
        <select
          id="therapeuticArea"
          value={studyInfo.therapeuticArea}
          onChange={(e) => handleTextChange('therapeuticArea', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Therapeutic Area"
        >
          <option value="">Select therapeutic area…</option>
          {THERAPEUTIC_AREAS.map((ta) => (
            <option key={ta} value={ta}>{ta}</option>
          ))}
        </select>
        {errors.therapeuticArea && (
          <p className="mt-1 text-xs text-red-600">{errors.therapeuticArea}</p>
        )}
      </div>

      {/* Indication */}
      <div>
        <label htmlFor="indication" className="block text-sm font-medium text-gray-700 mb-1">
          Indication
        </label>
        <input
          id="indication"
          type="text"
          value={studyInfo.indication}
          onChange={(e) => handleTextChange('indication', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Indication"
        />
        {errors.indication && (
          <p className="mt-1 text-xs text-red-600">{errors.indication}</p>
        )}
      </div>

      {/* Study Phase */}
      <div>
        <label htmlFor="studyPhase" className="block text-sm font-medium text-gray-700 mb-1">
          Study Phase
        </label>
        <select
          id="studyPhase"
          value={studyInfo.studyPhase}
          onChange={(e) => handleTextChange('studyPhase', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Study Phase"
        >
          <option value="">Select study phase…</option>
          {STUDY_PHASES.map((ph) => (
            <option key={ph} value={ph}>{ph}</option>
          ))}
        </select>
        {errors.studyPhase && (
          <p className="mt-1 text-xs text-red-600">{errors.studyPhase}</p>
        )}
      </div>

      {/* Proposal Due Date (optional) */}
      <div>
        <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700 mb-1">
          Proposal Due Date
        </label>
        <input
          id="dueDate"
          type="date"
          value={studyInfo.dueDate}
          onChange={(e) => handleTextChange('dueDate', e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Proposal Due Date"
        />
      </div>

      {/* Countries / Regions (optional) */}
      <div>
        <label htmlFor="regions" className="block text-sm font-medium text-gray-700 mb-1">
          Countries / Regions
        </label>
        <input
          id="regions"
          type="text"
          defaultValue={studyInfo.regions.join(', ')}
          onBlur={(e) => handleRegionsBlur(e.target.value)}
          placeholder="e.g. USA, EU, Japan"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jamo-500"
          aria-label="Countries / Regions"
        />
      </div>

      {/* Services pill toggles */}
      <div>
        <p className="text-sm font-medium text-gray-700 mb-2">Services</p>
        <div className="space-y-3">
          {Object.entries(grouped).map(([category, services]) => (
            <div key={category}>
              <p className="text-xs font-medium text-gray-400 mb-1">{category}</p>
              <div className="flex flex-wrap gap-2">
                {(services as Array<{ label: string; category: string }>).map((svc) => {
                  const selected = studyInfo.services.includes(svc.label)
                  return (
                    <button
                      key={svc.label}
                      type="button"
                      onClick={() => dispatch({ type: 'TOGGLE_SERVICE', label: svc.label })}
                      className={
                        selected
                          ? 'px-3 py-1 rounded-full text-xs border font-medium bg-jamo-500 border-jamo-500 text-white'
                          : 'px-3 py-1 rounded-full text-xs border font-medium border-gray-300 text-gray-600'
                      }
                    >
                      {svc.label}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optional completeness indicator */}
      {optionalIncomplete && (
        <p className="text-xs text-gray-400">
          Adding more context improves output quality
        </p>
      )}

      {/* Next button */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          data-testid="next-button"
          onClick={handleNext}
          className="bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-medium px-5 py-2 rounded-md"
        >
          Next
        </button>
      </div>
    </div>
  )
}
