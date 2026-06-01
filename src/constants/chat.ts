// Phase 14.2.2 — chat-related tuning constants.
// Cap on per (proposal_id, user_id) resolved_items entries (D-5).
export const RESOLVED_ITEMS_CAP = 25

// Max chars for ResolvedItem.applied_changes after concat + truncation (D-16).
export const APPLIED_CHANGES_MAX_CHARS = 200
