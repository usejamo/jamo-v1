# REQUIREMENTS.md — Jamo CRO Proposal Intelligence Platform

**Created:** 2026-03-05
**Version:** 1.0 (Milestone 1 — MVP)

---

## Scope Statement

Transform the existing React demo into a production-grade B2B SaaS platform. The MVP delivers functional AI-powered CRO proposal generation with a live AI assistant, built on Supabase. The demo's visual design and layout are preserved throughout.

---

## Milestone 1 — MVP Requirements

### M1-1: Proposal Creation Wizard

**Goal:** Replace the current "New Proposal" modal with a guided multi-step intake flow that feeds structured data into the generation engine.

**Requirements:**
- REQ-1.1: 4-step wizard: (1) Study Info → (2) Document Upload → (3) Assumption Review → (4) Template & Generate
- REQ-1.2: Step 1 captures: sponsor name/contact, therapeutic area, indication, study phase, countries/regions, proposal due date, services requested
- REQ-1.3: Step 2 supports multi-file upload of PDF, DOCX, TXT, XLSX files
- REQ-1.4: Files upload directly to Supabase Storage (not proxied through Edge Function)
- REQ-1.5: "Skip to Fast Draft" button available from Step 1 onward — uses whatever data is available, outputs quality proportional to input
- REQ-1.6: Wizard state persists in sessionStorage across step navigation
- REQ-1.7: Each step validates required fields before advancing; shows clear error states

---

### M1-2: Document Parsing Pipeline

**Goal:** Extract usable text from uploaded files to feed the AI generation engine.

**Requirements:**
- REQ-2.1: After upload, trigger a Supabase Edge Function to extract text from each file
- REQ-2.2: PDF extraction via `npm:pdf-parse` (digital PDFs only — scanned PDF support is V2)
- REQ-2.3: DOCX extraction via `npm:mammoth` — extract both plain text and HTML (preserves heading structure)
- REQ-2.4: XLSX extraction via `npm:xlsx@0.18.5` — output as CSV for AI context
- REQ-2.5: TXT files read directly without parsing library
- REQ-2.6: Extracted text stored in a `document_extracts` table in Supabase, linked to the proposal and org
- REQ-2.7: Auto-classify document type where possible (RFP, protocol, transcript, budget) based on filename and content signals
- REQ-2.8: Extraction errors surface to UI as per-file status indicators (extracting / complete / failed)

---

### M1-3: AI Assumption Extraction & Review

**Goal:** Run a dedicated AI pass to extract key assumptions from uploaded documents and present them for user review before generation begins.

**Requirements:**
- REQ-3.1: After all files are extracted, run a structured Claude extraction call that returns typed JSON
- REQ-3.2: Extraction identifies: sponsor/study metadata, scope of work, timelines/milestones, inclusion/exclusion criteria, budget assumptions, missing/ambiguous information
- REQ-3.3: Each assumption includes a confidence level: high / medium / low
- REQ-3.4: Assumption review screen displays extracted assumptions as editable cards
- REQ-3.5: User can edit, approve, reject, or add assumptions the AI missed
- REQ-3.6: Approved assumptions become the structured `ProposalInput` fed to generation
- REQ-3.7: Missing required fields flagged explicitly (with prompts to fill them in before generating)

---

### M1-4: Section-by-Section Proposal Generation

**Goal:** Generate a full CRO proposal via Anthropic API, section by section, with real-time streaming display.

**Requirements:**
- REQ-4.1: Generation runs in Supabase Edge Functions — API key never exposed to browser
- REQ-4.2: Sections generated in dependency order: Study Understanding first, Executive Summary and Cover Letter last
- REQ-4.3: Each section call uses a ~500-token "Consistency Anchor" from prior sections (not full prior text) to prevent O(n²) context inflation
- REQ-4.4: Streaming: Edge Function pipes Anthropic SSE stream to browser; sections appear as they are written
- REQ-4.5: Each completed section is written to Supabase (`proposal_sections` table) immediately — progress is durable
- REQ-4.6: Frontend subscribes to Supabase Realtime to render sections as they arrive
- REQ-4.7: Generation can be triggered section-by-section (regenerate individual section) or full-proposal (all sections in sequence)
- REQ-4.8: Tone controls per section: formal / regulatory / persuasive (passed as generation parameter)
- REQ-4.9: RAG context: retrieve relevant regulatory document chunks from pgvector and include in each generation call
- REQ-4.10: `[PLACEHOLDER: ...]` markers preserved in output for user to fill in missing information

---

### M1-5: Section-by-Section Proposal Workspace

**Goal:** The core editing environment where all proposal work happens after generation.

**Requirements:**
- REQ-5.1: Three-panel layout: left (section navigation) / center (editor) / right (AI panel) — matches existing demo layout
- REQ-5.2: Rich text editor (TipTap v2) in center panel — replaces the current read-only `ProposalDraftRenderer`
- REQ-5.3: Per-section actions: Generate, Regenerate, Expand, Condense, Rewrite
- REQ-5.4: Lock/unlock toggle per section — locked sections are read-only and excluded from AI edits
- REQ-5.5: Version history per section — user can view and restore prior versions
- REQ-5.6: Section navigation in left panel shows completion status: complete / needs review / missing
- REQ-5.7: Cross-section consistency checks after full generation: flag budget/scope misalignment, timeline inconsistencies
- REQ-5.8: Compliance flags displayed inline: "No safety reporting section detected," "ICH E6 reference absent" — qualitative only, no numerical scores

---

### M1-6: Jamo AI Chat Panel

**Goal:** Context-aware AI assistant docked in the right panel — proactively flags gaps and responds to user queries.

**Requirements:**
- REQ-6.1: After generation, Jamo proactively identifies missing information (unfilled `[PLACEHOLDER]` markers, thin sections, missing regulatory references) and presents them as actionable questions
- REQ-6.2: Chat capability 1 — "Ask about your documents": RAG-style Q&A over the user's uploaded files
- REQ-6.3: Chat capability 2 — "Explain this section": AI explains why it wrote what it wrote and which source material informed it
- REQ-6.4: When user responds to Jamo's questions or makes a chat request, Jamo makes the corresponding edit directly in the proposal document (TipTap editor updated programmatically)
- REQ-6.5: Chat is scoped to the current proposal — not a general-purpose chatbot
- REQ-6.6: Chat history saved per proposal in Supabase (`proposal_chats` table)
- REQ-6.7: Streaming responses in chat panel — Jamo's reply streams in as it is generated

---

### M1-7: Supabase Backend & Database

**Goal:** Persistent storage replacing in-memory React Context.

**Requirements:**
- REQ-7.1: Supabase Postgres as primary database
- REQ-7.2: Core tables: `organizations`, `user_profiles`, `proposals`, `proposal_sections`, `proposal_documents`, `document_extracts`, `proposal_chats`, `proposal_assumptions`
- REQ-7.3: Row Level Security (RLS) on every table — all queries scoped to `org_id`
- REQ-7.4: `org_id` denormalized onto every table (no cross-org joins)
- REQ-7.5: Supabase Storage for uploaded files — private bucket with RLS on `org_id` path prefix
- REQ-7.6: pgvector extension enabled for regulatory knowledge base RAG
- REQ-7.7: Regulatory knowledge base seeded with: ICH E6(R2/R3), top 10 FDA clinical trial guidance docs, ICH E3 (CSR structure), key EMA clinical trial regulations
- REQ-7.8: Documents chunked at section boundaries (400–600 tokens, 100-token overlap), embedded with OpenAI `text-embedding-3-small`, stored in pgvector
- REQ-7.9: Usage tracking from day one: proposals generated, AI calls made, documents processed, active users (for future billing tiers)
- REQ-7.10: Feature flag table/column structure in place for future tiered access gating

---

### M1-8: Authentication & RBAC

**Goal:** Secure multi-tenant access with org-level data isolation.

**Requirements:**
- REQ-8.1: Supabase Auth — email/password login for MVP; SSO-ready architecture
- REQ-8.2: Login page replacing the current public-access demo
- REQ-8.3: Three roles: Super Admin (platform), Admin (org), User (proposal manager)
- REQ-8.4: Org-level data isolation — Organization A cannot access Organization B's data under any circumstance
- REQ-8.5: Auto-create `user_profiles` row on `auth.users` insert (Postgres trigger)
- REQ-8.6: Protected routes — all app routes redirect to login if unauthenticated
- REQ-8.7: Session management via Supabase JWT — standard token refresh flow

---

### M1-9: Template Management

**Goal:** Pre-built templates plus organization's own uploaded templates as AI context.

**Requirements:**
- REQ-9.1: 2–3 pre-built CRO proposal templates seeded in the platform
- REQ-9.2: Organizations can upload their own proposal templates (DOCX/PDF)
- REQ-9.3: Uploaded template text extracted and included in AI generation context — AI adapts to the organization's format, section naming, and style
- REQ-9.4: Template selection in Step 4 of the wizard
- REQ-9.5: Templates scoped to org (org can't see another org's templates)

---

### M1-10: DOCX Export

**Goal:** Clean, professional DOCX export of the generated proposal.

**Requirements:**
- REQ-10.1: Export button in the proposal workspace generates a DOCX file
- REQ-10.2: Export runs client-side using the `docx` npm package (v8.x)
- REQ-10.3: Output formatting: proper headings (H1/H2/H3), paragraph styles, bulleted lists, tables
- REQ-10.4: If the organization uploaded a template, export attempts to match that template's section structure
- REQ-10.5: Export triggers browser download directly — no server round-trip

---

### M1-11: Proposal Lifecycle Dashboard

**Goal:** Lightweight dashboard showing proposal activity. Preserves existing dashboard look/feel.

**Requirements:**
- REQ-11.1: Proposal count by status: draft / in progress / submitted / won / lost
- REQ-11.2: Generation metrics: proposals generated this month, AI calls, estimated time saved
- REQ-11.3: Priority Focus card retains existing UI; data sourced from Supabase instead of in-memory
- REQ-11.4: Pipeline summary sourced from live proposal data

---

### M1-12: Salesforce Integration (Basic)

**Goal:** Pull sponsor metadata from Salesforce to pre-populate wizard; push proposal status back.

**Requirements:**
- REQ-12.1: Salesforce OAuth via JWT Bearer Token flow — handled in Supabase Edge Function
- REQ-12.2: Salesforce private key stored in Supabase Vault secrets
- REQ-12.3: Read Salesforce Opportunities and Accounts to pre-populate: sponsor name, contact, therapeutic area
- REQ-12.4: Write proposal status updates back to Salesforce Opportunity (draft → submitted → won/lost)
- REQ-12.5: Integration configured per-organization in Settings → Integrations tab (existing UI)
- REQ-12.6: Graceful degradation — Salesforce connection failure does not block proposal creation

---

## Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Generation latency | Individual section: <30s; Full proposal: visible progress streaming |
| File upload size | Up to 50MB per file (Supabase Storage limit) |
| Auth token refresh | Automatic via Supabase client |
| Data isolation | 100% — RLS enforced at DB level, not application level |
| API key security | Anthropic key never in browser — Edge Function only |
| Export quality | DOCX must be clean enough for professional use without manual reformatting |

---

## Out of Scope (MVP)

- PDF export (V2)
- HubSpot / Workday CRM integration (V2)
- OCR for scanned PDFs (V2)
- Numerical compliance scoring (V2)
- Stripe billing integration (V2 — usage tracked, invoicing manual)
- Full template editor (V2)
- Automated regulatory update monitoring (V2)
- Expanded RAG library beyond core ICH/FDA/EMA (V2)
- Proposal memory across proposals (V2 — Supabase backend enables this foundation)
- Video/audio transcription (never — third-party tools handle this)

---

## Key Technical Decisions (Research-Informed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rich text editor | TipTap v2 | Extension system supports AI injection, lock/unlock, custom blocks. ProseMirror-based, stable. |
| PDF parsing | `npm:pdf-parse` (Deno) | Community-confirmed Deno compatible; import via lib path to avoid test runner issue |
| DOCX parsing | `npm:mammoth` | Pure JS, preserves heading structure in HTML output, actively maintained |
| XLSX parsing | `npm:xlsx@0.18.5` | Pin to 0.18.5 — v0.19+ changed to proprietary license |
| DOCX export | `docx` npm package (client-side) | Proposal data already in browser; eliminates server round-trip |
| Embeddings | OpenAI `text-embedding-3-small` | Anthropic has no embedding API; ~$0.10 to embed full regulatory library |
| RAG indexing | pgvector HNSW | No training phase required (vs. IVFFlat), faster at query time |
| Streaming | Two-phase: buffer SSE → load TipTap | Avoids editor conflicts during streaming; document loads cleanly on completion |
| Salesforce auth | JWT Bearer Token flow | No user interaction required; RS256 signing via Deno Web Crypto |
| Generation consistency | ~500-token Consistency Anchor | Prevents O(n²) context inflation from passing full prior sections |
