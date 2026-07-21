# ROADMAP.md — Jamo CRO Proposal Intelligence Platform

**Created:** 2026-03-05
**Milestone 1:** MVP — Demo → Production

---

## Milestone 1: MVP

**Goal:** Replace hardcoded demo with a fully functional production product. Core AI proposal generation + Jamo AI assistant + Supabase backend + auth.

**Success criteria:**
- A CRO staff member can create a new proposal, upload RFP documents, review AI-extracted assumptions, generate a full proposal section-by-section, interact with the Jamo AI to fill in gaps and make edits, and export a clean DOCX — all without touching mock data.
- All data is persisted in Supabase with org-level isolation.
- The product is login-gated with Supabase Auth.

---

### Phase 1: Supabase Foundation

**Goal:** Set up Supabase project, database schema, auth, storage, and core React integration. All future phases depend on this.

**Deliverables:**
- Supabase project configured (database, storage, auth, edge functions enabled)
- Database schema: `organizations`, `user_profiles`, `proposals`, `proposal_sections`, `proposal_documents`, `document_extracts`, `proposal_assumptions`, `proposal_chats`
- RLS policies on every table — org-scoped
- pgvector extension enabled; `regulatory_chunks` table created
- Supabase Storage: private `documents` bucket with org-scoped RLS
- Feature flag column structure on `organizations` table
- Usage tracking tables/columns in place
- Supabase client wired into React app (`src/lib/supabase.ts`)
- Existing React Context providers updated to read/write Supabase instead of in-memory JSON
- ProposalsContext, DeletedContext, ArchivedContext — all Supabase-backed

**Requirements covered:** REQ-7.1 through REQ-7.10

**Plans:** 6 plans

Plans:
- [x] 01-00-PLAN.md — Test infrastructure: vitest config, Supabase mock, stub test files
- [x] 01-01-PLAN.md — Supabase CLI init, @supabase/supabase-js install, src/lib/supabase.ts singleton
- [x] 01-02-PLAN.md — Core schema migrations: 9 tables + RLS helper functions + policies
- [x] 01-03-PLAN.md — pgvector + regulatory_chunks, usage_events, Storage bucket + RLS
- [x] 01-04-PLAN.md — Generate TypeScript types, create AuthContext, migrate ProposalsContext
- [x] 01-05-PLAN.md — Migrate DeletedContext + ArchivedContext, wire AuthProvider into App.tsx

---

### Phase 2: Authentication & Routing

**Goal:** Gate the app behind Supabase Auth. Login page, protected routes, org membership.

**Deliverables:**
- Login page (email/password) matching Jamo visual design
- Supabase Auth integration — signIn, signOut, session management
- Protected route wrapper — unauthenticated users redirect to login
- `user_profiles` auto-created on signup via Postgres trigger
- Auth context (`src/context/AuthContext.tsx`) — current user + org available app-wide
- Role awareness in UI (Admin vs User — feature gating groundwork)
- Logout in sidebar

**Requirements covered:** REQ-8.1 through REQ-8.7

**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md — Extend AuthContext with signIn, signOut, signUp methods
- [ ] 02-02-PLAN.md — Create Login page, ProtectedRoute wrapper, update App.tsx routing
- [x] 02-03-PLAN.md — Add logout button to Sidebar, role awareness in Settings

---

### Phase 3: Document Upload & Parsing Pipeline

**Goal:** Users can upload RFP documents; system extracts text and stores it for AI use.

**Deliverables:**
- File upload UI component (drag-and-drop + file picker) — matches Jamo design system
- Direct browser → Supabase Storage upload (no proxy)
- Per-file status indicator: uploading / extracting / complete / failed
- Supabase Edge Function: `extract-document`
  - PDF: `npm:pdf-parse` (via lib path)
  - DOCX: `npm:mammoth` (HTML + text output)
  - XLSX: `npm:xlsx@0.18.5` (CSV output)
  - TXT: direct read
- Extracted text stored in `document_extracts` table
- Auto-classification of document type (RFP, protocol, transcript, budget)
- Proof-of-concept test for `pdf-parse` in Deno before full wiring (risk mitigation)

**Requirements covered:** REQ-2.1 through REQ-2.8


**Plans:** 6/6 plans complete

Plans:
- [ ] 03-01-PLAN.md — FileUpload component with drag-and-drop, direct Storage upload
- [ ] 03-02-PLAN.md — DocumentList component with status indicators and polling
- [ ] 03-03-PLAN.md — POC Edge Function for pdfjs-serverless validation (risk mitigation)
- [ ] 03-04-PLAN.md — Full extract-document Edge Function (PDF, DOCX, XLSX, TXT)
- [ ] 03-05-PLAN.md — Wire extraction trigger from client, end-to-end testing
---

### Phase 4: Regulatory Knowledge Base (RAG)

**Goal:** Seed the regulatory knowledge base and wire RAG retrieval into the generation pipeline.

**Deliverables:**
- Regulatory documents ingested: ICH E6(R2/R3), top 10 FDA clinical trial guidance, ICH E3, key EMA regulations
- Chunking strategy: section-boundary splits, 400–600 tokens, 100-token overlap
- Embedding pipeline: OpenAI `text-embedding-3-small` → pgvector (HNSW index)
- Admin ingestion tool (CLI script or Edge Function) for adding new regulatory documents
- RAG retrieval function: given a proposal section + therapeutic area, returns top-K relevant regulatory chunks
- Integration test: verify retrieval returns relevant chunks for sample CRO scenarios

**Requirements covered:** REQ-7.7, REQ-7.8, REQ-4.9

---

### Phase 5: Proposal Creation Wizard

**Goal:** Replace the existing ProposalEditorModal with the full multi-step wizard.

**Deliverables:**
- 4-step wizard component replacing ProposalEditorModal
  - Step 1: Study info form (sponsor, phase, TA, regions, deadline, services)
  - Step 2: Document upload (uses Phase 3 upload component)
  - Step 3: Assumption review (uses Phase 6 extraction)
  - Step 4: Template selection + Generate trigger
- "Skip to Fast Draft" button — jumps to Step 4 from any step
- Wizard state in `useReducer` + `sessionStorage` persistence
- Per-step validation with clear error states
- New proposal created in Supabase on wizard completion
- Preserves existing modal animation and visual design

**Requirements covered:** REQ-1.1 through REQ-1.7, REQ-9.4

**Plans:** 6/6 plans complete

Plans:
- [x] 05-00-PLAN.md — Wave 0 test stubs: Nyquist compliance for all wizard requirements
- [x] 05-01-PLAN.md — Type contracts (wizard.ts) + AVAILABLE_SERVICES restructure
- [x] 05-02-PLAN.md — Wizard shell: useReducer, sessionStorage, WizardStepIndicator, Skip to Fast Draft
- [x] 05-03-PLAN.md — Step 1 Study Info form with validation and services pill toggles
- [ ] 05-04-PLAN.md — Steps 2 & 3 + ProposalEditorModal wiring + Generate flow
- [ ] 05-05-PLAN.md — Human verify: full wizard flow, animation, and UX sign-off

---

### Phase 6: AI Assumption Extraction

**Goal:** Run a structured Claude extraction pass on uploaded documents and present results for user review.

**Deliverables:**
- Supabase Edge Function: `extract-assumptions`
  - Input: array of document extract texts
  - Output: typed JSON — `{ assumptions: [{ category, value, confidence, source }], missing: [...] }`
  - Uses a focused extraction-only prompt (not generation prompt)
- Assumption review UI (Step 3 of wizard)
  - Editable cards per assumption with confidence badge
  - Add / edit / reject / approve controls
  - Missing info flagged prominently with fill-in prompts
- Approved assumptions stored in `proposal_assumptions` table
- Approved assumptions serialized into `ProposalInput` struct for generation

**Requirements covered:** REQ-3.1 through REQ-3.7

**Plans:** 5/5 plans complete

Plans:
- [ ] 06-00-PLAN.md — Wave 0 test stubs: Nyquist compliance for all assumption extraction requirements
- [ ] 06-01-PLAN.md — Extend wizard types, rename Step3→Step4Generate, update wizard shell
- [ ] 06-02-PLAN.md — extract-assumptions Edge Function (Claude Haiku, JSON extraction, DB insert)
- [ ] 06-03-PLAN.md — Step3AssumptionReview component with approve/reject/edit/missing-fields UI
- [ ] 06-04-PLAN.md — Wire extraction trigger in Step2, wire Step3 into wizard, human verify

---

### Phase 7: Proposal Generation Engine

**Goal:** Live, streaming, section-by-section proposal generation via Anthropic API.

**Deliverables:**
- Supabase Edge Function: `generate-proposal-section`
  - Accepts: `ProposalInput` + section ID + consistency anchor + RAG chunks
  - Calls Anthropic API with streaming (`"stream": true`)
  - Pipes SSE stream directly to browser response
  - On section complete: writes section text to `proposal_sections` table
- Generation orchestrator (client-side): calls sections in dependency order, manages anchor
- Consistency Anchor: ~500-token summary extracted after each section (Haiku-tier call)
- Supabase Realtime subscription: frontend renders sections as they arrive in DB
- Two-phase streaming display: buffer SSE in React state → load complete section into TipTap
- Tone parameter per section (formal / regulatory / persuasive)
- Full proposal "generate all" convenience trigger
- `[PLACEHOLDER: ...]` markers preserved for user/AI fill-in

**Requirements covered:** REQ-4.1 through REQ-4.10

**Plans:** 4/5 plans executed

Plans:
- [x] 07-00-PLAN.md — Wave 0: type contracts + Nyquist test stubs
- [x] 07-01-PLAN.md — generate-proposal-section Edge Function (SSE proxy + anchor mode)
- [x] 07-02-PLAN.md — useProposalGeneration client orchestrator (three-wave sequencing)
- [x] 07-03-PLAN.md — Streaming UI components (SectionStreamCard, GenerationHeader, GenerationControls)
- [ ] 07-04-PLAN.md — Wire into ProposalDetail + ProposalDraftRenderer + human verify

---

### Phase 8: Section Workspace & Rich Text Editor

**Goal:** Replace read-only `ProposalDraftRenderer` with a full TipTap-powered editing workspace.

**Deliverables:**
- TipTap v2 editor replacing `ProposalDraftRenderer` in `ProposalDetail`
- Per-section actions toolbar: Generate / Regenerate / Expand / Condense / Rewrite
- Lock/unlock toggle per section — locked = read-only, excluded from AI edits
- Version history per section — view and restore prior versions (stored in `proposal_section_versions`)
- Section navigation (left panel) with status indicators: complete / needs review / missing
- Compliance flags rendered inline below each section (qualitative: needs review / missing)
- Cross-section consistency check triggered after full generation
- Programmatic TipTap content injection (for AI edits from chat panel)

**Requirements covered:** REQ-5.1 through REQ-5.8

**Plans:** 5/6 plans executed

Plans:
- [x] 08-00-PLAN.md — Wave 0: TipTap install, migrations, type contracts, test stubs
- [x] 08-01-PLAN.md — SectionWorkspace + SectionEditorBlock + autosave + lock/unlock
- [x] 08-02-PLAN.md — SectionActionToolbar + AI action previews (Expand/Condense/Rewrite)
- [x] 08-03-PLAN.md — Version history overlay + section nav with status dots
- [x] 08-04-PLAN.md — Compliance flags + consistency check Edge Function + banner
- [~] 08-05-PLAN.md — Wire into ProposalDetail + activate tests + human verify (Task 1 done; awaiting human verify)

---

### Phase 9: Jamo AI Chat Panel

**Goal:** Live AI assistant that proactively flags gaps and edits the proposal in response to user interaction.

**Deliverables:**
- Existing `AIChatPanel` component upgraded from demo to live
- Supabase Edge Function: `chat-with-jamo`
  - Builds context: current proposal sections + uploaded document extracts + chat history
  - RAG retrieval over uploaded documents for "Ask about your documents"
  - Streaming response piped to chat panel
- Proactive gap analysis triggered after generation: scans for `[PLACEHOLDER]` markers and thin sections, surfaces as Jamo questions
- User reply to Jamo → Jamo generates edit → TipTap editor updated programmatically
- "Explain this section" — traces section content back to source document references
- Chat history persisted in `proposal_chats` table
- Streaming chat responses in panel

**Requirements covered:** REQ-6.1 through REQ-6.7

---

### Phase 10: Template Management

**Goal:** Pre-built templates + org-uploaded templates as AI generation context.

**Deliverables:**
- 2–3 pre-built CRO proposal templates seeded in the platform
- Template upload UI in Settings — DOCX/PDF upload
- Template extraction: text extracted and stored (reuses Phase 3 pipeline)
- Template context included in generation prompt when selected
- Templates scoped to org (RLS)
- Template selector in wizard Step 4

**Requirements covered:** REQ-9.1 through REQ-9.5

**Plans:** 3 plans

Plans:
- [ ] 10-01-PLAN.md — DB schema (templates + template_sections), RLS policies, 3 pre-built template seeds, schema push
- [ ] 10-02-PLAN.md — Settings TemplatesTab (admin upload, status, section disclosure, delete) + template-extract Edge Function
- [ ] 10-03-PLAN.md — Wizard Step 4 TemplateSelector cards + generation prompt [TEMPLATE CONTEXT] injection

---

### Phase 10.1: Dynamic template sections drive proposal structure (INSERTED)

**Goal:** Replace hardcoded 9-section model with template-driven section architecture. Sections derived from selected template, identified by UUID. Default "Standard Proposal" template seeded. Generation sequential by position. Workspace and ProposalsList become section-data-driven.
**Requirements**: REQ-9.1, REQ-9.2, REQ-9.4, REQ-4.1, REQ-4.2, REQ-4.6, REQ-5.1, REQ-5.2
**Depends on:** Phase 10
**Plans:** 5/5 plans complete

Plans:
- [x] 10.1-01-PLAN.md — Schema migration: add name/description/position/role to proposal_sections, is_default to templates, seed Standard Proposal template (9 sections), schema push
- [x] 10.1-02-PLAN.md — Generation engine refactor: delete SECTION_WAVE_MAP/createInitialSections, add GenerateSectionPayloadV2, rewrite useProposalGeneration sequential loop, section pre-creation in wizard
- [x] 10.1-03-PLAN.md — Edge function v2 payload: buildSectionPromptV2 with sectionDescription scope + role strategy hints, writeSectionById, priorSections context injection
- [x] 10.1-04-PLAN.md — Workspace & list updates: ProposalDetail dynamic fetch by position, template badge in nav, SectionEditorBlock UUID key, ProposalsList template name on cards
- [x] 10.1-05-PLAN.md — Template extraction + wizard defaults: template-extract captures descriptions + LLM role classification, TemplatesTab role editing, Step4Generate default pre-selection

### Phase 10.3: Placeholder Marks & Section Health System (INSERTED)

**Goal:** Replace fragile `[PLACEHOLDER: ...]` string detection with a TipTap custom mark that persists through DB round-trips with stable UUIDs. Add a generalized `issues` field to SectionEditorState driven by `UPDATE_SECTION_ISSUES` dispatches. Status dot reads from `issues` in parallel with the existing compliance_flags bridge.

**Deliverables:**
- `PlaceholderMark` TipTap extension with resolution plugin (amber pill, clears on edit)
- `placeholderPatternToSpan` shared helper + `escapeHtml` utility
- `migratePlaceholders` legacy backfill (applied in SectionEditorBlock with immediate autosave)
- `IssueCategory`, `SectionIssue` types + `issues` field on `SectionEditorState`
- `UPDATE_SECTION_ISSUES` workspace action + reducer case
- Placeholder analyzer effect in SectionEditorBlock (debounced, drives dispatch)
- `resolveStatus` updated with `hasIssues` check (compliance_flags bridge preserved)
- Edge function post-process pass converts `[PLACEHOLDER: ...]` to spans before DB write
- Integration test: roundtrip UUID stability

**Requirements covered:** (new phase — addresses technical debt from Phase 10.1)
**Depends on:** Phase 10.1

**Plans:** 4/4 plans complete

Plans:
- [x] 10.3-01-PLAN.md — Wave 1 foundations: IssueCategory/SectionIssue types, UPDATE_SECTION_ISSUES reducer, escapeHtml, placeholderHtml, migratePlaceholders, PlaceholderMark TipTap extension
- [x] 10.3-02-PLAN.md — Wave 2 wiring: SectionEditorBlock (register mark, migration pass, analyzer effect), SectionNavPanel resolveStatus, edge function post-process pass
- [x] 10.3-03-PLAN.md — Wave 3 integration test: UUID roundtrip stability and idempotency

### Phase 11: DOCX Export

**Goal:** Clean client-side DOCX export of the generated proposal.

**Deliverables:**
- "Export" button in proposal workspace toolbar
- Client-side DOCX generation using `docx` npm package (v8.x)
- Exports: headings, paragraphs, bullet lists, tables — all properly styled
- If org has an uploaded template, attempts to match section structure
- Browser download triggered directly — no server round-trip

**Requirements covered:** REQ-10.1 through REQ-10.5

**Plans:** 2/2 plans complete

Plans:
- [x] 11-01-PLAN.md — Install docx, create htmlToDocx.ts + exportDocx.ts utilities (Wave 1)
- [x] 11-02-PLAN.md — Wire ExportDropdown, create ExportBlockedModal, remove PowerPoint item (Wave 2)

---

### Phase 11.1: DOCX Template Style Extraction (INSERTED)

**Goal:** Apply the org's uploaded DOCX template styles to exported proposals so output matches org branding and formatting.

**Deliverables:**
- Unzip org's uploaded DOCX template from Supabase Storage
- Extract `styles.xml` from the archive
- Inject extracted styles into the generated DOCX so headings, fonts, and spacing match the org template
- Satisfies REQ-10.4b (deferred from Phase 11)

**Requirements covered:** REQ-10.4b

**Depends on:** Phase 11, Phase 10 (template upload pipeline)

**Plans:** 5 plans

Plans:
- [ ] 11.1-01-PLAN.md — Wave 0: install jszip, write migration SQL, Nyquist test stubs
- [ ] 11.1-02-PLAN.md — [BLOCKING] Push style_inspection migration to live database
- [ ] 11.1-03-PLAN.md — Wave 3: applyTemplateStyles utility + export wiring + TemplatesTab 10MB cap
- [ ] 11.1-04-PLAN.md — Wave 3: Edge Function style inspection + TemplatesTab warnings
- [ ] 11.1-05-PLAN.md — Wave 4: discoverability nudge (post-export, one-time, dismissible)

---

### Phase 12: Salesforce Integration

**Goal:** Pull sponsor metadata from Salesforce to pre-populate wizard; push proposal status back.

**Deliverables:**
- Salesforce OAuth JWT Bearer Token flow in Edge Function
- Private key stored in Supabase Vault
- Edge Function: `salesforce-sync`
  - Read: Opportunities + Accounts → pre-populate wizard Step 1
  - Write: proposal status → Salesforce Opportunity PATCH
- Settings → Integrations tab wired to live Salesforce connection (replaces demo toggle)
- Graceful degradation — Salesforce failure doesn't block proposal creation

**Requirements covered:** REQ-12.1 through REQ-12.6

---

### Phase 12.1: Salesforce Data Sync (INSERTED)

**Goal:** Use the connected Salesforce org's credentials to query Opportunity/Account fields and pre-populate wizard Step 1 with sponsor metadata; write proposal status back to the Salesforce Opportunity on submit/complete. Graceful degradation if Salesforce is not connected or the sync fails.

**Deliverables:**
- `salesforce-sync` Edge Function — given a connected org's vault-stored tokens, query Salesforce for Opportunity fields and return sponsor metadata (sponsor name, therapeutic area, indication, study phase)
- Wire pre-population into wizard Step 1 (`Step1StudyInfo.tsx`) — fields auto-filled when Salesforce is connected; empty as normal otherwise
- Write proposal status PATCH back to the relevant Salesforce Opportunity on proposal submit/complete
- Graceful degradation — Step 1 renders normally with empty fields if Salesforce not connected or sync call fails; no blocking errors

**Requirements covered:** REQ-12.4, REQ-12.5, REQ-12.6

**Depends on:** Phase 12

**Plans:** Not planned yet

---

### Phase 13: Dashboard & Proposal Lifecycle

**Goal:** Wire the existing dashboard to live Supabase data. Lightweight metrics.

**Deliverables:**
- Dashboard KPI cards sourced from Supabase (proposal counts by status)
- Priority Focus card shows real upcoming deadlines
- Generation metrics: proposals generated, AI calls made (from usage tracking)
- Proposal status transitions: draft → in progress → submitted → won / lost
- ProposalsList filters (active / archived / deleted) all hitting Supabase

**Requirements covered:** REQ-11.1 through REQ-11.4

**Plans:** 5 plans

Plans:
- [x] 13-01-PLAN.md — Rename in_review → in_progress (migration, types, seed JSON)
- [x] 13-02-PLAN.md — StatusSelector component + updateStatus in ProposalsContext
- [x] 13-03-PLAN.md — Wire ProposalsList with StatusSelector + Supabase archived/deleted tabs
- [x] 13-04-PLAN.md — Wire ProposalsList/ProposalDetail with StatusSelector + Supabase archived/deleted tabs
- [x] 13-05-PLAN.md — Push in_review→in_progress data migration to remote Supabase DB

---

### Phase 14.1: AI Chat Foundation (INSERTED)

**Goal:** Replace the fragile keyword-based chat (detectIntent(), EDIT_KEYWORDS arrays) with a structured Claude tool-use architecture. The AI executes defined tools — paragraph-level edits, cited answers, compliance checks, section focus, user prompting — instead of parsing free-text output. Streaming logic, chat persistence, and the TipTap editor are all updated to support this. Ships independently and is immediately usable on its own.

**Requirements covered:** REQ-6.1 through REQ-6.7

**Depends on:** Phase 9 (Chat), Phase 8 (Workspace / TipTap)

**Plans:** 9 plans

Plans:
- [ ] 14.1-01-PLAN.md — DB migrations (tool_data column + chat_sessions table) + [BLOCKING] schema push
- [ ] 14.1-02-PLAN.md — Nyquist test stubs + retrieve-context K-param extension + chat.ts type expansion
- [ ] 14.1-03-PLAN.md — chat-with-jamo full rewrite: tool-use streaming, 5 tool files, new SSE protocol
- [ ] 14.1-04-PLAN.md — chatContext.ts upgrades (HTML content, sectionKeyToTitle, token budget) + TipTap UniqueID + applyParagraphPatch
- [ ] 14.1-05-PLAN.md — AIChatPanel rewrite: tool SSE handling, dead code removal, sectionTitles prop
- [ ] 14.1-06-PLAN.md — DiffPreview + CitationsBlock + ToolStatusLabel components
- [ ] 14.1-07-PLAN.md — ComplianceCard + AskUserCard components
- [ ] 14.1-08-PLAN.md — tool_data persistence: save, history reload, state mutation persistence
- [ ] 14.1-09-PLAN.md — check_regulatory_compliance writes to proposal_sections.compliance_flags (D-08)

---

### Phase 14.2: AI Chat Co-pilot (INSERTED)

**Goal:** Move paragraph-level diff review from the chat panel into the section editor via ProseMirror Decorations (Part A), then activate proactive co-pilot behavior with a server-generated action queue, multi-turn walkthroughs, and resume-on-reload (Part B).

**Requirements covered:** REQ-9.1, REQ-9.2

**Depends on:** Phase 14.1 (AI Chat Foundation)

**Plans:** 8 plans

Plans:
- [ ] 14.2-01-PLAN.md — Wave 0 stubs + Realtime publication migration for chat_sessions
- [ ] 14.2-02-PLAN.md — Type contracts: PendingEdit, ChangeResolution, CHANGE_TYPE_LABELS, PendingActionItem, ActiveTask
- [ ] 14.2-03-PLAN.md — PendingEditsPlugin + decorations.tsx (ghost decoration factory + staleness detection)
- [ ] 14.2-04-PLAN.md — Workspace reducer: pending_edits actions + persistToolDataState side effect
- [ ] 14.2-05-PLAN.md — SectionEditorBlock wiring + EditSummaryCard + AIChatPanel Part A (scroll fix, insertChainRef removal, DiffPreview deletion)
- [ ] 14.2-06-PLAN.md — analyze-proposal-gaps edge function + chat-with-jamo active_task integration
- [ ] 14.2-07-PLAN.md — ActionQueue, ActionItem, ResumeTaskBanner, WalkthroughProgress + AIChatPanel Part B + detectGaps retirement
- [ ] 14.2-08-PLAN.md — Human verification checkpoint: Part A and Part B end-to-end

### Phase 14.2.4: Placeholder Resolution Ask Then Fill (INSERTED)

**Goal:** Needs-value findings (unfilled placeholders) re-route from a no-op forced propose_edit to a forced ask_user with a mirrored, awaited active_task write — so Jamo asks the user for the value, then fills it, with durable resume and correct resolved_items attribution. No silent rewrite; defer never marks a finding fixed.
**Requirements**: D-01..D-10, AC-1..AC-9 (no REQ-IDs — decision/AC-driven, see 14.2.4-CONTEXT.md)
**Depends on:** Phase 14.2, Phase 14.2.3
**Plans:** 5 plans

Plans:
- [ ] 14.2.4-01-PLAN.md — Wave 0 Nyquist test stubs (enum-sync, hook ask-then-fill, active_task shape, AskUserCard skip)
- [ ] 14.2.4-02-PLAN.md — Enum sync (both sites) + ActiveTask.originating_snapshot + analyzer ask_user few-shots (D-02/D-03/D-06/AC-3/AC-6)
- [ ] 14.2.4-03-PLAN.md — Edge ask_user dispatch: awaited active_task write, real section title, snapshot (D-01/D-10/AC-4/AC-5)
- [ ] 14.2.4-04-PLAN.md — Client CTA routing + focus + description + two-step attribution + AskUserCard defer (D-01/D-03/D-07/D-08/D-09/AC-1/2/4/7/8/9)
- [ ] 14.2.4-05-PLAN.md — Deploy edge functions + live ask-then-fill smoke (AC-1/2/5/7/8/9)

### Phase 14.2.3: Fix Gap Analyzer Context Starvation (INSERTED)

**Goal:** The gap analyzer returns findings on proposals full of unfilled template placeholders — stop truncating section content to 300 chars before Haiku, sharpen the prompt for placeholder detection, persist the whole-proposal content hash to gate the mount trigger, and rebalance tier caps.
**Requirements**: D-1, D-2, D-3, D-4, D-5, D-6 (CONTEXT.md decisions; no REQ IDs)
**Depends on:** Phase 14.2 (and 14.2.2 resolved_items convention)
**Plans:** 3 plans

Plans:
- [x] 14.2.3-01-PLAN.md — Edge: full section content (5000-char ceiling + marker), 4-example placeholder prompt, rebalanced tier caps (D-1/D-2/D-5)
- [x] 14.2.3-02-PLAN.md — [BLOCKING migration] persist pending_actions_content_hash; edge write + client mount read-gate (D-3/D-4)
- [x] 14.2.3-03-PLAN.md — Resolve-time flush-then-hash: expose saveNow on the editor handle, dismiss-path sequence (D-6)

### Phase 14.2.1: Part B Trigger Wiring (INSERTED)

**Goal:** Wire the dead triggerAnalysis stub in AIChatPanel.tsx so the Part B proactive co-pilot surface (ActionQueue, WalkthroughProgress, Sidebar gap badge) actually populates. Subscribe to proposal_sections Realtime UPDATEs (D-30, debounced 3s, content-hash skip) and fire once on panel open when no prior chat_sessions row exists (D-35). No edge function or schema changes.

**Requirements covered:** (no new REQ-IDs — closes verification gap from 14.2-08-PLAN.md Steps 12, 14-26)

**Depends on:** Phase 14.2 (AI Chat Co-pilot)

**Plans:** 2 plans

Plans:
- [x] 14.2.1-01-PLAN.md — useGapAnalysisTrigger hook (D-30 Realtime + D-35 initial fire, debounce, hash-skip, 429-silent) + unit tests
- [x] 14.2.1-02-PLAN.md — Wire useGapAnalysisTrigger into AIChatPanel, remove void triggerAnalysis stub, manual smoke verify

### Phase 14.2.2: Resolved Items as Stateful Co-pilot Memory (INSERTED)

**Goal:** Wire the unused `chat_sessions.resolved_items` column as stateful prompt context for Haiku. When the user dismisses or acts on an action-queue finding, persist a structured entry (section_key, finding type, title/description, action, applied-changes summary, content hash). `analyze-proposal-gaps` reads these and instructs Haiku to evolve/refine/skip findings instead of repeating them verbatim. Fixes the "dismissed items reappear after navigation" bug AND the "same finding re-flagged after a surgical edit" UX problem in one pass — Haiku is the dedup mechanism, not the client.

**Requirements covered:** (no new REQ-IDs — closes UX gap from 14.2 design)

**Depends on:** Phase 14.2.1

**Plans:** 6 plans (4 waves, parallel-optimized)

Plans:
- [ ] 14.2.2-01-PLAN.md — Foundation: types + constants + sectionHash util + append_resolved_item RPC migration (Wave 0)
- [ ] 14.2.2-02-PLAN.md — appendResolvedItem writer module + retry/backoff + pure helpers + vitest specs (Wave 1)
- [ ] 14.2.2-03-PLAN.md — Originating-action snapshot threading at CTA-click into tool_data (Wave 1)
- [ ] 14.2.2-04-PLAN.md — AIChatPanel filter Set + dismiss write + terminal-state effect + free-text skip (Wave 2)
- [ ] 14.2.2-05-PLAN.md — analyze-proposal-gaps prompt revision + content-hash annotation (Wave 3)
- [ ] 14.2.2-06-PLAN.md — Schema push + types regen + SQL tests + AC1/AC2/AC3/AC5 manual checkpoints (Wave 4)

---

### Phase 14.3: Edge Identity Hardening (INSERTED)

**Goal:** Harden four edge functions (`chat-with-jamo`, `salesforce-oauth-initiate`, `salesforce-oauth-disconnect`, `retrieve-context`) to derive caller `user_id`/`org_id` from the verified Supabase JWT instead of trusting request-body values — closing a live cross-tenant impersonation vector. Edge-functions-only, backward-compatible, independently deployable, and a **prerequisite go-live gate** for Phase 15 (must be deployed + verified before invite-based multi-tenant provisioning introduces untrusted tenants sharing the instance). Split out of Phase 15's SPEC as its own deployable unit. `retrieve-context` fix must preserve internal service-role callers.

**Requirements covered:** 2 locked (see 14.3-SPEC.md) — split from Phase 15 SPEC reqs 13–14

**Depends on:** Phase 9 (chat-with-jamo), Phase 12 (salesforce-oauth-*), Phase 4 (retrieve-context)

**SPEC:** 14.3-SPEC.md (2 requirements, ambiguity 0.09)
**Context:** 14.3-CONTEXT.md

**Plans:** 5 plans in 3 waves

Plans:
- [x] 14.3-01-PLAN.md — Shared `_shared/auth.ts` JWT helper (getAuthedUserAndOrg, isInternalServiceRoleCall, jsonError) + unit tests [Wave 1]
- [x] 14.3-02-PLAN.md — chat-with-jamo: hoist JWT identity above first chat_sessions read; swap all use-sites (REQ-1) [Wave 2]
- [x] 14.3-03-PLAN.md — retrieve-context: branch internal-service-role vs user-JWT; preserve internal RAG caller (REQ-2, core risk) [Wave 2]
- [x] 14.3-04-PLAN.md — salesforce-oauth-initiate + -disconnect: derive org from JWT, 403 on mismatch (REQ-2) [Wave 2]
- [ ] 14.3-05-PLAN.md — [BLOCKING] deploy all four + siblings; A2 check; live regression/cross-tenant/internal-RAG verification (D-05) [Wave 3]

---

### Phase 14.4: Deterministic Multi-Section Substitution (INSERTED)

**Goal:** Make the AI chat actually perform bulk placeholder substitution across sections (e.g. "replace every section's Investigational product name placeholder with albacore"). Live capture proved the model already fans out into N correct parallel `propose_edit` calls, but the chat is single-section / single-turn by construction (one `section_key` per edit; per-section review UX — ghost decorations, accept/reject, one summary card, one `active_task`; no set_focus→propose_edit chaining), so ambiguous bulk requests deflect to `set_focus` or a clarifying question instead of editing. Deliver: cheap intent parse; deterministic LOCATION of matching `data-placeholder-id` spans by id/label (no generation to find); deterministic SUBSTITUTION of single-value placeholders with the supplied value (NO LLM generation); heterogeneity routing (single-value → substitute, multi-part prompts a single value can't satisfy → skip-and-REPORT to user); and multi-section review orchestration (fan out into per-section changesets each independently reviewable, or a new multi-section review surface — the real build, since today's single-section review UX cannot show N changesets). Builds on the already-shipped/deployed reliability fix-class (commit 3da0b40: id-based ghost-isolation guard, MaterializeResult errors, error SSEs on max_tokens/parse-fail edge v17, buffered SSE parser, set_focus status line) so failures are visible, not silent. Do NOT route through ask-then-fill (Phase 14.2.4) — capture proved it redundant (model already emits correct edits; user already supplied the value).

**Requirements covered:** 7 locked (see 14.4-SPEC.md R1–R7) — deterministic intent-parse, span locate, literal substitution, heterogeneity routing (bias-to-skip), multi-section fan-out review, aggregate review control, honest full/partial/zero-match reporting

**Depends on:** Phase 14.1 (AI Chat Foundation), Phase 14.2 (AI Chat Co-pilot — propose_edit/set_focus, per-section review UX, materialize), Phase 14.3 (Edge Identity Hardening — chat-with-jamo JWT identity)

**Plans:** 5 plans in 4 waves
- [x] 14.4-01-PLAN.md (Wave 0) — Pure deterministic substitute.ts (locate/substitute/group/edit-build/reconcile) + vitest fixtures [R2,R3,R4,R5,R7]
- [x] 14.4-02-PLAN.md (Wave 1) — Edge tool substitute_placeholders + index.ts registration + context.ts system-prompt guidance [R1,R4]
- [x] 14.4-03-PLAN.md (Wave 1) — BulkSubstitutionSummaryCard aggregate review component [R6]
- [x] 14.4-04-PLAN.md (Wave 2) — AIChatPanel fan-out + reconciliation + render branch + honest one-liner [R5,R6,R7]
- [ ] 14.4-05-PLAN.md (Wave 3) — Deploy chat-with-jamo + live multi-section/partial/zero-match UAT (blocking checkpoint) [R4,R5,R6,R7]

**Status:** Waves 0-2 executed (Plans 01-04 complete) — Wave 3 (Plan 05: deploy + live UAT, blocking checkpoint) remains

---

### Phase 14.5: RAG Retrieval Overhaul + Regulatory Corpus Foundation (INSERTED)

**Goal:** Make proposal generation retrieve relevant, version-current regulatory content by fixing query construction, introducing a global (`org_id` NULL) regulatory tier, and adding a versioned `regulatory_documents` parent table with supersession. Today the regulatory corpus is empty (all 171 chunks are `doc_type='proposal'`, tag columns 100% NULL) and retrieval is driven by bare section-title queries with no proposal-attribute signal and no proposal/regulatory scoping. This phase builds the STRUCTURE and WIRING — schema (versioned parent + tier-pairing CHECK + `regulatory_document_id` FK), global regulatory tier, ingest-CLI flags, deterministic query construction from structured proposal attributes, graded filter relaxation, per-`doc_type` retrieval budgets, RLS defense-in-depth — NOT the corpus content itself. Supersession resolves on a stable operator-supplied `document_key` (UNIQUE, immutable across re-ingest — enforced by a BEFORE UPDATE trigger; parent rows update-in-place so `id`/FK targets never drift). Authoritative spec: **14.5-BRIEF.md**.

**Requirements covered:** see 14.5-BRIEF.md — versioned `regulatory_documents` + document_key-keyed supersession; global regulatory chunk tier (`org_id` NULL); chunks tier-pairing CHECK + `regulatory_document_id` FK; `proposals.geography` + wizard wiring + `studyInfo.countries` backing; ingest-CLI `--document-key`/`--geography`/`--effective-date`/`--status`/`--phase`/`--supersedes`; regulatory RPC join + `status='active'` + geography/phase/TA pre-filters + `(org_id OR NULL)` tenant clause; deterministic attribute-based query construction; graded filter relaxation; per-`doc_type` retrieval budgets; regulatory-read RLS policy

**Depends on:** Phase 04 (Regulatory Knowledge Base RAG — chunks table, match RPCs, retrieve-context), Phase 07 (Proposal Generation Engine — fetchRagChunks, generate-proposal-section), Phase 05 (Proposal Creation Wizard — Step1StudyInfo), RAG proposal-ingestion fix (2026-07-08 — extract-document now populates proposal chunks; backfill + probe scripts exist)

**Out of scope:** modality column/filter; recency/time-decay ranking; generic `metadata->>` jsonb filtering; LLM/HyDE query synthesis; per-org regulatory ingest path (schema permits, build nothing); any proposal-side filtering change beyond existing org isolation

**Plans:** 7/7 plans complete

- [x] 14.5-01-PLAN.md — Schema foundation migrations (regulatory_documents + trigger, chunks tier/FK/CHECK/RLS, proposals.geography + backfill) [Wave 1]
- [x] 14.5-02-PLAN.md — RPC migrations (regulatory match RPC rewrite + atomic SECURITY DEFINER ingest RPC) [Wave 1]
- [x] 14.5-03-PLAN.md — [BLOCKING] Apply all 5 migrations via Supabase MCP + live schema smoke [Wave 2]
- [x] 14.5-04-PLAN.md — Port ingest-regulatory.ts Deno→tsx/Node + new flags + Vitest coverage [Wave 3]
- [x] 14.5-05-PLAN.md — Deterministic query construction + retrieve-context relaxation + [BLOCKING] edge deploy [Wave 3]
- [x] 14.5-06-PLAN.md — Geography persistence wiring + retire regions-in-description blob (audited) [Wave 3]
- [x] 14.5-07-PLAN.md — [BLOCKING] Scripted E2E supersession protocol (ICH-E6R2→R3) live acceptance [Wave 4]

---

### Phase 14.6: Regulatory Grounding Correctness + Ingest Hardening + Starter Corpus Seeder (INSERTED)

**Goal:** Fix a live regulatory-grounding correctness bug, harden the ingest supersession contract, and add a one-command starter-corpus seeder — **in that priority order**. PRIMARY (b): the RAG tier-collapse in `fetchRagChunks` (flattens `regulatoryChunks`+`proposalChunks` into one array and drops `retrievalMeta`) causes proposal-history chunks to be mislabeled as `[REGULATORY CONTEXT]` and zero-regulatory-retrieval to be silently swallowed. The ROOT fix is keeping the two tiers separate through to `generate-proposal-section`; both symptoms are downstream of the collapse. Once `regulatoryCount` survives, make the ICH-GCP compliance assertion CONDITIONAL on `regulatoryCount>0` (today it asserts compliance unconditionally — contradictory input when ungrounded, and the assertion wins). SIBLING (a): `ingest_regulatory_document` must RAISE when `--supersedes` is passed but unresolved (currently a silent no-op via the `IF v_supersedes_id IS NOT NULL` fall-through) — raise condition is "supersedes passed AND unresolved", explicitly NOT "v_supersedes_id IS NULL" (which would break every non-superseding ingest, incl. all GLOBAL starter docs). THIRD: `scripts/seed-regulatory.ts` + `npm run seed:regulatory` over a manifest + `regulatory-docs/<document-key>/` folder convention, with topological supersedes ordering and a batch pre-validation pass before any embedding spend; E6 seeded R3-only scoped `{US,EU,UK}` (NOT GLOBAL, with a manifest comment explaining why), all other starter docs GLOBAL. The proposed default manifest is gated on clinical-domain review before locking. Authoritative spec: **14.6-BRIEF.md**.

**Requirements covered:** see 14.6-BRIEF.md — RAG tier-separation fix (root); conditional compliance assertion; ingest supersedes-unresolved raise; starter-corpus seeder (manifest + folders + topo-order + pre-validation); E6 regional scoping

**Depends on:** Phase 14.5 (RAG Retrieval Overhaul — schema, RPCs, retrieve-context, ported ingest CLI). Related: Backlog 999.2 (per-geography supersession) is the deferred general fix this phase deliberately works around, not a dependency.

**Out of scope:** per-geography/regional supersession status (deferred to backlog 999.2); modality/recency ranking; auto-download of regulatory PDFs; locking the default manifest contents (requires clinical-domain review)

**Plans:** 5/5 plans complete

- [x] 14.6-01-PLAN.md — (b) client tier-separation: split payload contract + fetchRagChunks threading [Wave 1]
- [x] 14.6-02-PLAN.md — (b) edge conditional compliance + dual-header assembly + unit test + [BLOCKING] deploy [Wave 2]
- [x] 14.6-03-PLAN.md — (a) ingest supersedes RAISE migration + [BLOCKING] apply via Supabase MCP [Wave 1]
- [x] 14.6-04-PLAN.md — seeder manifest + seed-regulatory.ts (pre-validation, dep-ordering, --validate-only) + tests [Wave 3]
- [x] 14.6-05-PLAN.md — [BLOCKING] live seed run + E2E (US retrieves E6R3; JP surfaces the (b) marker) [Wave 4]

---

### Phase 14.7: Proposal-History Scoping (INSERTED)

**Goal:** Deploy-first confidentiality fix. Proposal-document chunks are org-scoped, not proposal-scoped — the proposal RPCs filter `WHERE org_id = org_id_filter` only and `chunks` has no `proposal_id` column, so at generation the `[PROPOSAL HISTORY]` tier returns top-K similar proposal chunks across the whole org. Documents uploaded for Proposal A can surface while generating Proposal B in the same org (a CRO serving competing sponsors → Sponsor A's confidential in-flight RFP bleeds into Sponsor B's draft). Blast radius is within-org only; cross-org isolation (org_id + RLS) is intact. Verified context: the current proposal's own doc content ALREADY reaches generation proposal-scoped via the assumptions channel (`extract-assumptions` → `proposal_assumptions.proposal_id` → `proposalContext.assumptions`); raw full-text reaches generation ONLY via the org-wide RAG proposal tier — so the tier's legitimate job is cross-proposal HISTORY, and the fix is to SCOPE it, not remove it. Scope `[PROPOSAL HISTORY]` = (current proposal's own chunks, ANY status) ∪ (OTHER proposals' chunks only where non-draft AND eligible). Draft is a hard floor: no other proposal's draft is ever retrievable — no toggle, override, or opt-in past it. Eligibility layered on top: per-proposal `reference_override` (true/false) else org master switches (won=on, submitted=off, lost=off by default). Add a real `proposal_id` column on `chunks` as the single source of truth (set at ingest in `extract-document`; one-time backfill via `metadata.document_id → proposal_documents.proposal_id`, fail-closed with an unresolvable-count report); NULL `proposal_id` is never retrievable on the proposal tier (fail-closed, not org-wide). Thread `current_proposal_id` client → `retrieve-context` → both proposal RPCs. Authoritative spec: **14.7-BRIEF.md**.

**Requirements covered:** see 14.7-BRIEF.md — per-proposal retrieval scoping; draft-floor invariant (never-retrievable); status-gated cross-proposal history (master switches + per-proposal override); `chunks.proposal_id` schema + fail-closed backfill; proposalId threading through client/edge/RPC; settings UI for org master switches + per-proposal reference control.

**Depends on:** Phase 14.6 (RAG tier separation — the `[PROPOSAL HISTORY]` tier and split payload this phase scopes).

**Plans:** 6/7 plans complete

Plans:
- [x] 14.7-01-PLAN.md — Schema + fail-closed backfill (chunks.proposal_id FK, proposals.reference_override, 3 org master-switch columns; backfill + audit table + count) [wave 1]
- [x] 14.7-02-PLAN.md — RPC eligibility rewrite (DROP+CREATE both proposal RPCs: current_proposal_id, draft-floor-first, fail-closed NULL + unknown-status) + live-verify SQL [wave 2]
- [x] 14.7-03-PLAN.md — Admin write-gating RPCs (set_org_learning_switches + set_reference_override, org-scoped, REVOKE anon/PUBLIC) [wave 2]
- [x] 14.7-04-PLAN.md — End-to-end threading (extract-document sets proposal_id; retrieve-context + fetchRagChunks thread current_proposal_id) [wave 3]
- [x] 14.7-05-PLAN.md — Settings UI (3 org toggles + per-proposal tri-state control, admin-gated, no draft include-path) [wave 3]
- [x] 14.7-06-PLAN.md — [BLOCKING] Live deploy: apply 4 migrations via Supabase MCP + deploy retrieve-context & extract-document [wave 4]
- [ ] 14.7-07-PLAN.md — Live verification: 7 BRIEF cases + 3 fail-closed edge cases + write-gate + fresh-ingest + 14.6 regression [wave 5]

**Out of scope:** any draft opt-in mechanism (deliberately cut); any change to regulatory retrieval/tiering or the 14.6 work; any change to the assumptions channel (`proposal_assumptions`); ranking/threshold changes (that's backlog 999.3).

**Plans:** not planned yet

---

### Phase 15: Client Onboarding & Provisioning

**Goal:** Replace the interim demo signup with a sales-led, invite-only provisioning flow. Public signup stays permanently disabled; an admin (us) provisions each client org and invites the client's first admin by email via Supabase `auth.admin` invite — the invitee follows the link and sets their own password. That org admin can then invite their own teammates (roles: super admin / admin / user). Includes an org-creation flow, production SMTP/email config in Supabase (invites + password resets; `mailer_autoconfirm` off), and a lightweight internal admin surface (panel or script/edge function) to provision clients without manual DB edits. Server-bound identity integrity (invitee cannot self-assign org/role) is in scope; the broader edge-function JWT identity cleanup was split into Phase 14.3 (its prerequisite gate).

**Requirements covered:** 13 locked (see 15-SPEC.md) — provisioning + identity integrity + dead-code removal

**Depends on:** Phase 14.3 (Edge Identity Hardening — go-live gate), Phase 2 (Authentication & Routing), Phase 1 (Supabase Foundation)

**SPEC:** 15-SPEC.md (13 requirements, ambiguity 0.13)
**Context:** 15-CONTEXT.md

**Plans:** 11 plans in 6 waves

Plans:
- [x] 15-01-PLAN.md — invites table + hardened handle_new_user trigger + is_active/RLS + apply (W1) (live apply deferred to orchestrator — see 15-01-SUMMARY.md)
- [x] 15-02-PLAN.md — disable signup + Resend SMTP + redirect allow-list (+ human setup) (W1)
- [x] 15-03-PLAN.md — auth pages: accept-invite, forgot/reset password (W1)
- [x] 15-04-PLAN.md — shared invite helper + admin-create-org + admin-invite-first-admin + slug (W2)
- [x] 15-05-PLAN.md — admin-invites-lifecycle (list/resend/revoke) (W3)
- [x] 15-06-PLAN.md — team-invite + team-manage (same-org, role-capped, deactivate) (W3)
- [x] 15-07-PLAN.md — idempotent super_admin bootstrap script (W2)
- [ ] 15-08-PLAN.md — [BLOCKING] deploy 5 edge fns + verify 14.3 gate + run bootstrap live (W4)
- [x] 15-09-PLAN.md — /admin panel UI (org list, create-org, invite, pending invites) (W5) — human-verify checkpoint left open, now routed by 15-11
- [x] 15-10-PLAN.md — Settings Team tab (invite, member mgmt, own-org invites) (W5) — human-verify checkpoint left open, blocked on 15-08 deploy
- [x] 15-11-PLAN.md — SuperAdminRoute + route wiring + dead-code removal (W6)

---

### Phase 16: Token-Free Demo Mode

**Goal:** An internal, super_admin-only demo path that replays a captured proposal generation deterministically and near-instantly, while every post-generation interaction (chat, rewrite, section regeneration, export) runs the real production paths against real indexed content. Demo branching lives ABOVE the population step only. Adds a dedicated demo org (Decision A), versioned capture fixtures (Decision B), per-run clone of pre-computed RFP embeddings (Decision C), a super_admin-gated capture/run/reset edge-fn trio, a scheduled sweep, and a presenter surface reusing the real wizard.

**Requirements covered:** SPEC Reqs 1-9 (see 16-SPEC.md; no Req 10 exists)

**Depends on:** Phase 15 (super_admin bootstrap/provisioning to mirror for the demo-org seed), Phase 14.3 (JWT-derived edge identity)

**SPEC:** 16-SPEC.md (9 requirements, Decisions A/B/C locked)
**Context:** 16-CONTEXT.md - **Research:** 16-RESEARCH.md - **Validation:** 16-VALIDATION.md

**Plans:** 9 plans in 4 waves

Plans:
- [x] 16-01-PLAN.md - demo schema (5 tables + RLS) + clone_demo_fixture_chunks RPC + [BLOCKING] MCP apply (W1) — applied live to fuuvdcvbliijffogjnwg by orchestrator, types regenerated
- [x] 16-02-PLAN.md - demo org migration + idempotent presenter seed script + [BLOCKING] apply/run (W1) — jamo-demo org (is_demo=true) + shared super_admin presenter live on fuuvdcvbliijffogjnwg; seed re-run confirmed idempotent
- [x] 16-03-PLAN.md - demo-capture-fixture edge fn (versioned snapshot, demo-org-only) + deploy (W2) — DEPLOYED and ACTIVE on fuuvdcvbliijffogjnwg (v1, verify_jwt true); end-to-end capture NOT yet exercised (no demo-org proposal exists to capture)
- [ ] 16-04-PLAN.md - demo-run-start edge fn (validate -> atomic materialize -> clone) + validation module (W2)
- [ ] 16-05-PLAN.md - demo-reset edge fn (run-scoped triple-guard) + shared cleanup module + deploy (W2)
- [ ] 16-06-PLAN.md - demo-sweep edge fn + pg_net/pg_cron hourly wiring + [BLOCKING] apply/deploy (W3)
- [ ] 16-07-PLAN.md - capture UI on ProposalDetail + remove vestigial Reset Demo/labels (W3)
- [ ] 16-08-PLAN.md - presenter run surface: wizard driver + template lock + paced populate + Req 6 guard (W3)
- [ ] 16-09-PLAN.md - in-session run-scoped reset control + presenter E2E human-verify (W4)

---

## Milestone 2: Growth (Post-MVP)

*Planned but not yet phased. Begin planning after Milestone 1 ships.*

- Proposal memory — past proposals inform future generation
- PDF export + branded cover pages
- Full CRM suite (HubSpot, Workday, full bidirectional sync)
- OCR for scanned PDFs
- Full compliance scoring engine (numerical, section-level)
- Stripe billing integration
- Full template editor with placeholder mapping
- Automated regulatory update monitoring (PMDA, NMPA, Health Canada, TGA)
- Expanded AI chat capabilities (inline rewriting, operational recommendations)
- Analytics dashboard with CRM win-rate data

---

## Execution Order Rationale

```
Phase 1 (Supabase)     ─┐
Phase 2 (Auth)          ├─ Foundational — everything depends on these
Phase 3 (Doc Parsing)  ─┘

Phase 4 (RAG)          ─── Can run in parallel with phases 2–3

Phase 5 (Wizard)       ─── Depends on Phase 3
Phase 6 (Assumptions)  ─── Depends on Phase 3

Phase 7 (Generation)   ─── Depends on Phases 4, 5, 6
Phase 8 (Workspace)    ─── Depends on Phase 7

Phase 9 (Chat)         ─── Depends on Phases 7, 8
Phase 10 (Templates)   ─── Depends on Phase 3, can run with 7–8
Phase 11 (Export)      ─── Depends on Phase 8 (needs TipTap content)
Phase 12 (Salesforce)  ─── Depends on Phase 1 (Vault), independent otherwise
Phase 13 (Dashboard)   ─── Depends on Phase 1 (Supabase data)
```

## Backlog

### Phase 999.1: Persist compliance flags to DB (BACKLOG)

**Goal:** Compliance flags (yellow indicator, placeholder notices) survive navigation. Currently in-memory React state — wiped on route change.
**Requirements:** TBD
**Plans:** 2/2 plans complete

Plans:
- [x] 999.1-01-PLAN.md — JSONB migration + ComplianceFlagDB type + persistFlags DB upsert at all 4 dispatch sites

### Phase 999.2: Per-geography (regional) supersession status for regulatory_documents (BACKLOG)

**Goal:** Make regulatory supersession express per-geography instead of globally. Today `regulatory_documents.status` is a single global field and the retrieval RPC always filters `status='active'`, so a document is either "current everywhere" or "dead everywhere" — the mechanism cannot model staggered regional adoption (e.g. ICH E6(R3) active in US/EU/UK while R2 remains active in Japan/PMDA). Current workaround: model divergent versions as independent `active` docs with disjoint `geography` arrays and no supersedes link, which loses lineage and the single-active-per-key guarantee. Real fix: a geography-scoped supersession status (status/effective scoped by region, or a geography-keyed supersession record) so the mechanism directly models regional timelines. Framed generally — the next staggered-adoption guideline hits the same rock. Deferred, not eliminated.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.3: Regulatory retrieval strategy for design-oriented sections (BACKLOG)

**Goal:** Make a design-oriented proposal section (e.g. "Study Design") retrieve the semantically-appropriate regulatory grounding under the 0.65 cosine threshold. Surfaced during Phase 14.6 e2e (Plan 05, Task 3): the (b)+(a)+seeder chain is verified correct, but the specific "Study Design" case does not clear threshold — and the diagnosis is a genuine retrieval-strategy gap, NOT a query-construction defect.

**Evidence (captured at 14.6 e2e, threshold = 0.65, geography=[US], org 00000000-...-0001):**
- `buildRegulatoryQuery` correctly enriches — composed query was: `"Study Design — Phase 2 Oncology study of non-small cell lung cancer"` (sectionName + phase + TA + indication all present; NO collapse).
- Top-10 candidates for that exact query (all filters relaxed, threshold lowered to 0 to expose scores):
  - 0.5286 [ICH-E3], 0.5065 [ICH-E3], 0.4952 [ICH-E9], 0.4938 [ICH-E8R1], 0.4935 [ICH-E9], 0.4918 [ICH-M3R2], 0.4908 [ICH-E3], 0.4884 [ICH-M3R2], 0.4857 [ICH-M3R2], 0.4834 [ICH-M3R2].
  - ICH-E6R3 (the GCP guideline) did NOT appear in the top 10; 0 rows cleared 0.65.
  - For comparison, ICH-E6R3 scores 0.72–0.69 (clears 0.65, top-ranked) for GCP-phrased queries like "Good Clinical Practice requirements and responsibilities in clinical trial conduct" — so the seed is retrievable; the gap is section-query ↔ doc semantics.
- Note: the nearest matches for "Study Design" are ICH-E9 (Statistical Principles) / E3 (Study Reports) design content — arguably the *correct* grounding for a design section, just below 0.65.

**Explicitly NOT the fix:** do NOT globally lower `RETRIEVAL_SIMILARITY_THRESHOLD` (0.65) — that degrades precision everywhere. Candidate directions instead: section-type → doc-type/agency routing or per-section query templates; per-doc_type or adaptive thresholds; query expansion for GCP-relevant sections; reconsider whether "Study Design" should target E9/E3 rather than E6R3. Requires clinical-domain input on which guideline grounds which section.
**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.4: extract-document OOM (WORKER_RESOURCE_LIMIT) on heavier PDFs (BACKLOG)

**Goal:** Uploading a heavier PDF no longer crashes the `extract-document` edge function. Today a large PDF returns HTTP **546 WORKER_RESOURCE_LIMIT** ("Function failed due to not having enough compute resources") after ~3.75s, leaving the document row stuck at `parse_status='extracting'` with 0 chunks. Pre-existing memory pressure — **not** a 14.7 regression (surfaced during 14.7 UAT; the only 14.7 change to this function adds one already-fetched `proposal_id` field per chunk row, which cannot cause an OOM). Smaller docs ingest fine (doc `694f8ad5…` → 5 chunks); doc `08358f62…` crashed.

**Evidence:** File `supabase/functions/extract-document/index.ts` (deployed v8). Failure scales with document size → memory, not logic. Stuck doc `08358f62…` should be reset (`parse_status`).

**Candidate directions (not the fix — investigate first):** raise the Supabase edge memory tier; shrink the embedding batch size held in memory; stream/chunk the parse instead of loading the whole PDF. Confirm root cause via `get_logs` before choosing.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.5: First-section placeholder-marking bug on new proposal generation (BACKLOG)

**Goal:** On a **new** proposal generation, the **first** section's placeholders are marked correctly (they currently are not, and a console error appears). Long-standing bug; reproduces even with **no** document uploaded, so it is independent of the extract-document OOM (999.4).

**Evidence / lead:** Likely files `src/hooks/useProposalGeneration.ts`, the `substitute_placeholders` path, and `buildContextPayload`. Strong suspect (per memory `chat-context-must-use-live-editor-content`): context must be built from the **live editor** `getContent()` rather than the stale `proposalSections` snapshot, or `substitute_placeholders` ids drift → "placeholder not found". First-section timing (editor not yet populated when the first section is processed) is the prime suspect. Capture the exact console error text as step 1.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)

### Phase 999.6: Abandoned draft proposals accumulate with no cleanup (BACKLOG)

**Goal:** Abandoned draft proposals no longer accumulate indefinitely. A user who starts the creation wizard but never finishes should not leave a permanent orphaned draft (plus its child rows and uploaded files) behind.

**Evidence / lead (verified 2026-07-20, surfaced during Phase 16 spec research):** The wizard creates a `proposals` draft **eagerly on entering step 1 (Document Upload)** — `src/components/ProposalCreationWizard.tsx:139-159`, before generation. The "Reset Demo" control (`src/components/Sidebar.tsx:123`) only does `sessionStorage.clear(); window.location.reload()` — it deletes **nothing** in the DB. There is **no** cleanup mechanism for abandoned drafts anywhere (the only cron, `reap_stuck_document_extractions` `20260713000001`, just flips `proposal_documents.parse_status` to `error`; it never deletes proposals). Abandoned drafts pass the list filter (`deleted_at IS NULL AND is_archived = false`, `ProposalsContext.tsx:58-63`) so they stay visible. Live data corroborates: **Test Org A holds 60 drafts** vs. a handful of terminal-status proposals — consistent with accumulation. Note the orphan chain on any hard-delete: `proposal_documents.proposal_id` is **SET NULL** (not cascade) and Storage objects in the `documents` bucket are never removed by proposal-delete paths (`ProposalsContext.tsx:130-135`), so a naive cleanup would leave orphaned document rows + files.

**Scope note:** This is a **pre-existing production defect independent of demo mode** — deliberately NOT absorbed into Phase 16 (which only needs its own demo-org sweep). Options to weigh when promoted: (a) don't persist a draft until the user commits past step 1; (b) a sweep of stale untouched drafts; (c) explicit delete-on-abandon. Any fix must also clean `proposal_documents`/`document_extracts` + Storage, not just the `proposals` row.

**Requirements:** TBD
**Plans:** 0 plans

Plans:
- [ ] TBD (promote with /gsd-review-backlog when ready)
