---
phase: 13-dashboard-proposal-lifecycle
reviewed: 2026-05-07T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/types/proposal.ts
  - src/data/proposals.json
  - src/components/StatusSelector.tsx
  - src/context/ProposalsContext.tsx
  - src/pages/Dashboard.tsx
  - src/pages/ProposalsList.tsx
  - src/pages/ProposalDetail.tsx
  - supabase/migrations/20260507000029_rename_in_review_to_in_progress.sql
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-07
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 13 introduces the `in_progress` status (renaming from `in_review`), a reworked Dashboard with Priority Focus and Pipeline widgets, and an enhanced ProposalsList with archived/deleted tab views. The migration and type definitions are clean. The primary concerns are: an unhandled async error in `permanentlyDelete` + `purgeFromTrash` called together without coordination, a dead `'Duplicate'` action button that silently does nothing, a `formatDate` call on potentially empty `dueDate` strings that produces "Invalid Date" in the UI, and a stale-closure risk in the auto-generate `useEffect`. No security issues were found.

---

## Warnings

### WR-01: `permanentlyDelete` + `purgeFromTrash` called without error handling — UI can desync on DB failure

**File:** `src/pages/ProposalsList.tsx:471-474`

**Issue:** The "Delete Forever" confirm button calls both `permanentlyDelete(id)` (async Supabase DELETE) and `purgeFromTrash(id)` (local state mutation) in sequence, but neither is awaited and there is no try/catch. If the Supabase call fails, the local `deletedProposals` state is purged anyway, so the row disappears from the UI while the record still exists in the database. On next page load the row reappears, confusing the user.

**Fix:**
```tsx
onClick={async () => {
  try {
    await permanentlyDelete(permanentDeleteTarget.id)
    purgeFromTrash(permanentDeleteTarget.id)
    showToast('Proposal permanently deleted')
  } catch {
    showToast('Delete failed — please try again')
  } finally {
    setPermanentDeleteTarget(null)
  }
}}
```

---

### WR-02: `'Duplicate'` action is rendered but never handled — click is a silent no-op

**File:** `src/pages/ProposalsList.tsx:162` and `src/pages/Dashboard.tsx:247`

**Issue:** `rowActions` includes `'Duplicate'` for active proposals, and the Dashboard Priority Focus list also renders a `'Duplicate'` button. Neither click handler has a branch for the `'Duplicate'` action — the `if/else if` chain falls through without doing anything. Users will click it and nothing will happen.

**Fix:** Either implement duplication, or remove `'Duplicate'` from both `rowActions` and the Dashboard action list until the feature is ready:

```ts
// ProposalsList.tsx line 162
const rowActions =
  view === 'archived' ? ['Edit', 'Restore'] :
  view === 'deleted'  ? ['Restore', 'Permanently Delete'] :
  ['Edit', 'Archive']   // remove 'Duplicate' until implemented

// Dashboard.tsx line 247
{['Edit', 'Archive'].map(action => (   // remove 'Duplicate'
```

---

### WR-03: `formatDate('')` renders "Invalid Date" when `dueDate` is an empty string

**File:** `src/pages/ProposalsList.tsx:49`, `src/pages/Dashboard.tsx:29`, `src/pages/ProposalDetail.tsx:45`

**Issue:** `ProposalDetail.formatDate` guards against falsy values (returns `'—'`), but the versions in `ProposalsList` and `Dashboard` do not. The `dueDate` field defaults to `''` in `mapRow`, so a proposal without a due date will render "Invalid Date" in the urgency/due-date cells of both pages.

**Fix:** Apply the same guard used in `ProposalDetail` to the shared helpers in `ProposalsList` and `Dashboard`:

```ts
function formatDate(s: string) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
```

---

### WR-04: Auto-generate `useEffect` captures `buildProposalInput` via closure but lists it in no dependency array — stale input risk

**File:** `src/pages/ProposalDetail.tsx:395-402`

**Issue:** The auto-generate effect reads `proposal` and calls `buildProposalInput()` (which itself reads `proposal` via closure), but `buildProposalInput` is declared as a plain `function` inside the component after the early-return guard. The effect's dep array only lists `[proposal, searchParams]`, which is correct for the trigger condition, but the function is redeclared on every render so it is technically a new reference each time. More importantly, the `// eslint-disable-next-line` suppression on line 401 hides that the linter would have caught `generateAll` and `genState` missing from deps. If `generateAll` changes identity (e.g. after a hook reset) the effect won't re-run, and `genState.isGenerating` / `genState.completedCount` are read from a potentially stale closure snapshot.

**Fix:** Extract `buildProposalInput` into a `useCallback` with its actual dependencies, and remove the eslint-disable suppression:

```ts
const buildProposalInput = useCallback((): GenerateSectionPayloadV2['proposalContext'] => {
  const meta: { services?: string[]; regions?: string[] } = (() => {
    try { return JSON.parse(proposal?.description ?? '{}') } catch { return {} }
  })()
  return {
    studyInfo: {
      sponsorName: proposal?.client ?? '',
      therapeuticArea: proposal?.therapeuticArea ?? '',
      indication: proposal?.indication ?? '',
      studyPhase: proposal?.studyType ?? '',
      countries: meta.regions ?? [],
      dueDate: proposal?.dueDate ?? '',
      services: meta.services ?? [],
    },
    assumptions: [],
    services: meta.services ?? [],
  }
}, [proposal])
```

Then update the auto-generate effect dependency array: `[proposal, searchParams, buildProposalInput, generateAll, genState.isGenerating, genState.completedCount]`.

---

## Info

### IN-01: Duplicated `mapRow` function — defined in both `ProposalsContext` and `ProposalsList`

**File:** `src/pages/ProposalsList.tsx:13-29` and `src/context/ProposalsContext.tsx:9-25`

**Issue:** `mapRow` is copy-pasted verbatim between the context and the list page. Any future DB column rename must be updated in two places.

**Fix:** Export `mapRow` from `ProposalsContext.tsx` (or a shared `src/lib/proposals.ts` mapper) and import it in `ProposalsList.tsx`.

---

### IN-02: `(p as any).selected_template_id` type assertion used in `ProposalsList` — field already on the type

**File:** `src/pages/ProposalsList.tsx:87`, `337`, `339`

**Issue:** `selected_template_id` is declared on the `Proposal` interface in `src/types/proposal.ts`, so the `as any` casts are unnecessary and suppress TypeScript's type checking on those accesses.

**Fix:** Remove the casts and access `p.selected_template_id` directly.

---

### IN-03: `getStats` in `Dashboard.tsx` counts `won` proposals as "active"

**File:** `src/pages/Dashboard.tsx:60-63`

**Issue:** `getStats` defines "active" as `status !== 'lost'`, which means `won` proposals are included in the "Active Proposals" KPI card count. This is likely intentional (won proposals are still in the pipeline value), but the label "across all stages" may mislead users who expect active to exclude terminal outcomes. Worth confirming the intent.

**Fix:** If `won` should be excluded: `proposals.filter(p => p.status !== 'lost' && p.status !== 'won')`. If intentional, add an inline comment clarifying the definition.

---

_Reviewed: 2026-05-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
