export type SectionStatus = 'queued' | 'generating' | 'waiting' | 'complete' | 'error'
export type ToneOption = 'formal' | 'regulatory' | 'persuasive'
export type WaveNumber = 1 | 2 | 3

export interface SectionState {
  sectionKey: string
  sectionName: string
  wave: WaveNumber
  status: SectionStatus
  liveText: string
  finalContent: string | null
  error: string | null
}

export interface GenerationState {
  isGenerating: boolean
  currentWave: WaveNumber | null
  tone: ToneOption
  consistencyAnchor: string
  sections: Record<string, SectionState>
  completedCount: number
  totalCount: number
}

export type GenerationAction =
  | { type: 'SET_TONE'; tone: ToneOption }
  | { type: 'START_GENERATION' }
  | { type: 'SECTION_GENERATING'; sectionKey: string }
  | { type: 'SECTION_TOKEN'; sectionKey: string; token: string }
  | { type: 'SECTION_COMPLETE'; sectionKey: string; content: string }
  | { type: 'SECTION_ERROR'; sectionKey: string; error: string }
  | { type: 'SET_ANCHOR'; anchor: string }
  | { type: 'WAVE_COMPLETE'; wave: WaveNumber }
  | { type: 'GENERATION_COMPLETE' }
  | { type: 'RESET' }

export const SECTION_WAVE_MAP: Record<string, WaveNumber> = {
  understanding:       1,
  scope_of_work:       2,
  proposed_team:       2,
  timeline:            2,
  budget:              2,
  regulatory_strategy: 2,
  quality_management:  2,
  executive_summary:   3,
  cover_letter:        3,
} as const

export const SECTION_NAMES: Record<string, string> = {
  understanding:       'Understanding of the Study',
  scope_of_work:       'Scope of Work & Service Delivery',
  proposed_team:       'Proposed Team & Organizational Structure',
  timeline:            'Timeline & Milestones',
  budget:              'Budget & Pricing',
  regulatory_strategy: 'Regulatory Strategy',
  quality_management:  'Quality Management',
  executive_summary:   'Executive Summary',
  cover_letter:        'Cover Letter',
} as const

export const TOTAL_SECTIONS = Object.keys(SECTION_WAVE_MAP).length  // 9

/** Payload sent to generate-proposal-section Edge Function (per D-07) */
export interface GenerateSectionPayload {
  proposalId: string
  sectionId: string
  proposalInput: {
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
  consistencyAnchor: string
  tone: ToneOption
}

/** Payload for anchor-only mode */
export interface AnchorPayload {
  _anchorMode: true
  text: string
}

export function getWaveSections(wave: WaveNumber): string[] {
  return Object.entries(SECTION_WAVE_MAP)
    .filter(([, w]) => w === wave)
    .map(([key]) => key)
}

export function createInitialSections(): Record<string, SectionState> {
  const sections: Record<string, SectionState> = {}
  for (const [key, wave] of Object.entries(SECTION_WAVE_MAP)) {
    sections[key] = {
      sectionKey: key,
      sectionName: SECTION_NAMES[key],
      wave,
      status: 'queued',
      liveText: '',
      finalContent: null,
      error: null,
    }
  }
  return sections
}
