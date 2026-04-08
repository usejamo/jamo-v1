# Architecture

**Analysis Date:** 2026-03-03

## Pattern Overview

**Overall:** React Context-based multi-layer application with tab-based navigation and floating modals

**Key Characteristics:**
- React Router v7 for client-side routing with 4 main pages
- React Context for state management (no Redux/Zustand)
- Tailwind CSS with jamo custom color palette for styling
- In-memory state persistence via sessionStorage for draft generation
- Modal-first interaction pattern for create/edit operations

## Layers

**Presentation Layer:**
- Purpose: Renders UI components and handles user interactions
- Location: `src/components/`, `src/pages/`
- Contains: Page components (Dashboard, ProposalsList, ProposalDetail, Settings), UI components (Layout, Sidebar, Modals)
- Depends on: Context hooks, React Router, Tailwind utilities
- Used by: React Router and BrowserRouter entry point

**State Management Layer:**
- Purpose: Centralizes business logic and reactive state across the app
- Location: `src/context/`
- Contains: Context providers (ProposalsContext, ProposalModalContext, SidebarContext, DeletedContext, ArchivedContext)
- Depends on: React hooks (useContext, useState)
- Used by: All components that need global state

**Type Layer:**
- Purpose: Defines TypeScript interfaces for proposals, drafts, and annotations
- Location: `src/types/`
- Contains: Proposal interface, DraftSection/DraftSubsection/ContentBlock union types, Annotation types
- Depends on: Nothing
- Used by: Context, components, data generators

**Data Layer:**
- Purpose: Generates static/mock data for development
- Location: `src/data/`
- Contains: proposalDraftData.ts (generates rich proposal sections), demoCommands.ts, documents.json, proposals.json
- Depends on: Type definitions
- Used by: Pages and components for data initialization

**AI Integration Layer:**
- Purpose: Generates CRO proposals via Anthropic API
- Location: `cro-proposal-generator.js` (root-level, outside `src/`)
- Contains: System prompt, `buildUserMessage()` builder, `generateProposal()` wrapper, `generateProposalBySection()` for large proposals, domain constants (AVAILABLE_SERVICES, THERAPEUTIC_AREAS, STUDY_PHASES)
- Depends on: Anthropic API (external), native `fetch`
- Used by: Frontend form UI (not yet wired) or server-side backend caller

## Data Flow

**Proposal Lifecycle:**

1. User clicks "New Proposal" button → ProposalModalContext.openModal() called with no proposal
2. ProposalEditorModal renders with blank form state
3. User fills form and clicks Save → ProposalsContext.createProposal() generates new ID and appends to proposals array
4. Modal closes, ProposalsList re-renders with new proposal visible
5. User navigates to proposal detail → ProposalDetail page loads and queries ProposalsContext for proposal by ID
6. In detail view, user can generate AI draft (sessionStorage persists across navigation) and make edits
7. User can archive (ArchivedContext), delete to trash (DeletedContext), or permanently delete (ProposalsContext.permanentlyDelete)

**Modal State Management:**

- ProposalModalContext holds: `isOpen`, `modalProposal`, `toast`
- Used for both proposal CRUD and global toast notifications
- Modal opens/closes via context methods, not route changes
- Toast auto-dismisses after 3 seconds

**Sidebar Injection Pattern:**

- SidebarContext allows pages to override default Sidebar with custom content
- ProposalDetail injects ProposalContentsSidebar on mount, clears on unmount
- Layout component uses `sidebarNode ?? <Sidebar />` to render custom or default sidebar

## Key Abstractions

**Proposal:**
- Purpose: Core domain object representing a sales/clinical proposal
- Examples: `src/types/proposal.ts`, `src/context/ProposalsContext.tsx`
- Pattern: Immutable record with CRUD operations (create, read, update, permanentlyDelete)
- Fields: id, title, client, studyType, therapeuticArea, status, dueDate, value, createdAt, indication, description

**Draft Section:**
- Purpose: Hierarchical content structure for AI-generated proposal text
- Examples: `src/types/draft.ts`, `src/data/proposalDraftData.ts`
- Pattern: Union type allowing sections with subsections, blocks of different kinds (paragraph, bullet list, table)
- Rich content: Text segments can have annotations linking back to source documents (RFP, kick-off, template)

**Suggestion/Command:**
- Purpose: Represents a pending AI suggestion in the proposal draft
- Examples: `src/types/draft.ts` (PendingSuggestion), `src/data/demoCommands.ts` (COMMAND_MAP)
- Pattern: Command object with targetId, explanation, preview, and acceptance status
- Used in: AIChatPanel suggests changes, ProposalDraftRenderer renders suggestions with accept/decline

**Lifecycle Managers:**
- ArchivedContext: Tracks archived proposal IDs (soft delete to archive view)
- DeletedContext: Tracks deleted proposal IDs with deletion timestamp, 30-day grace period
- Distinction: Archive = temporarily hidden but recoverable; Delete = trash state; Permanently Delete = gone forever

## Entry Points

**App Root:**
- Location: `src/main.tsx`
- Triggers: Browser load
- Responsibilities: Initializes React 19, mounts DOM root

**App Component:**
- Location: `src/App.tsx`
- Triggers: React initialization
- Responsibilities: Wraps all Context Providers in order (SidebarProvider → ProposalsProvider → DeletedProvider → ArchivedProvider → ProposalModalProvider), sets up BrowserRouter with routes, renders global toast

**Routes:**
- `/ ` → Dashboard.tsx (priority focus, KPIs, pipeline summary)
- `/proposals` → ProposalsList.tsx (filterable table with active/archived/deleted views)
- `/proposals/:id` → ProposalDetail.tsx (full proposal with AI generation and chat panel)
- `/settings` → Settings.tsx (integrations, general, notifications tabs)

## Error Handling

**Strategy:** Try-catch for optional data, graceful fallbacks for missing state

**Patterns:**
- Missing proposal in detail view: Shows "Proposal not found" message with back link
- Failed sessionStorage access in ProposalDetail: Silent catch, continues without persistence
- Invalid JSON in sessionStorage: Defaults to empty object for overrides/drafts
- Context not provided: Throws error with helpful message (e.g., "useProposals must be used within ProposalsProvider")

## Cross-Cutting Concerns

**Logging:** console.log used in demo commands (demoCommands.ts), no centralized logger

**Validation:**
- ProposalEditorModal validates required fields before save (title, value, dueDate)
- Number inputs have min=0 constraint
- Date inputs use native HTML5 validation

**Authentication:** Not implemented (demo app)

**Navigation:**
- React Router NavLink with isActive state for sidebar highlighting
- useNavigate hook for programmatic navigation
- useParams for route parameter extraction in ProposalDetail

**Styling:**
- Global index.css with Tailwind base utilities
- Jamo custom colors via Tailwind config (jamo-50 through jamo-600)
- Consistent spacing scale (px-6, py-4, gap-5, etc.)
- Focus states on inputs via focus:ring-2 focus:ring-jamo-200

---

*Architecture analysis: 2026-03-03*
