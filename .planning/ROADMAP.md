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

**Plans:** 6 plans

Plans:
- [ ] 08-00-PLAN.md — Wave 0: TipTap install, migrations, type contracts, test stubs
- [ ] 08-01-PLAN.md — SectionWorkspace + SectionEditorBlock + autosave + lock/unlock
- [ ] 08-02-PLAN.md — SectionActionToolbar + AI action previews (Expand/Condense/Rewrite)
- [ ] 08-03-PLAN.md — Version history overlay + section nav with status dots
- [ ] 08-04-PLAN.md — Compliance flags + consistency check Edge Function + banner
- [ ] 08-05-PLAN.md — Wire into ProposalDetail + activate tests + human verify

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

---

### Phase 11: DOCX Export

**Goal:** Clean client-side DOCX export of the generated proposal.

**Deliverables:**
- "Export" button in proposal workspace toolbar
- Client-side DOCX generation using `docx` npm package (v8.x)
- Exports: headings, paragraphs, bullet lists, tables — all properly styled
- If org has an uploaded template, attempts to match section structure
- Browser download triggered directly — no server round-trip

**Requirements covered:** REQ-10.1 through REQ-10.5

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

### Phase 13: Dashboard & Proposal Lifecycle

**Goal:** Wire the existing dashboard to live Supabase data. Lightweight metrics.

**Deliverables:**
- Dashboard KPI cards sourced from Supabase (proposal counts by status)
- Priority Focus card shows real upcoming deadlines
- Generation metrics: proposals generated, AI calls made (from usage tracking)
- Proposal status transitions: draft → in progress → submitted → won / lost
- ProposalsList filters (active / archived / deleted) all hitting Supabase

**Requirements covered:** REQ-11.1 through REQ-11.4

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
