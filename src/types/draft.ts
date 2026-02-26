export type AnnotationSourceType = 'rfp' | 'kickoff' | 'template' | 'other'

export interface Annotation {
  sourceDoc: string
  sourceType: AnnotationSourceType
  quote: string
}

export type Segment =
  | { plain: string }
  | { text: string; annotation: Annotation }

export type ContentBlock =
  | { kind: 'p'; segments: Segment[] }
  | { kind: 'ul'; items: Segment[][] }
  | { kind: 'table'; headers: string[]; rows: string[][] }

export interface DraftSubsection {
  id: string
  title: string
  blocks: ContentBlock[]
}

export interface DraftSection {
  id: string
  title: string
  blocks: ContentBlock[]
  subsections?: DraftSubsection[]
}
