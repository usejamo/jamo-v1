// Wizard type contracts — Phase 5 Proposal Creation Wizard + Phase 6 Assumption Extraction

export interface ServiceOption {
  label: string
  category: string
}

export interface StudyInfo {
  sponsorName: string
  therapeuticArea: string
  indication: string
  studyPhase: string
  regions: string[]
  dueDate: string
  services: string[]  // label values of selected ServiceOptions
}

// Phase 6 assumption types
export type AssumptionStatus = 'pending' | 'approved' | 'rejected'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type ExtractionStatus = 'idle' | 'extracting' | 'complete' | 'error' | 'no_content'

export interface WizardAssumption {
  id: string           // temp UUID
  category: string     // 'sponsor_metadata'|'scope'|'timeline'|'budget'|'criteria'
  value: string        // assumption text (editable); maps to DB column 'content' on persist
  confidence: ConfidenceLevel
  source: string       // document filename or 'user-provided'
  status: AssumptionStatus
}

export interface MissingField {
  field: string        // e.g. 'primary_endpoint'
  description: string  // human-readable
  filledValue?: string // set when user fills the inline field
}

export interface WizardState {
  step: 0 | 1 | 2 | 3  // 0=StudyInfo, 1=DocumentUpload, 2=AssumptionReview, 3=Generate
  proposalId: string | null  // Set after proposal record created
  studyInfo: StudyInfo
  errors: Partial<Record<keyof StudyInfo, string>>
  submitting: boolean
  assumptions: WizardAssumption[]
  missingFields: MissingField[]
  extractionStatus: ExtractionStatus
  documentCount: number
  stateVersion: 6
}

export type WizardAction =
  | { type: 'SET_STEP'; step: 0 | 1 | 2 | 3 }
  | { type: 'SKIP_TO_GENERATE' }
  | { type: 'UPDATE_STUDY_INFO'; field: keyof StudyInfo; value: string | string[] }
  | { type: 'TOGGLE_SERVICE'; label: string }
  | { type: 'SET_ERRORS'; errors: Partial<Record<keyof StudyInfo, string>> }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_PROPOSAL_ID'; id: string }
  | { type: 'RESET' }
  | { type: 'SET_ASSUMPTIONS'; assumptions: WizardAssumption[]; missing: MissingField[] }
  | { type: 'UPDATE_ASSUMPTION'; id: string; updates: Partial<WizardAssumption> }
  | { type: 'SET_DOCUMENT_COUNT'; count: number }
  | { type: 'ADD_ASSUMPTION' }
  | { type: 'REMOVE_ASSUMPTION'; id: string }
  | { type: 'FILL_MISSING'; field: string; value: string }
  | { type: 'SET_EXTRACTION_STATUS'; status: ExtractionStatus }

export const DEFAULT_WIZARD_STATE: WizardState = {
  step: 0,
  proposalId: null,
  studyInfo: {
    sponsorName: '',
    therapeuticArea: '',
    indication: '',
    studyPhase: '',
    regions: [],
    dueDate: '',
    services: [],
  },
  errors: {},
  submitting: false,
  assumptions: [],
  missingFields: [],
  extractionStatus: 'idle',
  documentCount: 0,
  stateVersion: 6,
}

export const WIZARD_STEPS = ['Study Info', 'Document Upload', 'Assumption Review', 'Template & Generate'] as const
