# PROJECT.md — Jamo CRO Proposal Intelligence Platform

**Created:** 2026-03-05
**Type:** Brownfield (existing React demo → production SaaS)
**Stage:** In development — Phase 9 complete (Jamo AI Chat Panel live); Phase 10 next
**Last updated:** 2026-04-02

---

## What We're Building

Jamo is a B2B SaaS platform that helps Contract Research Organizations (CROs) generate, edit, and manage clinical trial proposals. CRO proposal writers upload RFP documents and study materials; Jamo's AI extracts key information, generates comprehensive structured proposals, and assists writers in refining them — all while maintaining compliance with regulatory standards (ICH-GCP, FDA, EMA, etc.).

The product already has a polished visual demo (React frontend). The goal is to replace the hardcoded demo data with a fully functional production backend while preserving the look and feel.

---

## Users

- **Primary user:** Proposal writers and business development staff at CRO companies
- **Org structure:** Multi-tenant — each CRO organization is isolated
- **Roles (MVP):** Super Admin (platform owner), Admin (org-level), User (proposal manager)

---

## Core Problems Being Solved

1. CRO proposals take days to weeks to write manually — they are long, highly structured, clinically precise documents
2. Proposal writers must extract relevant info from many documents (RFPs, protocols, transcripts) and translate it into a persuasive narrative
3. Generic AI tools can't produce regulatory-compliant, domain-accurate CRO proposals without deep domain context
4. No good tool exists to bridge CRM data, uploaded documents, and AI generation into a coherent workflow

---

## Product Vision — Priority Order

### Priority 1: Proposal Generation Engine (Core)
Functional AI-powered proposal generation using the Anthropic API. When a user hits Generate, the system analyzes uploaded files, extracts structured information, and produces a comprehensive CRO proposal section by section.

### Priority 2: Live Jamo AI Assistant
After generation, the Jamo AI proactively identifies missing information and asks the user to fill in key gaps. The user can also chat with Jamo directly — and Jamo automatically makes changes in the proposal document in response.

### Priority 3: Supabase Backend + Memory + Auth
Persistent storage (proposals, files, users), proposal memory (past proposals inform future ones), and user authentication.

---

## Product Feature Decisions — Finalized

**Date:** 2026-03-05

---

### 1. Multi-Step Proposal Creation Wizard
**Decision:** Build a guided multi-step intake flow with an option to skip steps for a "fast draft" mode.
**Scope:** MVP
**Implementation notes:**
- Step 1: Basic study information (sponsor, phase, therapeutic area, regions, deadline)
- Step 2: Multi-format document upload (RFPs, transcripts, budgets, investigator brochures, regulatory docs)
- Step 3: AI assumption extraction and user review/approval
- Step 4: Template selection and generation
- Each step validates and enriches data before it reaches the AI generation engine
- Include a "Skip to Fast Draft" option that uses whatever data has been provided so far — output quality scales with input quality
- The wizard feeds structured variables into the backend prompt engine — this is a data pipeline, not a single-prompt approach

---

### 2. AI Assumption Extraction & User Approval Layer
**Decision:** Build an intermediate assumption review screen between document upload and proposal generation.
**Scope:** MVP
**Implementation notes:**
- After documents are uploaded, run a separate AI extraction pass to identify: scope of work, deliverables, timelines/milestones, inclusion/exclusion criteria, budget assumptions, missing/ambiguous information
- Present extracted assumptions as editable cards or a checklist
- Include confidence levels (high/medium/low) on each extraction
- Users can edit, approve, reject, or add assumptions the AI missed
- Approved assumptions become the structured input for the proposal generation engine
- Increased API cost and latency from the extraction pass is acceptable — quality matters more than speed
- **This is the core differentiator:** transparent AI reasoning, not a black box

---

### 3. Compliance Flagging (Simple Version)
**Decision:** MVP implements a lightweight compliance flagging system — qualitative flags only, no numerical scores.
**Scope:** MVP (simple flags) → V2 (full compliance scoring engine)
**Implementation notes:**
- Flag when expected regulatory sections are missing or thin (e.g., "No safety reporting section detected," "ICH E6 reference absent")
- Qualitative indicators only: complete / needs review / missing
- Do NOT assign numerical compliance scores in MVP — liability risk and false confidence
- V2: full compliance review workspace, dedicated compliance officer role, risk severity classification, exportable compliance reports

---

### 4. Section-by-Section Proposal Workspace
**Decision:** The core UX paradigm is section-level generation and editing — not monolithic whole-proposal generation.
**Scope:** MVP
**Implementation notes:**
- Left panel: section navigation (Executive Summary, Study Design, Regulatory Strategy, Monitoring Plan, Budget Narrative, Risk Mitigation Plan, etc.)
- Center panel: rich text editor with AI-assisted drafting tools
- Right panel: AI insights, compliance flags, and context references
- Users can generate, regenerate, expand, condense, or rewrite individual sections independently
- Tone controls per section (formal, regulatory, persuasive)
- Lock/unlock mechanism for approved sections
- Version history per section
- Build section-level generation first; "generate full proposal" is a convenience wrapper that calls each section sequentially
- Cross-section consistency checks: budget must align with scope, timelines must be internally consistent

---

### 5. Context-Aware AI Chat Panel (Scoped for MVP)
**Decision:** Dockable AI chat panel within the workspace — scoped to two core capabilities for MVP.
**Scope:** MVP (scoped) → V2 (expanded)
**Implementation notes:**
- MVP capability 1: "Ask about your documents" — RAG-style Q&A over uploaded files
- MVP capability 2: "Explain this section" — AI explains why it wrote what it wrote and what source material informed the content
- Chat is context-aware: references uploaded documents and current proposal state
- Chat history saved per proposal for audit purposes
- Jamo proactively flags gaps after generation and asks user to fill in missing information
- V2 adds: inline rewriting via chat, operational recommendations, risk mitigation suggestions, regulatory language enhancement

---

### 6. CRM Integration — Salesforce (Simplified for MVP)
**Decision:** Simplified Salesforce integration for MVP. Full CRM suite is V2, starting immediately after MVP ships.
**Scope:** MVP (Salesforce basic) → V2 (full CRM suite)
**Implementation notes:**
- MVP: pull client/sponsor metadata to pre-populate proposal fields, push proposal status back to Salesforce (draft, submitted, won, lost)
- Read from Salesforce Opportunities/Accounts; write status updates back — no full bidirectional sync in MVP
- V2: HubSpot, Workday, full bidirectional sync, proposal value tracking in CRM dashboards, custom field mapping
- Design the integration layer as an abstraction from day one — new CRM connectors should be modular, not hardcoded

---

### 7. Role-Based Access Control (Simplified)
**Decision:** Two user roles plus platform admin.
**Scope:** MVP
**Implementation notes:**
- Super Admin (platform owner): manages organizations, subscriptions, global settings
- Admin (organization level): manages team users, roles, billing, org settings
- User (proposal manager): creates and edits proposals within their org
- **Data isolation is non-negotiable:** Organization A cannot see Organization B's data
- Design the data model for multi-tenancy from day one
- Skip dedicated compliance officer role for MVP — can be a permission flag later
- Authentication: email/password with SSO readiness in the architecture

---

### 8. Template Management (Pre-Built + User Upload)
**Decision:** Launch with 2-3 pre-built templates; allow organizations to upload their own templates as AI context.
**Scope:** MVP
**Implementation notes:**
- Pre-built templates: 2-3 standard CRO proposal structures
- User-uploaded templates: CROs upload DOCX/PDF of their own proposal format — the AI adapts to match their structure, section naming, and style
- **Critical:** CROs will not abandon their own established formats. The AI adapts to their template, not the other way around.
- Template sections map to section-by-section workspace navigation
- V2: full template editor, mandatory section enforcement, version control, template cloning, global template library

---

### 9. Regulatory Knowledge Base with RAG
**Decision:** Curated regulatory knowledge base the AI references during generation via RAG.
**Scope:** MVP (core library + RAG) → V2 (expanded + auto-update agent)
**Implementation notes:**
- Initial library: ICH E6(R2/R3) GCP guidelines, top 10 FDA guidance documents for clinical trials, ICH E3 (CSR structure), key EMA clinical trial regulations
- Use RAG so AI can cite specific regulatory guidance during generation
- Build an update mechanism: admin tool or agent that ingests new regulatory documents on demand
- V2: automated monitoring for regulatory updates, expanded library covering PMDA, NMPA, Health Canada, TGA, TA-specific guidance
- **One of our strongest moats** — generic AI tools cannot do this. Invest in knowledge base quality as a core content asset.
- Chunking and retrieval quality matters enormously — test thoroughly with real CRO scenarios

---

### 10. Proposal Lifecycle Dashboard (Lightweight)
**Decision:** Lightweight dashboard tracking proposal activity and basic metrics.
**Scope:** MVP (basic) → V2 (full analytics with CRM data)
**Implementation notes:**
- Track: proposal count, status (draft / in progress / submitted / won / lost), generation metrics (time saved, sections generated, AI usage)
- Simple usage analytics: "You generated 12 proposals this month, 40% faster than manual average"
- V2: total proposal value, won proposal value, win-rate %, per-sponsor breakdowns, per-TA performance, monthly/quarterly trends

---

### 11. Document Parsing Pipeline
**Decision:** PDF and DOCX text extraction for MVP. XLSX for budget uploads. No OCR, no video/audio.
**Scope:** MVP
**Implementation notes:**
- Supported formats: PDF (digital, not scanned), DOCX, TXT, XLSX
- We do NOT build transcript/note-taking software — CROs upload transcripts as text files from their own tools (Otter, Fireflies, etc.)
- V2: OCR for scanned PDFs, auto-classification of document types, richer spreadsheet parsing
- Metadata tagging: auto-classify uploaded documents by type where possible (RFP, protocol, transcript, regulatory, budget)

---

### 12. DOCX Export
**Decision:** DOCX export for MVP. PDF export is V2.
**Scope:** MVP (DOCX) → V2 (PDF + branded exports)
**Implementation notes:**
- DOCX export is critical — CROs always do final polish in Word
- Output must be clean, professional, and properly formatted — bad formatting instantly undermines trust
- If the CRO uploaded their own template, export should attempt to match that template's formatting
- Worst-case MVP acceptable outcome: well-structured text the user pastes into their branded template
- V2: PDF export, branded cover pages, logo insertion, org-specific formatting presets

---

### 13. Subscription / Pricing Architecture
**Decision:** Design for tiered pricing from day one (feature flags, usage counters), but no billing infrastructure for MVP.
**Scope:** MVP (architecture only) → V2 (billing engine)
**Implementation notes:**
- Track usage from day one: proposals generated, AI calls made, documents processed, active users
- Use feature flags to gate functionality — enables tiered access later without re-architecture
- Launch with manual invoicing for early customers
- V2: Stripe integration, self-service plan selection, automated billing, usage alerts, upgrade/downgrade flows

---

## Architecture Principles

1. **Structured input over raw prompts:** The system is a data pipeline that feeds structured, validated, user-approved data into the AI — not a single prompt box. Every piece of context the AI receives should be intentional.

2. **Section-level generation:** Proposals are generated section by section using focused, smaller prompts. Full-proposal generation is a convenience wrapper that orchestrates section-level calls. This produces better output and gives users granular control.

3. **Transparency and explainability:** Every AI-generated section should be traceable to source material. Users should be able to ask "why did you write this?" and get a meaningful answer. Assumptions are explicit, not hidden.

4. **Multi-tenancy from day one:** Data isolation between organizations is non-negotiable. Design every data model, query, and API endpoint with org-level scoping.

5. **Modular integrations:** CRM connectors, document parsers, and AI providers should be abstracted behind clean interfaces so they can be swapped, upgraded, or extended without touching core logic.

6. **Regulatory grounding via RAG:** The AI doesn't rely solely on training data for regulatory knowledge. A maintained, curated knowledge base provides current regulatory context via retrieval-augmented generation.

7. **Export quality matters:** The exported document is the product. If the DOCX looks bad, nothing else matters. Invest in formatting.

---

## Technical Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Frontend | React 19 + TypeScript + Tailwind | Existing demo — keep UI intact |
| AI Provider | Anthropic API (Claude) | `cro-proposal-generator.js` already written |
| Backend | Supabase Edge Functions | File parsing + Anthropic API calls |
| Database | Supabase (Postgres) | Proposals, users, orgs, chat history |
| File Storage | Supabase Storage | RFPs, protocols, uploaded templates |
| Auth | Supabase Auth | Email/password, SSO-ready |
| RAG | Supabase pgvector | Regulatory knowledge base retrieval |
| Export | DOCX (MVP), PDF (V2) | CROs polish in Word |
| CRM (MVP) | Salesforce (read + write status) | Full suite in V2 |

---

## Existing Codebase Summary

- **Frontend-only React demo** with in-memory state (React Context)
- Proposal CRUD, AI chat panel, section renderer all exist as UI shells
- `cro-proposal-generator.js` written but not wired to any UI
- `cro_proposal_prompt_template.md` documents the prompt structure
- No backend, no auth, no database currently
- See `.planning/codebase/` for full analysis

---

## Out of Scope (MVP)

- PDF export
- HubSpot / Workday CRM integration
- OCR for scanned PDFs
- Video/audio transcription
- Full compliance scoring engine (numerical scores)
- Stripe billing
- Full template editor
- Automated regulatory update monitoring
- Expanded RAG library beyond core ICH/FDA/EMA docs
