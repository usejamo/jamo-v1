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
- [ ] 14.3-03-PLAN.md — retrieve-context: branch internal-service-role vs user-JWT; preserve internal RAG caller (REQ-2, core risk) [Wave 2]
- [ ] 14.3-04-PLAN.md — salesforce-oauth-initiate + -disconnect: derive org from JWT, 403 on mismatch (REQ-2) [Wave 2]
- [ ] 14.3-05-PLAN.md — [BLOCKING] deploy all four + siblings; A2 check; live regression/cross-tenant/internal-RAG verification (D-05) [Wave 3]

---

### Phase 15: Client Onboarding & Provisioning

**Goal:** Replace the interim demo signup with a sales-led, invite-only provisioning flow. Public signup stays permanently disabled; an admin (us) provisions each client org and invites the client's first admin by email via Supabase `auth.admin` invite — the invitee follows the link and sets their own password. That org admin can then invite their own teammates (roles: super admin / admin / user). Includes an org-creation flow, production SMTP/email config in Supabase (invites + password resets; `mailer_autoconfirm` off), and a lightweight internal admin surface (panel or script/edge function) to provision clients without manual DB edits. Server-bound identity integrity (invitee cannot self-assign org/role) is in scope; the broader edge-function JWT identity cleanup was split into Phase 14.3 (its prerequisite gate).

**Requirements covered:** 13 locked (see 15-SPEC.md) — provisioning + identity integrity + dead-code removal

**Depends on:** Phase 14.3 (Edge Identity Hardening — go-live gate), Phase 2 (Authentication & Routing), Phase 1 (Supabase Foundation)

**SPEC:** 15-SPEC.md (13 requirements, ambiguity 0.13)
**Context:** 15-CONTEXT.md

**Plans:** Not planned yet

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
