# Coding Conventions

**Analysis Date:** 2026-03-03

## Naming Patterns

**Files:**
- Components: PascalCase, single component per file (e.g., `Dashboard.tsx`, `Sidebar.tsx`, `ProposalEditorModal.tsx`)
- Context files: Use descriptive names with Context suffix (e.g., `ProposalsContext.tsx`, `ArchivedContext.tsx`)
- Page files: PascalCase in `src/pages/` (e.g., `Dashboard.tsx`, `ProposalsList.tsx`)
- Data files: camelCase or descriptive names (e.g., `demoCommands.ts`, `proposalDraftData.ts`)
- Type definition files: camelCase with `.d.ts` or `.ts` suffix (e.g., `proposal.ts`, `draft.ts`)

**Functions:**
- Regular functions and handlers: camelCase (e.g., `createProposal`, `updateProposal`, `handleSave`)
- React component functions: PascalCase (e.g., `Dashboard()`, `StatCard()`)
- Helper functions: camelCase, often prefixed with verbs (e.g., `formatCurrency()`, `isUrgent()`, `getUrgencyTag()`)
- Hooks: camelCase, prefixed with `use` (e.g., `useProposals()`, `useArchived()`, `useSidebar()`)

**Variables:**
- State variables: camelCase (e.g., `isOpen`, `modalProposal`, `archivedIds`)
- Constants: camelCase (e.g., `WIN_RATE`, `DEMO_NOW`) — all caps when truly constant globals
- Type/Interface instances: camelCase (e.g., `form`, `data`, `proposals`)

**Types:**
- Interfaces: PascalCase (e.g., `Proposal`, `ProposalStatus`, `ArchivedContextValue`)
- Type aliases: PascalCase (e.g., `ProposalStatus`, `Segment`, `ContentBlock`)
- React types: Use `React.FC` or destructured types (e.g., `{ children: ReactNode }`)

## Code Style

**Formatting:**
- Prettier: Not explicitly configured in `package.json` (check local editor config)
- Line length: No explicit limit observed; files use reasonable wrapping
- Indentation: 2 spaces (inferred from source files)
- Trailing commas: Used in objects/arrays when multi-line
- Semicolons: Included on statements

**Linting:**
- ESLint: Configured in `eslint.config.js`
- Config: Flat config format (ESLint 9.x)
- Base config: `@eslint/js` recommended
- React plugins: `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`
- Key rule: `no-unused-vars` with pattern `^[A-Z_]` to allow unused constants/components
- TypeScript strict mode enabled in `tsconfig.json` (strict: true)

## Import Organization

**Order:**
1. External dependencies (`react`, `react-router-dom`, `framer-motion`)
2. Type imports (prefixed with `type`)
3. Internal relative imports (from `../`, `./`)
4. Data/JSON imports

**Example from `src/pages/Dashboard.tsx`:**
```typescript
import { useNavigate } from 'react-router-dom'
import type { Proposal, ProposalStatus } from '../types/proposal'
import { useArchived } from '../context/ArchivedContext'
import { useProposals } from '../context/ProposalsContext'
import { useDeleted } from '../context/DeletedContext'
import { useProposalModal } from '../context/ProposalModalContext'
```

**Path Aliases:**
- Not observed in this codebase; relative imports are used throughout

## Error Handling

**Patterns:**
- Context hooks throw descriptive errors if used outside provider:
  ```typescript
  export function useProposals() {
    const ctx = useContext(ProposalsContext)
    if (!ctx) throw new Error('useProposals must be used within ProposalsProvider')
    return ctx
  }
  ```
- No try-catch blocks observed; error handling relies on React error boundaries (not yet implemented)
- Validation handled via conditional rendering and state checks
- Event handlers check conditions before executing (e.g., `if (!ctx) return` in event handlers)

## Logging

**Framework:** `console` object (implicit)

**Patterns:**
- No logging framework imported; console methods not used in source code
- Component props and state managed through React DevTools
- Event handlers use state updates rather than logging

## Comments

**When to Comment:**
- Comments are sparse; code is self-documenting
- Inline comments used for clarification of complex logic (e.g., `// Activity labels used for stale-activity urgency detection`)
- Section separators used for visual organization: `// ── Helpers ──────────────────────────────────────────────────────────────────`

**JSDoc/TSDoc:**
- Not used; type annotations handle documentation
- Interface/type definitions are explicit

## Function Design

**Size:**
- Functions range from 5-50 lines
- Larger functions include multiple sub-components (e.g., `Dashboard.tsx` with `StatCard` internal component)
- Helper functions kept under 15 lines typically

**Parameters:**
- Destructuring used extensively in function parameters: `function StatCard({ label, value, sub, accent, weighted }: {...})`
- Type annotations via interface destructuring patterns
- Optional fields use `?:` notation

**Return Values:**
- Functions return typed values (React components, strings, objects)
- No implicit `undefined` returns; explicit `return null` used in React components when conditional
- Handlers (onClick, onChange) return `void` implicitly

## Module Design

**Exports:**
- Named exports for utilities, types, and context hooks
- Default exports for page components and main components
- Context exports: Provider component and custom hook pair
  ```typescript
  export function ProposalsProvider({ children }: { children: ReactNode }) { ... }
  export function useProposals() { ... }
  ```

**Barrel Files:**
- Not used; direct imports from source files are standard
- Each context has its own file: `src/context/ProposalsContext.tsx`

## Tailwind CSS

**Patterns:**
- Extensive use of Tailwind utility classes
- Custom colors configured via theme: `bg-jamo-500`, `text-jamo-600`
- Responsive design using Tailwind breakpoints (e.g., `grid-cols-3`, `col-span-2`)
- Dark mode syntax available but not used in current codebase
- Class organization: layout → typography → colors → effects

**Common Classes:**
- Layout: `flex`, `grid`, `gap-X`, `p-X`, `space-y-X`
- Typography: `text-sm`, `font-medium`, `font-bold`, `text-gray-500`
- Colors: `bg-white`, `text-gray-900`, `border-gray-200`
- Effects: `rounded-xl`, `shadow-lg`, `transition-colors`

---

*Convention analysis: 2026-03-03*
