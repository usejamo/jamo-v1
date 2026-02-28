export type ProposalStatus = 'draft' | 'in_review' | 'submitted' | 'won' | 'lost'

export interface Proposal {
  id: string
  title: string
  client: string
  studyType: string
  therapeuticArea: string
  status: ProposalStatus
  dueDate: string
  value: number
  createdAt: string
  indication?: string
  description?: string
}
