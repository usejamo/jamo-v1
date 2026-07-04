---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: unknown
stopped_at: context exhaustion at 90% (2026-06-17)
last_updated: "2026-06-17T22:31:00.606Z"
progress:
  total_phases: 24
  completed_phases: 22
  total_plans: 113
  completed_plans: 113
  percent: 100
---

## Project Status

| Item | Status |
|------|--------|
| PROJECT.md | Complete |
| REQUIREMENTS.md | Complete |
| Codebase map | Complete (.planning/codebase/) |
| Research | Complete (.planning/research/) |
| Phase execution | Phases 01–07 COMPLETE. Phase 08 (Section Workspace & Rich Text Editor) is next. |

---

## Next Action

Phase 08: Section Workspace & Rich Text Editor. TipTap v2 replaces ProposalDraftRenderer with a full editing workspace.

## Last Session

**Stopped at:** context exhaustion at 90% (2026-06-17)
**Session date:** 2026-06-11

## Roadmap Evolution

- Phase 11.1 added: DOCX template style extraction (REQ-10.4b) — unzip org DOCX, extract styles.xml, inject into generated export
- Phase 12.1 added: Salesforce Data Sync — salesforce-sync Edge Function, Step 1 pre-population, status write-back, graceful degradation (split from Phase 12 which shipped OAuth-only)
- Phase 14.2.2 inserted after Phase 14.2.1: Resolved Items as Stateful Co-pilot Memory (URGENT) — wires `chat_sessions.resolved_items` so Haiku evolves findings instead of repeating them verbatim; fixes dismissal-persistence bug as a side effect. CONTEXT.md authored by user with locked architectural decisions; awaiting /gsd-discuss-phase 14.2.2.
- Phase 14.2.3 inserted after Phase 14.2: Fix Gap Analyzer Context Starvation (URGENT) — replaces the 300-char Haiku excerpt slice with full content (5000-char ceiling), sharpens prompt for placeholder detection, persists the whole-proposal content hash to gate the mount trigger, and rebalances tier caps. EXECUTED + verified (6/6 code must-haves). Edge fn deployed live as v8 — root cause of the "no findings" symptom was a STALE DEPLOYMENT (execute-phase commits but never deploys edge fns). 4 live-UAT items remain (14.2.3-HUMAN-UAT.md).
- Phase 14.2.4 inserted after Phase 14.2.3: Placeholder Resolution Ask-Then-Fill (URGENT) — surfaced by 14.2.3 live UAT: clicking "Fix it" on a placeholder finding force-calls propose_edit (chat-with-jamo:112-122) and bars ask_user, so the agent rewrites the section without filling the placeholder. Root-cause brief in 14.2.4/CONTEXT.md; fix approach (ask-then-fill vs auto-fill) is an open design decision → /gsd-discuss-phase 14.2.4.
- Phase 15 added: Client Onboarding & Provisioning — replaces interim demo signup with sales-led, invite-only provisioning (admin creates org + invites first admin via Supabase auth.admin; org admin invites teammates). Includes org-creation flow, production SMTP config, lightweight internal admin surface. Adjacent security fix: chat-with-jamo must derive user_id from JWT not request body. Open forks for spec: self-serve org-admin invites in v1 vs us-provisions-everything; email provider; admin panel now vs script. → /gsd-spec-phase 15.
- Phase 15 SPEC + CONTEXT locked (2026-07-03). SPEC.md: 15 requirements, ambiguity 0.13. CONTEXT.md decisions: dedicated `invites` table as sole source of truth; identity binding via `handle_new_user` trigger reading the pending invites row by email (no app_metadata mirror, atomic, single-path trigger that RAISEs on no-match — "no auth user without a pending invite" is an intentional DB-layer guardrail); Resend via Supabase custom SMTP (v1); dedicated /admin route for platform panel + Settings "Team" tab for org-admin member mgmt; super_admin bootstrap = idempotent admin-API script (Approach A: internal org → pending invite → createUser → flip accepted); cross-org admin ops via narrow service-role edge functions (super_admin RLS bypass stays limited to `organizations`); JWT identity fix for chat-with-jamo + salesforce-oauth-* + retrieve-context. Verified finding: only `organizations` has a super_admin RLS bypass — all other tables scope by home org_id, hence service-role edge functions for cross-org. Ready for /gsd-plan-phase 15.

---

## Active Decisions

- **Two-step attribution lookup (14.2.4-04):** At propose_edit arrival, takeSnapshot (Map, direct propose_edit path) runs first; if null, falls back to activeTask?.originating_snapshot (ask-then-fill path — survived ask hop + reload). Direct propose_edit path invariant preserved.
- **Snapshot-in-cta_payload (14.2.4-04):** originating_snapshot embedded in cta_payload at CTA-click (not a new request-body field) so the edge reads it at ask_user dispatch time without wire changes.
- **onSkip defer = discard path (14.2.4-04):** AskUserCard onSkip reuses exact stop-walkthrough/discard body (status:'discarded', NO resolved_items write — D-09 load-bearing invariant). Defer and queue-dismiss stay distinct terminal states.
- **Gap analyzer excerpt (14.2.3-01):** Full section content sent to Haiku up to a 5000-char ceiling; over-ceiling sections cut + clearly-meta end-marker `[…section truncated for length…]`. 300-char slice removed. Single Haiku call preserved.
- **Placeholder few-shots (14.2.3-01):** Exactly 4 OUTPUT: lines — original TBD example folded into the Family 4 (explicit-marker) example. Optional D-1 prompt line ("judge truncated sections on visible content only") was added.
- **Tier caps (14.2.3-01):** QUEUE_CAP 10; TIER_CAPS { compliance: 4, conflict: 2, gap: 4, missing: 4 }.
- **Persisted content-hash gate (14.2.3-02, D-3/D-4):** New nullable `chat_sessions.pending_actions_content_hash text` (migration `20260603000001`, live + types regenerated). The edge writes it as a SIBLING key in the SAME `chat_sessions` upsert as `pending_actions` (atomic desync guard; `contentHash ?? null` so old clients write null). The client sends `content_hash: hash` in the invoke body and, on mount, reads the persisted hash via per-(proposal,user) `.maybeSingle()` and SKIPS the Haiku invoke when it equals the current `computeHash` (seeding `hashRef`); null/mismatch runs. Precedence: client gate FIRST, 30s server cooldown is the backstop. analyze-proposal-gaps audited as the SOLE writer of `pending_actions` (chat-with-jamo only selects it). AI-SPEC 300-char note annotated SUPERSEDED.
- **Resolve-time flush-then-hash (14.2.3-03, D-6):** `SectionEditorHandle.saveNow` exposed (delegates to useAutosave.saveNow — no duplicated persistence). Dismiss handler awaits `saveNow(html)` then hashes THAT exact string via buildResolvedItemEntry, closing the ~1500ms autosave-debounce divergence window. saveNow failure is caught + console.debug'd and never blocks the resolve (falls back to in-memory hash). AIChatPanel writes proposal_sections through saveNow only — zero direct writes.
- **Accept-path equality (14.2.3-03, D-6):** No new saveNow needed — accept handler already flushes via `await saveNow(acceptedHtml)` at SectionEditorBlock.tsx:354 before useResolvedItemsWriteOnTerminal reads workspace content; DB == hashed content. No gap.
- **SSE streaming pattern:** Raw `fetch()` for generate-proposal-section (not supabase.functions.invoke which buffers) — VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY in headers
- **Realtime fallback:** 10s setTimeout dispatches SECTION_COMPLETE from local SSE text if Realtime hasn't confirmed
- **RAG non-blocking:** fetchRagChunks returns [] on error — RAG enhances but does not block generation
- **Env file location:** `.env` (not `.env.local`) — project already used .env; both are gitignored, Vite reads both
- **Supabase project ref:** `fuuvdcvbliijffogjnwg` (live project, region: auto)
- **Key name:** `VITE_SUPABASE_PUBLISHABLE_KEY` (new Supabase post-Nov 2025 naming, not VITE_SUPABASE_ANON_KEY)
- **Test mock pattern:** Inline `vi.mock('../../lib/supabase', () => ({ supabase: { from: vi.fn()... } }))` — NOT `() => import(...)` which resolves the full supabase-js module and OOMs
- **No renderHook in context tests:** `@testing-library/react` pulls react-dom; OOMs even with 4GB heap on dev machine — use import assertions instead
- **vitest version:** 4.0.4 (4.0.18 has known memory leak regression, GitHub issue #9560)
- **vitest pool:** `forks` + `singleFork: true` + `execArgv: ['--max-old-space-size=4096']` + `environment: happy-dom`
- **Stub test pattern:** Use `it.skip` (not dynamic imports) for tests targeting files not yet created — Vite resolves all imports at transform time
- **test:run scope:** No --coverage flag to keep runs under 15 seconds
- **Editor:** TipTap v2 (replaces ProposalDraftRenderer)
- **Backend:** Supabase (Edge Functions, Postgres, Storage, Auth, Realtime, pgvector)
- **AI:** Anthropic Claude (claude-sonnet-4-5 for generation, claude-haiku for extraction/anchors)
- **Embeddings:** OpenAI text-embedding-3-small (Anthropic has no embedding API)
- **PDF parsing:** npm:pdf-parse via lib path (Deno) — prototype before full wiring
- **DOCX export:** `docx` npm package, client-side
- **XLSX:** pin to npm:xlsx@0.18.5 (0.19+ proprietary license)
- **Salesforce auth:** JWT Bearer Token flow via Deno Web Crypto
- **Streaming:** Two-phase (buffer SSE → load TipTap on complete)
- **Generation order:** Study Understanding first, Cover Letter last
- **pgvector column notation:** `extensions.vector(1536)` (not `vector(1536)`) — pgvector installed in extensions schema (migration 001)
- **HNSW over IVFFlat:** HNSW builds immediately on empty table; IVFFlat requires training data first
- **Storage path convention:** `{org_id}/{proposal_id}/{filename}` — org enforced via `(storage.foldername(name))[1]`
- **Storage bucket creation:** Via Supabase dashboard (SQL cannot create Storage buckets), policies written in SQL migrations
- **Deferred push pattern:** All 14 migration files written in Plans 02-03, pushed atomically once in Plan 04
- **Auth method response pattern:** signIn, signOut, signUp return raw Supabase response ({ data, error }) — let callers handle errors for flexible UX control

- **js-tiktoken export name:** `getEncoding` (camelCase) — plan spec had `get_encoding` (snake_case); corrected in chunker.ts
- **Vitest/Deno compat pattern:** `denoSpecifierStubPlugin` in vitest.config.ts stubs `jsr:` and `npm:` specifiers — `@vite-ignore` comments alone insufficient for Vite transform-time resolution
- **CLI/test isolation:** `import.meta.main` guard in ingest-regulatory.ts prevents CLI code from executing under Vitest
- **Edge Function utilities inlined:** mergeHybridResults and buildSystemPromptBlock duplicated in index.ts — Deno Edge runtime cannot resolve src/lib/ imports at deploy time
- **Hybrid merge in app layer:** 70/30 vector+FTS weighted merge done in application layer (not SQL UDF) — keeps RPCs simple
- **System prompt block format is versioned contract:** [REGULATORY CONTEXT]/[PROPOSAL HISTORY]/[INSTRUCTIONS] — Phase 7 depends on this exact format
- **Step2DocumentUpload owns document polling:** WizardState has no documents field — component fetches/polls Supabase directly by proposalId
- **prevStepRef for step-transition side effects:** tracks previous step in ProposalCreationWizard to trigger assumption upsert on 2→3 transition without re-running on unrelated state changes
- **mapConfidence and parseClaudeResponse exported:** from extract-assumptions/index.ts to enable unit testing without live Supabase/Anthropic connections

- **Login page layout:** Full-screen centered card (not floating modal) — provides clear focus on authentication flow
- **ProtectedRoute pattern:** Uses React Router v7 Outlet pattern — clean separation of auth logic from route definitions
- **Layout placement:** Nested inside ProtectedRoute — ensures Sidebar only renders for authenticated users

- **TipTap immediatelyRender: false:** Required for React 19 hydration safety — prevents SSR/CSR mismatch on editor mount
- **editorRefs as useRef<Map>:** Stores SectionEditorHandle per section for Phase 9 injection without triggering re-renders
- **Autosave cancel on unmount:** useAutosave.cancel() called in useEffect cleanup to prevent stale Supabase writes
- **SectionWorkspace wraps inner component:** SectionWorkspaceProvider co-located with layout — inner component consumes context
- **useSectionAIAction uses raw fetch SSE:** Same pattern as useProposalGeneration — no buffering via supabase.functions.invoke
- **Pre-action snapshot before streaming:** D-02 — version written to proposal_section_versions before streaming starts
- **Version pruning at 20:** Oldest entries deleted when count exceeds 20 per section
- **Rewrite = higher friction UX:** Two-column diff + confirm-before-discard; other actions use inline preview
- **Accept injects via setContent (D-05):** TipTap command API only, post-accept version entry written after injection
- **Compliance fires on accept (D-13):** checkCompliance called after setContent in accept handler, not on stream complete
- **Two-pass compliance (D-14):** Rule-based first (word count, placeholders, section keywords), Haiku only if rules pass
- **Consistency check auto-triggers (D-12):** useEffect in SectionWorkspace detects all-complete, fires consistency-check invoke once via consistencyChecked ref

- **activeSectionKey lift pattern:** SectionWorkspace exposes onActiveSectionChange callback — AIChatPanel is outside SectionWorkspaceProvider tree so cannot call useSectionWorkspace() directly
- **StreamingContent merge on [DONE]:** accumulate in state during stream, merge into messages array on completion to avoid layout thrash during fast streaming
- **handleAcceptEdit via insertContentAt(0):** injects edit proposal content into active section editor via editorRefs Map — D-07 undoable injection pattern

- **detectGaps order:** checks placeholder first, then error status, then thin content — continues to next section after first match
- **buildSlidingWindow granularity:** stops on first message that exceeds char budget (no partial/mid-message truncation)
- **AIChatPanel stubs:** use it.skip (not dynamic imports) — Vite resolves all imports at transform time; component implemented in Plan 01

- **Compliance flags persistence (D-02/D-03):** persistFlags upserts to proposal_sections.compliance_flags after every SET_COMPLIANCE_FLAGS dispatch; silent-fail; DB flags loaded as optimistic cache on mount, background re-check at 500ms per D-02 staleness policy

- **STATUS_LABELS/STATUS_COLORS shared from StatusSelector.tsx:** Single source of truth for status display config; downstream pages (Dashboard, ProposalsList, ProposalDetail) import from StatusSelector.tsx
- **Terminal status confirmation gate:** won/lost transitions gated behind confirmation modal in StatusSelector; all other transitions apply immediately on click
- **updateStatus is a thin wrapper:** delegates to updateProposal(id, { status }) — no direct Supabase call, reuses camelCase→snake_case mapping
- **ProposalsList archived/deleted tabs:** Direct Supabase queries on tab switch, scoped by org_id + RLS; active tab uses ProposalsContext proposals (already filtered at source)
- **StatusSelector stopPropagation in list rows:** Compact StatusSelector container uses onClick stopPropagation to prevent row navigation when opening dropdown

## Critical Risks to Watch

1. `pdf-parse` Deno import gotcha — prototype in Phase 3 before full wiring
2. Edge Function 150s timeout — section-by-section + Realtime polling mitigates this
3. TipTap React 19 compatibility — smoke-test on install in Phase 8
4. SheetJS license — pin to 0.18.5 strictly
5. pgvector version on Supabase project — check HNSW availability before Phase 4

---

## Completed Plans

### Phase 01: Supabase Foundation

- **Plan 00** (2026-03-05): Test infrastructure — vitest + jsdom + Supabase mock + stub tests. `npm run test:run` exits 0 in 1.28s.
- **Plan 01** (2026-03-06): Supabase client singleton — @supabase/supabase-js installed, CLI linked to project fuuvdcvbliijffogjnwg, src/lib/supabase.ts typed with Database generic, placeholder types in src/types/database.types.ts. `npm run test:run` exits 0 in 1.29s.
- **Plan 02** (2026-03-06): Database schema migrations (001-009, 012-013) — organizations, user_profiles, proposals, proposal_sections, proposal_documents, document_extracts, proposal_assumptions, proposal_chats, rls_helper_functions, rls_policies. 11 migration files written.
- **Plan 03** (2026-03-06): Infrastructure migrations — regulatory_chunks (pgvector HNSW, extensions.vector(1536)), usage_events (org RLS, audit trail), storage_policies (4 storage.objects RLS policies + usage_events_all). Migration files 010, 011, 014 written; private 'documents' bucket created in dashboard.
- **Plan 04** (2026-03-06): All 14 migrations pushed atomically to project fuuvdcvbliijffogjnwg. database.types.ts generated (700 lines). AuthContext created (session/user/profile/loading). ProposalsContext migrated to async Supabase CRUD.
- **Plan 05** (2026-03-06): DeletedContext (proposals.deleted_at soft-delete), ArchivedContext (proposals.is_archived toggle). AuthProvider wired as outermost in App.tsx. 7 tests green.

---

## Key Files

| File | Purpose |
|------|---------|
| `.planning/PROJECT.md` | Full project context + 13 feature decisions + architecture principles |
| `.planning/REQUIREMENTS.md` | 12 requirement groups, REQ-1.x through REQ-12.x |
| `.planning/ROADMAP.md` | 13-phase MVP plan + Milestone 2 backlog |
| `.planning/codebase/` | Full codebase map (7 documents) |
| `.planning/research/` | 4 research documents from parallel agents |
| `cro-proposal-generator.js` | Anthropic API module — production-ready, not yet wired |
| `cro_proposal_prompt_template.md` | Prompt template reference doc |
| `src/components/AIChatPanel.tsx` | Demo AI chat — to be upgraded in Phase 9 |
| `src/components/ProposalDraftRenderer.tsx` | Read-only renderer — to be replaced by TipTap in Phase 8 |

### Phase 06: AI Assumption Extraction

- **Plan 00** (2026-03-23): Wave 0 Nyquist stubs — 3 test stub files (Step3AssumptionReview.test.tsx x8 stubs, AssumptionCard.test.tsx x6 stubs, extract-assumptions/test.ts x5 Deno stubs). All REQ-3.1 through REQ-3.7 have named verify targets. `npm run test:run` exits 0 with 55 passing + 14 skipped.
- **Plan 01** (2026-03-23): Wizard type contracts extended — WizardAssumption, MissingField, ExtractionStatus, AssumptionStatus, ConfidenceLevel types added. WizardState.step widened to 0|1|2|3. stateVersion:6 guard clears stale sessionStorage. WIZARD_STEPS has 4 entries. Step3Generate renamed to Step4Generate with assumption count display. All 56 tests pass.
- **Plan 02** (2026-03-23): extract-assumptions edge function — Deno function calling Claude Haiku via HTTP API. Fetches document_extracts, builds prompt, parses JSON with regex+try/catch (graceful failure), maps float confidence to string, bulk-inserts to proposal_assumptions (content column). Deploy blocked by auth gate (supabase login required).
- **Plan 03** (2026-03-23): Step3AssumptionReview component — AssumptionCard, ConfidenceBadge, MissingFieldItem inline sub-components. Approve/reject/un-reject/inline-edit controls dispatch correct actions. Missing fields amber section. Next button with unfilled count badge. All REQ-3.3, REQ-3.4, REQ-3.5, REQ-3.7 tests passing. 70/70 tests green.
- **Plan 04** (2026-03-23): Extraction trigger wired into Step2DocumentUpload (useRef fire-once guard, all-docs-complete detection, fire-and-forget invoke). ProposalCreationWizard renders Step3AssumptionReview at step===2. Approved assumptions upserted to proposal_assumptions on step 2→3 via prevStepRef. Deno stubs converted to 11 real tests (mapConfidence boundaries, parseClaudeResponse shape/categories/regex/graceful-fail, DB schema mapping). 71/71 tests green. Awaiting human verify checkpoint.

### Phase 02: Authentication & Routing

- **Plan 01** (2026-03-06): Auth methods — Extended AuthContext with signIn, signOut, signUp methods delegating to Supabase auth. TDD implementation with 4 new tests, all 11 tests passing. Auth state auto-synced via onAuthStateChange.
- **Plan 03** (2026-03-06): Logout & Profile Display — Added logout button to Sidebar calling signOut and navigating to /login. Added Profile tab to Settings as first tab, displaying user name, email, role (as badge), and org_id. Role awareness foundation for REQ-8.3.

### Phase 05: Proposal Creation Wizard

- **Plan 00** (2026-03-23): Wave 0 Nyquist stub file — 8 it.skip tests covering REQ-1.1, 1.2, 1.5, 1.6, 1.7, 9.4. No component import (Vite resolves imports at transform time). `npm run test:run` exits 0.
- **Plan 01** (2026-03-23): Type contracts — `src/types/wizard.ts` with `ServiceOption`, `StudyInfo`, `WizardState`, `WizardAction`, `DEFAULT_WIZARD_STATE`, `WIZARD_STEPS`. `AVAILABLE_SERVICES` restructured to `{label, category}[]` with `groupServicesByCategory` in `cro-proposal-generator.js`. 45 passing + 8 skipped.
- **Plan 02** (2026-03-23): Wizard shell — `WizardStepIndicator.tsx` (numbered step header, backward nav, jamo color scheme) and `ProposalCreationWizard.tsx` (wizardReducer, sessionStorage persist/hydrate/clear, SKIP_TO_GENERATE, placeholder step panels). REQ-1.1, REQ-1.5, REQ-1.6 stubs converted to passing tests. 55 tests (50 passing + 4 skipped + 1 pre-existing flaky).
- **Plan 04** (2026-03-23): Step 2 (document upload informational), Step 3 (ContextSummary + Generate button), ProposalCreationWizard wired with handleGenerate/navigate, ProposalEditorModal branching wizard vs edit form. REQ-9.4 passing. 55/55 tests green.
- **Plan 03** (2026-03-23): Step 1 Study Info form — `Step1StudyInfo.tsx` with 4 required fields (sponsor name, therapeutic area, indication, study phase), optional due date + regions, grouped services pill toggles from AVAILABLE_SERVICES. Validation blocks Next on empty required fields with inline errors. ProposalCreationWizard updated to render Step1StudyInfo. Pre-existing DocumentList polling flake fixed. REQ-1.2 and REQ-1.7 passing. 54 passing + 1 skipped (REQ-9.4).

### Phase 04: Regulatory Knowledge Base & RAG

- **Plan 00** (2026-03-20): Wave 0 test stub scaffolding — 4 Nyquist-compliant stub files (chunker.test.ts, retrieval.test.ts, ingest.test.ts, retrieve-context/test.ts). All use it.skip / Deno ignore:true per stub test pattern. `npm run test:run` exits 0 with 34 passing + 11 skipped.
- **Plan 01** (2026-03-20): Chunks table migration 015 — DROP regulatory_chunks, CREATE chunks with org_id, doc_type, embedding extensions.vector(1536), search_vector TSVECTOR, HNSW index (m=16, ef_construction=64), GIN index, composite (org_id, doc_type) index, tsvector trigger, RLS org isolation policy. `supabase db push` requires `npx supabase login` first.
- **Plan 02** (2026-03-20): Regulatory ingestion pipeline — chunkDocument (js-tiktoken cl100k_base, section-boundary split, 400-600 token chunks, 100-token overlap), embedBatch (batches=100, 1536-dim assert, exp backoff on 429), ingest-regulatory.ts CLI (--org-id/--agency/--dir/--dry-run), regulatory-docs/ICH/FDA/EMA dirs. denoSpecifierStubPlugin in vitest.config.ts for jsr:/npm: compat. 47/47 tests passing.
- **Plan 03** (2026-03-20): Retrieval layer — mergeHybridResults (70/30 vector+FTS weighted merge, Map-based dedup), buildSystemPromptBlock (versioned [REGULATORY CONTEXT]/[PROPOSAL HISTORY]/[INSTRUCTIONS] format), retrieve-context Edge Function (org-scoped hybrid search, OpenAI query embedding, belowThreshold warning, RetrieveResponse). 6 vitest tests + 4 Deno tests passing.
- **Plan 05** (2026-03-20): Gap closure — confirmed regulatory-docs/ICH/.gitkeep, FDA/.gitkeep, EMA/.gitkeep already committed in 04-02 (4f6e24d). REQ-7.7 directory structure gap closed.

### Phase 03: Document Upload & Parsing Pipeline

- **Plan 00** (2026-03-07): Test infrastructure scaffolding (Wave 0) — Created UI component test stubs (FileUpload.test.tsx with 5 todo tests, DocumentList.test.tsx with 4 todo tests) and Edge Function test harnesses (extract-document-poc/test.ts, extract-document/test.ts with 5 stub tests). Added 4 minimal valid test fixtures (test-rfp.pdf, test-protocol.docx, test-budget.xlsx, corrupt.pdf). Nyquist compliance achieved for Phase 3.
- **Plan 01** (2026-03-07): FileUpload component — Drag-and-drop file upload with direct browser → Supabase Storage upload (no proxy). Validates file types (PDF/DOCX/XLSX/TXT) and size (max 50MB). Org-scoped storage paths ({org_id}/{proposal_id}/{filename}). Inserts proposal_documents row with parse_status='pending'. Per-file status tracking with visual indicators (spinner/check/X). Storage cleanup on database errors. TDD with 5 tests passing.
- **Plan 02** (2026-03-07): DocumentList component — Displays uploaded documents with color-coded status badges (gray/blue/green/red for pending/extracting/complete/error). Polls every 2s when documents extracting. Delete removes from Storage + database. TDD with chainable mock query builder. 5 tests passing.
- **Plan 04** (2026-03-07): extract-document Edge Function — Deno edge function using pdf-parse, mammoth, xlsx for text extraction from PDF/DOCX/XLSX/TXT. Inserts into document_extracts, updates parse_status. Deployed with --no-verify-jwt.
- **Plan 05** (2026-03-19): End-to-end pipeline wiring — FileUpload triggers extract-document fire-and-forget after upload. DocumentList polls on pending+extracting status. ProposalDetail wired with real components. UAT fixes: uploaded_by FK, RLS subquery policy. Full pipeline verified end-to-end.

### Phase 08: Section Workspace & Rich Text Editor

- **Plan 01** (2026-03-26): Core editing workspace — SectionWorkspaceContext (useReducer, 16 action types), useAutosave (1500ms debounce to last_saved_content), SectionEditorBlock (TipTap per-section editor, immediatelyRender:false, lock/unlock, autosave, SectionEditorHandle ref), SectionWorkspace (three-panel layout: nav + editors + Phase 9 slot, IntersectionObserver active tracking, editorRefs Map). REQ-5.1, REQ-5.2, REQ-5.4 complete.
- **Plan 02** (2026-03-27): Per-section AI action toolbar & preview system — useSectionAIAction (SSE streaming, pre-action snapshot, version pruning), SectionActionToolbar (Generate/Regenerate/Expand/Condense/Rewrite, lock/history icons, 44px touch targets), AIActionPreview (inline Expand/Condense preview, Accept/Decline, dcfce7 flash), RewriteDiffView (two-column before/after diff, Apply Rewrite/Discard with confirm). SectionEditorBlock wired to render preview below editor; setContent injection (D-05). REQ-5.3 complete.
- **Plan 04** (2026-03-27): Compliance flags & consistency check — useComplianceCheck (two-pass: rule-based word count/placeholder/keyword then Haiku-on-accept), ComplianceFlag/ComplianceFlagList (amber/red chips), ConsistencyCheckBanner (framer-motion, dismissible), consistency-check Deno edge function (Haiku cross-section review). Fires on accept (D-13), Haiku only if rules pass (D-14), consistency auto-triggers after all-complete (D-12). REQ-5.7 and REQ-5.8 complete.
- **Plan 05** (2026-03-27): SectionWorkspace integration into ProposalDetail — replaces ProposalDraftRenderer for completed sections; ProposalDraftRenderer retained for streaming mode. Activated test stubs: SectionWorkspace.test.tsx (2 passing), SectionActionToolbar.test.tsx (5 passing). Total 18 editor tests passing. Awaiting human-verify checkpoint (Task 2).

### Phase 999.1: Persist Compliance Flags to DB

- **Plan 01** (2026-04-02): Migration + write path — `supabase/migrations/20260402000021_compliance_flags_jsonb.sql` adds `compliance_flags JSONB NOT NULL DEFAULT '[]'` to proposal_sections. `ComplianceFlagDB` type alias added to workspace.ts. `persistFlags` helper (useCallback, silent-fail) added to useComplianceCheck, called after all 4 SET_COMPLIANCE_FLAGS dispatch sites. 137 tests passing, 9 skipped.
- **Plan 02** (2026-04-02): Read path — ProposalDetail selects `compliance_flags` in both fetch paths, state type extended, prop threaded to SectionWorkspace. SectionWorkspace init reads `Array.isArray(s.compliance_flags) ? s.compliance_flags : []` instead of hardcoded `[]`. D-02 background re-check useEffect (500ms delay, keyed on proposalId) fires checkCompliance for all sections with content. 137 tests passing, 9 skipped.

### Phase 14.2.1: Part B Trigger Wiring

- **Plan 01** (2026-05-20): useGapAnalysisTrigger hook — D-30 Realtime subscription on proposal_sections (debounced 3s, full-section refetch, content-hash skip), D-35 on-mount fire when no prior chat_sessions row exists, HTTP 429 treated as expected silence. 7/7 Vitest specs pass. Commits 1e051b4, 21fe0ae, ce964a3.
- **Plan 02** (2026-05-20): Wire useGapAnalysisTrigger into AIChatPanel — removed dead `void triggerAnalysis` stub plus orphaned inline useCallback and unused `isAnalyzing` state. tsc clean for the touched file. Manual D-30/D-35/429 live smoke deferred to human-verify pass (requires running dev server + authed user). Commits 600fcc0, ad9249c.

**Planned Phase:** 14.2.4 (placeholder-resolution-ask-then-fill) — 5 plans — 2026-06-11T22:03:52.543Z

### Phase 14.2.4: Placeholder Resolution (Ask-Then-Fill)

- **Plan 01** (2026-06-11): Wave 0 Nyquist test stubs — 4 it.skip stub files created: enum-sync.test.ts (AC-3, 2 stubs), useResolvedItemsWriteOnTerminal.askThenFill.test.ts (AC-4/AC-9, 2 stubs), activeTaskShape.test.ts (D-01 shape invariant, 1 stub), AskUserCard.skip.test.tsx (AC-9 skip button, 3 stubs). No production code touched. Suite green (pre-existing SectionEditorBlock failures unrelated). Commits bb22d1b, cfff3a1.
- **Plan 04** (2026-06-11): Client ask_user branch + defer affordance — onCtaClick ask_user branch (focus via _onSectionFocusChange, originating_snapshot in cta_payload, description in message text); two-step attribution fallback at propose_edit arrival (Map first, then activeTask?.originating_snapshot); AskUserCard onSkip defer button ("I don't have this yet") wired to discard path; AC-4 + AC-9-card-01/02/03 + AC-9-hook all green. Commits e214403, 0dcffdc, 272ff0f, dc75677.
