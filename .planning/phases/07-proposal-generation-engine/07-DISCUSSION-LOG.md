# Phase 7: Proposal Generation Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 07-proposal-generation-engine
**Areas discussed:** Section dependency order, Streaming UI, Generation model, Edge Function input contract

---

## Section Dependency Order

| Option | Description | Selected |
|--------|-------------|----------|
| Linear top-to-bottom | Generate in document order, anchor accumulates naturally | |
| Foundation-first | Understanding first → parallel body → summary sections last | ✓ |
| User-defined order | User picks section order from UI, no enforced sequence | |

**User's choice:** Foundation-first with three explicit phases — anchor, parallel body sections, summary sections.
**Notes:** Understanding of the Study generates first as the factual anchor. Body sections (Scope, Team, Timeline, Budget, Regulatory, Quality) run in parallel after Wave 1. Executive Summary and Cover Letter generate last as they summarize everything.

---

## Streaming UI (Phase 7 rendering)

| Option | Description | Selected |
|--------|-------------|----------|
| Streaming cards in ProposalDraftRenderer | Extend existing renderer with per-section streaming cards; Phase 8 swaps for TipTap | ✓ |
| Dedicated GenerationView component | New component for streaming experience; replaced by full workspace in Phase 8 | |

**User's choice:** Streaming cards in ProposalDraftRenderer.
**Notes:** Extend the existing component rather than build a new one. Each card shows live buffer while streaming, snaps to final on close. Phase 8 replaces with TipTap — no TipTap in Phase 7.

---

## Generation Model

| Option | Description | Selected |
|--------|-------------|----------|
| Claude Sonnet | claude-sonnet-4-6 — balanced quality/cost/latency | ✓ |
| Claude Opus | claude-opus-4-6 — maximum quality, highest cost | |
| Configurable per proposal | User/org selects model tier at generation time | |

**User's choice:** Claude Sonnet (`claude-sonnet-4-6`).
**Notes:** Consistency anchor always uses Haiku. Main generation uses Sonnet for MVP.

---

## Edge Function Input Contract

| Option | Description | Selected |
|--------|-------------|----------|
| Client passes full payload | Client assembles everything; EF is stateless | ✓ |
| Edge Function fetches from DB | EF takes proposalId + sectionId, fetches everything itself | |

**User's choice:** Client passes full payload.
**Notes:** Client orchestrator owns assembly of ProposalInput, RAG chunks, and consistency anchor. Edge Function receives complete payload, calls Anthropic with streaming, writes result to DB on stream close.

---

## Claude's Discretion

- Exact prompt assembly per section
- `[PLACEHOLDER: ...]` marker format
- Supabase Realtime subscription approach
- Error recovery for failed section streams

## Deferred Ideas

None.
