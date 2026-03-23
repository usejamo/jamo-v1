// Wizard type contracts — Phase 5 Proposal Creation Wizard

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

export interface WizardState {
  step: 0 | 1 | 2           // 0=StudyInfo, 1=DocumentUpload, 2=Generate
  proposalId: string | null  // Set after proposal record created
  studyInfo: StudyInfo
  errors: Partial<Record<keyof StudyInfo, string>>
  submitting: boolean
}

export type WizardAction =
  | { type: 'SET_STEP'; step: 0 | 1 | 2 }
  | { type: 'SKIP_TO_GENERATE' }
  | { type: 'UPDATE_STUDY_INFO'; field: keyof StudyInfo; value: string | string[] }
  | { type: 'TOGGLE_SERVICE'; label: string }
  | { type: 'SET_ERRORS'; errors: Partial<Record<keyof StudyInfo, string>> }
  | { type: 'SET_SUBMITTING'; value: boolean }
  | { type: 'SET_PROPOSAL_ID'; id: string }
  | { type: 'RESET' }

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
}

export const WIZARD_STEPS = ['Study Info', 'Document Upload', 'Template & Generate'] as const
