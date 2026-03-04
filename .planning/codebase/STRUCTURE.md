# STRUCTURE.md — Directory Layout and Organization

## Root Layout

```
jamo-v1/
├── public/                  # Static assets served as-is
├── src/                     # Application source code
│   ├── assets/              # Images, SVGs, fonts
│   ├── components/          # Shared/reusable UI components
│   ├── context/             # React Context providers and state
│   ├── data/                # Static JSON data and demo fixtures
│   ├── pages/               # Route-level page components
│   └── types/               # TypeScript type definitions
├── .planning/               # GSD planning documents
│   └── codebase/            # Codebase analysis documents
├── eslint.config.js         # ESLint flat config (v9)
├── package.json             # Dependencies and scripts
├── tsconfig.json            # TypeScript config
└── vite.config.js           # Vite build config
```

## Source Directory Detail

### `src/` — Root

| File | Purpose |
|------|---------|
| `main.tsx` | React DOM entry point, mounts `<App />` |
| `App.tsx` | Root component, context providers, router setup |
| `vite-env.d.ts` | Vite environment type declarations |

### `src/components/` — Shared UI Components

| File | Purpose |
|------|---------|
| `AIChatPanel.tsx` | AI chat/suggestion side panel |
| `Layout.tsx` | Shell layout with sidebar + `<Outlet />` |
| `ProposalContentsSidebar.tsx` | Proposal document section navigation |
| `ProposalDraftRenderer.tsx` | Renders structured draft blocks |
| `ProposalEditorModal.tsx` | Full CRUD modal for create/edit proposals |
| `RenderBlock.tsx` | Renders individual draft content blocks |
| `Sidebar.tsx` | Left navigation sidebar |
| `SuggestedChange.tsx` | AI-suggested diff/change display |

### `src/context/` — State Management

| File | Purpose |
|------|---------|
| `ArchivedContext.tsx` | Archived proposals state |
| `DeletedContext.tsx` | Soft-deleted (trash) proposals state |
| `ProposalModalContext.tsx` | Modal open/close state + toast notifications |
| `ProposalsContext.tsx` | Primary proposals CRUD state |
| `SidebarContext.tsx` | Sidebar collapse/expand state |

### `src/data/` — Static Data and Fixtures

| File | Purpose |
|------|---------|
| `demoCommands.ts` | Demo command/suggestion fixtures |
| `documents.json` | Document reference data |
| `proposalDraftData.ts` | Sample proposal draft content |
| `proposals.json` | Seed proposal data |

### `src/pages/` — Route-Level Pages

| File | Route | Purpose |
|------|-------|---------|
| `Dashboard.tsx` | `/` | Priority Focus dashboard |
| `ProposalsList.tsx` | `/proposals` | All proposals with filters |
| `ProposalDetail.tsx` | `/proposals/:id` | Single proposal view + AI chat |
| `Settings.tsx` | `/settings` | Integrations and settings |

### `src/types/` — TypeScript Types

| File | Purpose |
|------|---------|
| `assets.d.ts` | Asset module declarations (SVG, images) |
| `draft.ts` | Draft content block types |
| `proposal.ts` | Core Proposal interface |

## Naming Conventions

### Files
- **Components**: PascalCase (`ProposalEditorModal.tsx`)
- **Contexts**: PascalCase + `Context` suffix (`ProposalsContext.tsx`)
- **Pages**: PascalCase (`Dashboard.tsx`)
- **Data/types**: camelCase for `.ts`, lowercase for `.json`

### Directories
- All lowercase, short nouns (`components/`, `context/`, `pages/`, `types/`)

### Exports
- Components use default exports
- Contexts export both Provider and hook: `export { ProposalsProvider, useProposals }`

## Key Entry Points

| Entry | File | Purpose |
|-------|------|---------|
| Dev server | `vite.config.js` | Build and dev configuration |
| App mount | `src/main.tsx` | ReactDOM.createRoot |
| Route tree | `src/App.tsx` | React Router v7 route definitions |
| Global state | `src/App.tsx` | Context provider nesting order |

## Import Path Patterns

```tsx
// Relative imports from src root
import Dashboard from './pages/Dashboard'
import { useProposals } from './context/ProposalsContext'
import type { Proposal } from './types/proposal'
import proposalData from './data/proposals.json'
```

No path aliases configured — all imports are relative from file location.

## Context Provider Nesting Order (src/App.tsx)

```
SidebarProvider
  ProposalsProvider
    DeletedProvider
      ArchivedProvider
        ProposalModalProvider
          BrowserRouter
            Routes + Layout
          ProposalEditorModal (global modal)
          GlobalToast (global toast)
```

Outer providers have no dependencies on inner ones. `ProposalModalProvider` is innermost to allow modal + toast access from anywhere in the tree.
