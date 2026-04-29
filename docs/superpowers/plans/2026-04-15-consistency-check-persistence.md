# Consistency Check: One-Shot Auto-Trigger + Persist Results

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the cross-section consistency check auto-trigger only once per proposal (not on every reload), persist its results to the DB, add a manual "Run consistency check" button next to the Export button, and load persisted flags on mount so results survive page refreshes.

**Architecture:** Add two columns to the `proposals` table (`consistency_flags jsonb`, `consistency_check_ran boolean`) to track run state and persist results. Load both on mount in `SectionWorkspace`. Replace the in-memory `useRef` guard (which resets on every mount) with the DB-backed `consistency_check_ran` flag. Expose a `runConsistencyCheckRef` prop from `SectionWorkspace` so `ProposalDetail` can trigger a manual check from the button.

**Tech Stack:** React, TypeScript, Supabase (postgres + edge functions), TipTap, Framer Motion

---

## File Map

| File | Change |
|---|---|
| `supabase/migrations/YYYYMMDD_consistency_check_columns.sql` | Create — add 2 columns to `proposals` |
| `src/types/workspace.ts` | Modify — add `consistency_check_ran` to `WorkspaceState`, new actions |
| `src/context/SectionWorkspaceContext.tsx` | Modify — handle new reducer actions |
| `src/components/editor/SectionWorkspace.tsx` | Modify — load/persist flags, fix auto-trigger guard, wire ref |
| `src/pages/ProposalDetail.tsx` | Modify — add `consistencyCheckRef`, "Run consistency check" button |

---

### Task 1: DB Migration — Add consistency columns to proposals

**Files:**
- Create: `supabase/migrations/20260415000000_consistency_check_columns.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table proposals
  add column if not exists consistency_flags  jsonb    not null default '[]'::jsonb,
  add column if not exists consistency_check_ran boolean not null default false;
```

- [ ] **Step 2: Apply the migration**

Run: `npx supabase db push` (or `supabase migration up` if using local)

Expected: no error, columns visible in Supabase dashboard under `proposals`.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260415000000_consistency_check_columns.sql
git commit -m "feat: add consistency_flags + consistency_check_ran columns to proposals"
```

---

### Task 2: Update WorkspaceState types and reducer actions

**Files:**
- Modify: `src/types/workspace.ts`
- Modify: `src/context/SectionWorkspaceContext.tsx`

- [ ] **Step 1: Add `consistency_check_ran` to `WorkspaceState` and `DEFAULT_WORKSPACE_STATE`**

In `src/types/workspace.ts`, update `WorkspaceState`:

```ts
export interface WorkspaceState {
  sections: Record<string, SectionEditorState>
  active_section: string
  version_history_open: string | null
  consistency_flags: ConsistencyFlag[]
  consistency_dismissed: boolean
  consistency_check_ran: boolean   // ← new
}
```

Update `DEFAULT_WORKSPACE_STATE`:

```ts
export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  sections: {},
  active_section: '',
  version_history_open: null,
  consistency_flags: [],
  consistency_dismissed: false,
  consistency_check_ran: false,   // ← new
}
```

Add `SET_CONSISTENCY_CHECK_RAN` to `WorkspaceAction` union:

```ts
| { type: 'SET_CONSISTENCY_CHECK_RAN'; payload: boolean }
```

- [ ] **Step 2: Handle new action in reducer**

In `src/context/SectionWorkspaceContext.tsx`, add inside the `switch`:

```ts
case 'SET_CONSISTENCY_CHECK_RAN':
  return { ...state, consistency_check_ran: action.payload }
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/types/workspace.ts src/context/SectionWorkspaceContext.tsx
git commit -m "feat: add consistency_check_ran to workspace state"
```

---

### Task 3: SectionWorkspace — load persisted flags, fix auto-trigger, wire ref

**Files:**
- Modify: `src/components/editor/SectionWorkspace.tsx`

**Background:** The current bug is that `consistencyChecked` is a `useRef` initialized to `false` — it resets to `false` on every component mount. So every reload where all sections are `complete` re-fires the check. Replacing the guard with the DB-backed `state.consistency_check_ran` fixes this permanently.

- [ ] **Step 1: Add `consistencyCheckRef` prop to the component interface**

In `SectionWorkspaceProps`:

```ts
interface SectionWorkspaceProps {
  proposalId: string
  sections: Array<{...}>
  orgId: string
  editorRefsRef?: React.MutableRefObject<Map<string, SectionEditorHandle>>
  onActiveSectionChange?: (sectionKey: string | null) => void
  externalScrollRef?: React.RefObject<HTMLDivElement>
  consistencyCheckRef?: React.MutableRefObject<(() => void) | null>   // ← new
}
```

Update both `SectionWorkspaceInner` signature and the default export wrapper to accept and pass through this prop.

- [ ] **Step 2: Load persisted consistency data from DB on mount**

Remove the old `consistencyChecked` ref (line 34).

Add a `useEffect` that fires when `proposalId` changes, fetching `consistency_flags` and `consistency_check_ran` from the `proposals` table:

```ts
useEffect(() => {
  if (!proposalId) return
  supabase
    .from('proposals')
    .select('consistency_flags, consistency_check_ran')
    .eq('id', proposalId)
    .single()
    .then(({ data }) => {
      if (!data) return
      if (Array.isArray(data.consistency_flags) && data.consistency_flags.length > 0) {
        dispatch({
          type: 'SET_CONSISTENCY_FLAGS',
          payload: (data.consistency_flags as Array<{ message: string; sections_involved: string[] }>).map((f) => ({
            ...f,
            id: crypto.randomUUID(),
          })),
        })
      }
      if (data.consistency_check_ran) {
        dispatch({ type: 'SET_CONSISTENCY_CHECK_RAN', payload: true })
      }
    })
}, [proposalId])
```

- [ ] **Step 3: Extract the consistency check into a named callback**

Replace the current inline `useEffect` auto-trigger (lines 117–144) with a named `runConsistencyCheck` callback defined with `useCallback`, then call it from both the auto-trigger effect and the ref:

```ts
const runConsistencyCheck = useCallback(() => {
  const sectionInputs = Object.entries(state.sections).map(([key, s]) => ({
    section_key: key,
    content: s.content,
  }))
  dispatch({ type: 'SET_CONSISTENCY_CHECK_RAN', payload: true })
  // Optimistically persist ran=true so reloads don't re-trigger
  supabase.from('proposals').update({ consistency_check_ran: true }).eq('id', proposalId).then()

  supabase.functions
    .invoke('consistency-check', { body: { sections: sectionInputs } })
    .then(({ data }) => {
      const flags: ConsistencyFlag[] = (data?.flags ?? []).map(
        (f: { message: string; sections_involved: string[] }) => ({
          ...f,
          id: crypto.randomUUID(),
        })
      )
      dispatch({ type: 'SET_CONSISTENCY_FLAGS', payload: flags })
      // Persist results
      supabase
        .from('proposals')
        .update({ consistency_flags: data?.flags ?? [] })
        .eq('id', proposalId)
        .then()
    })
    .catch(() => {
      // Non-blocking
    })
}, [state.sections, proposalId, dispatch])
```

Note: import `ConsistencyFlag` at the top of the file from `../../types/workspace`.

- [ ] **Step 4: Update auto-trigger effect to use DB-backed guard**

Replace the old auto-trigger `useEffect` with:

```ts
useEffect(() => {
  const sectionValues = Object.values(state.sections)
  if (sectionValues.length === 0) return
  const allComplete = sectionValues.every((s) => s.status === 'complete')
  if (allComplete && !state.consistency_check_ran) {
    runConsistencyCheck()
  }
}, [state.sections, state.consistency_check_ran, runConsistencyCheck])
```

- [ ] **Step 5: Wire `consistencyCheckRef` so parent can call the check**

After the `runConsistencyCheck` `useCallback`, add:

```ts
useEffect(() => {
  if (consistencyCheckRef) {
    consistencyCheckRef.current = runConsistencyCheck
  }
  return () => {
    if (consistencyCheckRef) consistencyCheckRef.current = null
  }
}, [consistencyCheckRef, runConsistencyCheck])
```

- [ ] **Step 6: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/editor/SectionWorkspace.tsx
git commit -m "feat: persist consistency check results, fix one-shot auto-trigger, expose ref"
```

---

### Task 4: ProposalDetail — add "Run consistency check" button

**Files:**
- Modify: `src/pages/ProposalDetail.tsx`

The `ExportDropdown` renders at line 476. The new button goes to its right.

- [ ] **Step 1: Add `consistencyCheckRef` near the other refs**

In `ProposalDetail` component body, near `editorRefsMap`:

```ts
const consistencyCheckRef = useRef<(() => void) | null>(null)
```

- [ ] **Step 2: Add "Run consistency check" button next to Export**

Find the block at lines 468–478:

```tsx
{generated && !isStreamingMode && (
  <div className="flex items-center gap-2">
    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
      ...
    </span>
    <ExportDropdown />
  </div>
)}
```

Add the button after `<ExportDropdown />`:

```tsx
{generated && !isStreamingMode && (
  <div className="flex items-center gap-2">
    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
      </svg>
      Generated
    </span>
    <ExportDropdown />
    <button
      onClick={() => consistencyCheckRef.current?.()}
      className="text-sm font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm px-3 py-1.5 rounded-lg transition-colors"
    >
      Run consistency check
    </button>
  </div>
)}
```

- [ ] **Step 3: Pass `consistencyCheckRef` to `SectionWorkspace`**

In the `<SectionWorkspace ... />` JSX (around line 533), add:

```tsx
consistencyCheckRef={consistencyCheckRef}
```

- [ ] **Step 4: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/pages/ProposalDetail.tsx
git commit -m "feat: add Run consistency check button next to Export"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start dev server and open a proposal that already has all sections generated**

Navigate to the proposal. Verify:
- The consistency check banner does NOT auto-fire on load if it has already run before
- Previously saved flags appear in the banner immediately on load

- [ ] **Step 2: Click "Run consistency check"**

Verify:
- The check fires (can observe network request to `consistency-check` function)
- Flags appear in the banner
- On page refresh, flags are still shown (loaded from DB)

- [ ] **Step 3: Dismiss the banner, refresh**

Verify that dismissed state is session-only (banner reappears on refresh — this is intentional, flags are still valid info). If this is undesirable, note it for a follow-up.

- [ ] **Step 4: Open a brand-new proposal that hasn't had all sections completed yet**

Wait for all sections to reach `complete` status. Verify the check fires exactly once automatically. Refresh and verify it does NOT re-fire.
