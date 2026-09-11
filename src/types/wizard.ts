// Wizard type contracts — Phase 5 Proposal Creation Wizard + Phase 6 Assumption Extraction

export interface ServiceOption {
  label: string
  category: string
}

export interface StudyInfo {
  sponsorName: string
  therapeuticArea: string
  indication: string
  investigationalProduct: string  // optional; per-proposal, feeds generation
  investigationalProductUndisclosed: boolean  // sponsor blinded the product name; write around it, no placeholder
  studyPhase: string
  regions: string[]
  dueDate: string
  services: string[]  // label values of selected ServiceOptions
}

// Phase 6 assumption types
export type AssumptionStatus = 'pending' | 'approved' | 'rejected'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type ExtractionStatus = 'idle' | 'extracting' | 'complete' | 'error' | 'no_content'

// Assumption categories — the single source of truth.
//
// This list is NOT cosmetic. generate-proposal-section/promptAssembly.ts renders
// each assumption to the model as `- [${category}] ${content}` under a
// "## EXTRACTED ASSUMPTIONS" heading, so the category is an (uninstructed)
// semantic tag the model reads. Nothing in the code branches on it.
//
// These five are what extract-assumptions/index.ts actually emits and what all
// 950 production rows use. Three older comments disagreed with each other and
// with production — the migration documented a 'missing' value that has never
// existed, and omitted 'criteria', which is 12.6% of live rows. Prefer this
// list over any of them. proposal_assumptions.category is bare TEXT with no
// CHECK constraint; see coerceAssumptionCategory for why that is deliberate.
export const ASSUMPTION_CATEGORIES = [
  'sponsor_metadata',
  'scope',
  'timeline',
  'budget',
  'criteria',
] as const

export type AssumptionCategory = (typeof ASSUMPTION_CATEGORIES)[number]

export const ASSUMPTION_CATEGORY_LABELS: Record<AssumptionCategory, string> = {
  sponsor_metadata: 'Sponsor Info',
  scope: 'Scope',
  timeline: 'Timeline',
  budget: 'Budget',
  criteria: 'Eligibility Criteria',
}

export const DEFAULT_ASSUMPTION_CATEGORY: AssumptionCategory = 'scope'

// Narrow an untrusted category into the union, falling back to 'scope'.
//
// The values coming out of extract-assumptions are produced by an LLM, and
// Step2DocumentUpload batch-inserts them fire-and-forget behind a console.error.
// A DB CHECK constraint would turn one hallucinated category into a failed
// insert that silently loses the entire extraction batch, so validation lives
// here at the ingest boundary instead.
export function coerceAssumptionCategory(value: unknown): AssumptionCategory {
  if (typeof value !== 'string') return DEFAULT_ASSUMPTION_CATEGORY
  const normalized = value.trim().toLowerCase()
  return (ASSUMPTION_CATEGORIES as readonly string[]).includes(normalized)
    ? (normalized as AssumptionCategory)
    : DEFAULT_ASSUMPTION_CATEGORY
}

export interface WizardAssumption {
  id: string           // temp UUID
  category: AssumptionCategory
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
  selectedTemplateId: string | null  // null = no template selected (D-02)
  stateVersion: 9
}

export type WizardAction =
  | { type: 'SET_STEP'; step: 0 | 1 | 2 | 3 }
  | { type: 'SKIP_TO_GENERATE' }
  | { type: 'UPDATE_STUDY_INFO'; field: keyof StudyInfo; value: string | string[] | boolean }
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
  | { type: 'SET_TEMPLATE'; templateId: string | null }

export const DEFAULT_WIZARD_STATE: WizardState = {
  step: 0,
  proposalId: null,
  studyInfo: {
    sponsorName: '',
    therapeuticArea: '',
    indication: '',
    investigationalProduct: '',
    investigationalProductUndisclosed: false,
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
  selectedTemplateId: null,
  stateVersion: 9,
}

export const WIZARD_STEPS = ['Study Info', 'Document Upload', 'Assumption Review', 'Template & Generate'] as const
