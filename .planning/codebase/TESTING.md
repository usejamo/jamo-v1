# TESTING.md — Test Structure and Practices

## Current State

**No test infrastructure exists in this codebase.**

- No test framework installed (`package.json` has no Vitest, Jest, or Testing Library)
- No test files found (`*.test.ts`, `*.spec.ts`, `*.test.tsx`)
- No test configuration files (`vitest.config.*`, `jest.config.*`)
- No test scripts in `package.json`

This is a demo/prototype application without test coverage.

## Recommended Setup (if tests are added)

### Framework Choice

**Vitest + React Testing Library** — natural fit given the Vite build setup.

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/jest-dom jsdom
```

### Vite Config Update

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

### Setup File

```ts
// src/test/setup.ts
import '@testing-library/jest-dom'
```

### package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest run --coverage"
  }
}
```

## Recommended Test Structure

```
src/
├── components/
│   ├── ProposalEditorModal.tsx
│   └── __tests__/
│       └── ProposalEditorModal.test.tsx
├── context/
│   ├── ProposalsContext.tsx
│   └── __tests__/
│       └── ProposalsContext.test.tsx
└── pages/
    ├── Dashboard.tsx
    └── __tests__/
        └── Dashboard.test.tsx
```

Co-locate tests with source using `__tests__/` subdirectories.

## Priority Test Areas

Given the current application structure, these areas have highest value:

### 1. Context Providers (Core Business Logic)
- `ProposalsContext` — CRUD operations, state transitions
- `DeletedContext` — soft delete and restore flow
- `ArchivedContext` — archive and unarchive flow
- `ProposalModalContext` — modal open/close, toast lifecycle

### 2. ProposalEditorModal
- Create mode vs edit mode rendering
- Form validation
- Submit triggers context update

### 3. Proposal Lifecycle
- Create → view → edit → delete → restore → archive flow

## Testing Patterns for This Codebase

### Context Provider Testing

```tsx
import { renderHook, act } from '@testing-library/react'
import { ProposalsProvider, useProposals } from '../ProposalsContext'

function wrapper({ children }) {
  return <ProposalsProvider>{children}</ProposalsProvider>
}

test('adds a proposal', () => {
  const { result } = renderHook(() => useProposals(), { wrapper })
  act(() => {
    result.current.addProposal({ title: 'Test', status: 'draft' })
  })
  expect(result.current.proposals).toHaveLength(/* initial + 1 */)
})
```

### Component with Context

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

function renderWithProviders(ui) {
  return render(
    <ProposalsProvider>
      <ProposalModalProvider>
        {ui}
      </ProposalModalProvider>
    </ProposalsProvider>
  )
}
```

### Session Storage Mocking

Several components use `sessionStorage`. Mock it in tests:

```ts
beforeEach(() => {
  Object.defineProperty(window, 'sessionStorage', {
    value: {
      getItem: vi.fn(),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    writable: true,
  })
})
```

## Coverage Gaps (if tests are added)

| Area | Risk | Priority |
|------|------|---------|
| Draft state persistence (sessionStorage) | Data loss | High |
| Proposal CRUD via context | Core functionality | High |
| Trash/archive lifecycle | Business logic | High |
| AI suggestion acceptance | State mutation | Medium |
| Settings toggle persistence | UX correctness | Low |
| Dashboard urgency calculation | Display logic | Low |
