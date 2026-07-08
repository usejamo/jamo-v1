export type ProposalStatus = 'draft' | 'submitted' | 'won' | 'lost'

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
  updatedAt?: string
  indication?: string
  description?: string
  geography?: string[]
  selected_template_id?: string | null
}
