import type { WizardAssumption } from '../types/wizard'

// ── Assumption persistence ───────────────────────────────────────────────────
//
// The wizard's step 2 -> 3 transition is the point where the user has finished
// reviewing assumptions, so it is the point where proposal_assumptions should
// match what they reviewed.
//
// It previously did `.upsert(approvedOnly)` with no `id` in the payload and no
// onConflict target. Supabase falls back to the primary key, the payload had
// none, so Postgres generated a fresh UUID and every call INSERTed. Three
// consequences, all live in production:
//
//   * Step 2's 'pending' insert was never updated, leaving an approved+pending
//     pair per assumption — 316 duplicate (proposal_id, content) groups across
//     648 of 950 rows.
//   * Going Back and Next again inserted another approved copy, which
//     generate-proposal-section then rendered as a duplicated prompt line.
//   * Nothing wrote rejections or removals, so an assumption approved once
//     stayed 'approved' for good. Approve -> Back -> Reject -> Next left the
//     row feeding the model. Editing the text left the pre-edit row behind.
//
// Replacing the set makes the write idempotent: whatever route the user took
// through the step, the table ends up holding exactly the current cards.

export interface AssumptionRow {
  proposal_id: string
  org_id: string
  category: string
  content: string
  confidence: string
  status: string
  user_edited: boolean
}

/** Map the wizard's in-memory cards to proposal_assumptions rows. */
export function buildAssumptionRows(
  proposalId: string,
  orgId: string,
  assumptions: WizardAssumption[]
): AssumptionRow[] {
  return assumptions
    // A card added but never typed into would otherwise persist as content:""
    // and reach the model as a bare "- [scope] " line.
    .filter((a) => a.value.trim().length > 0)
    .map((a) => ({
      proposal_id: proposalId,
      org_id: orgId,
      category: a.category,
      content: a.value.trim(),
      // Keep the real status. fetchAssumptions filters to 'approved', so
      // storing rejected and pending cards records the review without feeding
      // them to generation.
      status: a.status,
      confidence: a.confidence,
      user_edited: a.source === 'user-provided',
    }))
}

/** Minimal shape of the supabase client this module needs, so it can be faked in tests. */
interface AssumptionWriter {
  from(table: string): {
    delete(): { eq(column: string, value: string): PromiseLike<{ error: { message: string } | null }> }
    insert(rows: AssumptionRow[]): PromiseLike<{ error: { message: string } | null }>
  }
}

/**
 * Make proposal_assumptions hold exactly `assumptions` for this proposal.
 *
 * Delete-then-insert rather than a diff: the wizard has no stable DB ids for
 * its cards (Step 2 inserts without returning them and the card ids are
 * client-side UUIDs), and the reviewed set is small.
 */
export async function replaceProposalAssumptions(
  client: AssumptionWriter,
  proposalId: string,
  orgId: string,
  assumptions: WizardAssumption[]
): Promise<{ error: string | null }> {
  const { error: deleteError } = await client
    .from('proposal_assumptions')
    .delete()
    .eq('proposal_id', proposalId)

  // Bail rather than insert on top of rows we failed to clear — that is exactly
  // the duplication this function exists to remove.
  if (deleteError) return { error: deleteError.message }

  const rows = buildAssumptionRows(proposalId, orgId, assumptions)
  if (rows.length === 0) return { error: null }

  const { error: insertError } = await client.from('proposal_assumptions').insert(rows)
  return { error: insertError ? insertError.message : null }
}
