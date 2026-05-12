---
phase: "13"
plan: "06"
status: complete
completed: "2026-05-11T00:00:00Z"
---

# Summary: Usage Events Tracking

## What Was Done

- Added `usage_events` insert to `generate-proposal-section` `flush()` after writing section content
- Added `usage_events` insert to `section-ai-action` after streaming completes
- Fixed FK constraint: `usage_events_user_id_fkey` was pointing to `user_profiles.id` (PK) instead of `auth.users(id)` — inserts were silently failing with a FK violation on every AI call
- Fixed Dashboard `generatedCount` to count distinct `proposal_id` values from `ai_section_call` events instead of phantom `proposal_generated` event type that was never emitted
- Deployed `generate-proposal-section` v16 (also restored placeholder span wrapping broken by an uncommitted manual deploy) and `section-ai-action` v10

## Outcome

Dashboard "Generated This Month" KPI now shows the correct count of distinct proposals with AI-generated sections this month. "AI calls made" sub-text also updates correctly on each section generation.
