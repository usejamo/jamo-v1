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
  reference_override?: boolean | null
  // Lifecycle flags. ProposalsContext holds one array of every row the user can see
  // and derives the Active / Archived / Deleted lists from these two fields, so they
  // have to travel with the proposal rather than living in a separate id Set.
  // Optional because plenty of fixtures and object literals predate them; mapRow
  // always populates both.
  isArchived?: boolean
  deletedAt?: string | null
}
