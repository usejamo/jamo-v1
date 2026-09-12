import type { SectionState } from '../types/generation'

/**
 * Pure progress derivation for proposal generation.
 *
 * Everything here partitions and classifies sections by CONTENT, never by status.
 * Status drifts: a section interrupted mid-stream is stranded at 'generating' with
 * nothing written, and a handful of rows carry editor-saved content under that same
 * status. Content is the only field that reliably answers "is there work here to keep".
 */

/** Shape of a `proposal_sections` row as selected by the generation code paths. */
export interface SectionRow {
  id: string
  name: string | null
  section_key?: string | null
  description?: string | null
  position: number | null
  role: string | null
  status: string | null
  content: string | null
}

/** A section counts as done if, and only if, it holds non-whitespace content. */
export function hasContent(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.trim().length > 0
}

const byPosition = (a: SectionRow, b: SectionRow) =>
  (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER)

/**
 * Split rows into the work already banked and the work still to do.
 * `done` is never regenerated; `todo` is what a resume loops over.
 */
export function partitionSections(rows: SectionRow[]): {
  done: SectionRow[]
  todo: SectionRow[]
} {
  const done: SectionRow[] = []
  const todo: SectionRow[] = []
  for (const row of rows) {
    if (hasContent(row.content)) done.push(row)
    else todo.push(row)
  }
  return { done: done.sort(byPosition), todo: todo.sort(byPosition) }
}

/**
 * The text the consistency anchor is rebuilt from on resume.
 *
 * The anchor is memoryless — it is a summary of the immediately preceding section
 * only, replaced (not accumulated) after each one. So re-deriving it from the
 * highest-position completed section reproduces exactly the value the loop held.
 */
export function pickAnchorSource(done: SectionRow[]): string {
  if (done.length === 0) return ''
  const last = [...done].sort(byPosition)[done.length - 1]
  return last.content ?? ''
}

/**
 * Map a DB row to reducer state.
 *
 * A row stranded at 'generating' with no content is normalised to 'pending': no loop
 * is running behind it, so presenting it as in-progress would show a spinner that
 * never resolves. A row with content is 'complete' whatever its status column says.
 */
export function rowToSectionState(row: SectionRow): SectionState {
  const complete = hasContent(row.content)
  return {
    id: row.id,
    name: row.name ?? row.section_key ?? 'Section',
    position: row.position ?? 99,
    role: row.role ?? null,
    status: complete ? 'complete' : 'pending',
    liveText: '',
    finalContent: complete ? row.content : null,
    error: null,
  }
}

export type GenerationPhase = 'not-started' | 'generating' | 'paused' | 'complete'

/**
 * Which generation UI to show. Derived from the data — never from sessionStorage,
 * which is per-tab and goes stale the moment generation is interrupted.
 *
 * Reads SectionState.finalContent (NOT SectionRow.content, and never liveText,
 * which is unpersisted streaming scratch).
 */
export function derivePhase(
  isGenerating: boolean,
  sections: SectionState[],
  totalCount: number
): GenerationPhase {
  if (isGenerating) return 'generating'
  if (totalCount === 0) return 'not-started'
  const doneCount = sections.filter(s => hasContent(s.finalContent)).length
  if (doneCount === 0) return 'not-started'
  return doneCount < totalCount ? 'paused' : 'complete'
}
