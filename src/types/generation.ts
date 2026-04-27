export type SectionStatus = 'pending' | 'generating' | 'complete' | 'error'
export type ToneOption = 'formal' | 'regulatory' | 'persuasive'

export interface SectionState {
  id: string            // proposal_sections UUID — primary identifier (D-03)
  name: string          // display name from template
  position: number
  role: string | null   // nullable generation hint (D-03)
  status: SectionStatus
  liveText: string
  finalContent: string | null
  error: string | null
}

export interface GenerationState {
  isGenerating: boolean
  tone: ToneOption
  consistencyAnchor: string     // retained alongside priorSections as safety net (per discretion)
  sections: Record<string, SectionState>  // keyed by UUID
  completedCount: number
  totalCount: number
}

export type GenerationAction =
  | { type: 'SET_TONE'; tone: ToneOption }
  | { type: 'START_GENERATION'; sections: SectionState[] }
  | { type: 'SECTION_GENERATING'; sectionId: string }
  | { type: 'SECTION_TOKEN'; sectionId: string; token: string }
  | { type: 'SECTION_COMPLETE'; sectionId: string; content: string }
  | { type: 'SECTION_ERROR'; sectionId: string; error: string }
  | { type: 'SET_ANCHOR'; anchor: string }
  | { type: 'GENERATION_COMPLETE' }
  | { type: 'RESET' }

/** V2 payload for generate-proposal-section Edge Function (D-09) */
export interface GenerateSectionPayloadV2 {
  version: 2
  proposalId: string
  sectionId: string                      // proposal_sections UUID
  sectionName: string                    // display name from template section
  sectionDescription: string | null      // from template section — content scope for uploaded templates
  sectionRole: string | null             // soft prompt strategy hint (D-03)
  priorSections: Array<{
    id: string
    name: string
    content: string
  }>
  proposalContext: {
    studyInfo: {
      sponsorName: string
      therapeuticArea: string
      indication: string
      studyPhase: string
      countries: string[]
      dueDate: string
      services: string[]
    }
    assumptions: Array<{ category: string; value: string; confidence: string }>
    services: string[]
  }
  ragChunks: Array<{ content: string; doc_type: string; agency: string }>
  tone: ToneOption
  consistencyAnchor?: string             // retained as safety net alongside priorSections
  debug?: boolean
}

/** Payload for anchor-only mode (unchanged) */
export interface AnchorPayload {
  _anchorMode: true
  text: string
}
