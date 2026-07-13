# Phase 13: Dashboard & Proposal Lifecycle — Pattern Map

**Mapped:** 2026-05-07
**Files analyzed:** 6 (5 modified + 1 new)
**Analogs found:** 6 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/components/StatusSelector.tsx` | component | event-driven | `src/components/StatusBadge.tsx` | role-match |
| `src/types/proposal.ts` | type | — | self (in-place rename) | exact |
| `src/context/ProposalsContext.tsx` | context/service | CRUD | `src/context/ArchivedContext.tsx` | role-match |
| `src/pages/Dashboard.tsx` | page | request-response | self (hardcoded → live) | exact |
| `src/pages/ProposalsList.tsx` | page | CRUD | self (in-memory filter → Supabase) | exact |
| `src/pages/ProposalDetail.tsx` | page | request-response | `src/pages/ProposalDetail.tsx` (header area) | exact |

---

## Pattern Assignments

### `src/components/StatusSelector.tsx` (component, event-driven) — NEW

**Analog:** `src/components/StatusBadge.tsx` (lines 1–23) and inline badge+action patterns in `src/pages/Dashboard.tsx` (lines 256–276) and `src/pages/ProposalsList.tsx` (lines 328–333)

**Imports pattern** (from StatusBadge.tsx lines 1–1 + ProposalsList.tsx lines 1–8):
```typescript
import { useState, useRef, useEffect } from 'react'
import type { ProposalStatus } from '../types/proposal'
```

**Config map pattern** (Dashboard.tsx lines 19–33 — extract these to the shared component):
```typescript
const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft:       'Draft',
  in_progress: 'In Progress',   // renamed from in_review
  submitted:   'Submitted',
  won:         'Won',
  lost:        'Lost',
}

const STATUS_COLORS: Record<ProposalStatus, string> = {
  draft:       'bg-gray-100 text-gray-600',
  in_progress: 'bg-amber-100 text-amber-700',
  submitted:   'bg-blue-100 text-blue-700',
  won:         'bg-green-100 text-green-700',
  lost:        'bg-red-100 text-red-600',
}
```

**Compact badge variant pattern** (ProposalsList.tsx lines 328–333 — the existing inline badge that becomes the dropdown trigger):
```typescript
<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
  {STATUS_LABELS[p.status]}
</span>
```

**Confirmation dialog pattern** (ProposalsList.tsx lines 388–438 — modal for destructive actions; reuse the same fixed-overlay + white card pattern for won/lost confirmation):
```typescript
<div
  className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
  onClick={() => setConfirmTarget(null)}
>
  <div
    className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-5"
    onClick={e => e.stopPropagation()}
  >
    {/* icon + heading + body */}
    <div className="flex items-center justify-end gap-2 pt-1">
      <button onClick={() => setConfirmTarget(null)} className="...">Cancel</button>
      <button onClick={handleConfirm} className="...">Confirm</button>
    </div>
  </div>
</div>
```

**Dropdown close-on-outside-click pattern** (ProposalDetail.tsx lines 81–88):
```typescript
useEffect(() => {
  if (!open) return
  const handler = (e: MouseEvent) => {
    if (!ref.current?.contains(e.target as Node)) setOpen(false)
  }
  document.addEventListener('mousedown', handler)
  return () => document.removeEventListener('mousedown', handler)
}, [open])
```

**Component signature to implement:**
```typescript
interface StatusSelectorProps {
  status: ProposalStatus
  onChange: (next: ProposalStatus) => Promise<void>
  variant: 'compact' | 'labeled'
  disabled?: boolean
}
export function StatusSelector({ status, onChange, variant, disabled }: StatusSelectorProps) { ... }
```

---

### `src/types/proposal.ts` (type, rename)

**Current line 1 (exact text to change):**
```typescript
export type ProposalStatus = 'draft' | 'in_review' | 'submitted' | 'won' | 'lost'
```

**Target (line 1 after rename):**
```typescript
export type ProposalStatus = 'draft' | 'in_progress' | 'submitted' | 'won' | 'lost'
```

No other changes to this file. All downstream references (`STATUS_LABELS`, `STATUS_COLORS`, filter arrays, conditionals) must be swept in the same commit.

---

### `src/context/ProposalsContext.tsx` (context, CRUD) — add `updateStatus`

**Analog:** `src/context/ArchivedContext.tsx` `archive()` function (lines 34–41) — same Supabase `.update().eq('id', id)` + optimistic local state pattern.

**Existing `updateProposal` pattern to wrap** (ProposalsContext.tsx lines 97–116):
```typescript
async function updateProposal(
  id: string,
  data: Partial<Omit<Proposal, 'id' | 'createdAt'>>
): Promise<void> {
  const updateData: Record<string, unknown> = {}
  if (data.status !== undefined) updateData.status = data.status
  // ...
  const { error } = await supabase.from('proposals').update(updateData).eq('id', id)
  if (error) throw new Error(error.message)
  setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
}
```

**New `updateStatus` thin wrapper to add** (modelled on ArchivedContext.tsx lines 34–41):
```typescript
async function updateStatus(id: string, status: ProposalStatus): Promise<void> {
  return updateProposal(id, { status })
}
```

**Context interface addition** (ProposalsContext.tsx lines 26–33 — add to `ProposalsContextValue`):
```typescript
updateStatus: (id: string, status: ProposalStatus) => Promise<void>
```

**Usage_events query pattern** (new, no existing analog — use Supabase `.from().select().eq().gte()` chain matching ProposalsContext.tsx line 52–65 style):
```typescript
const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
supabase
  .from('usage_events')
  .select('id, event_type')
  .eq('org_id', profile.org_id)
  .gte('created_at', startOfMonth)
  .then(({ data, error }) => { ... })
```

---

### `src/pages/Dashboard.tsx` (page, request-response) — remove demo constants, add generation metrics KPI

**Constants to remove entirely** (lines 8–48):
```typescript
// DELETE these:
const DEMO_NOW = new Date('2026-02-26T12:00:00')   // line 8
const WIN_RATE  = 0.67                              // line 9
const LAST_ACTIVITY: Record<string, string> = { ... } // lines 37–48
```

**Replace `DEMO_NOW` with real time** — change every reference `DEMO_NOW` → `new Date()`. Two occurrences: `getUrgencyTag()` (line 72) and `isUrgent()` (line 83).

**Win Rate KPI card to replace** (Dashboard.tsx lines 186–189):
```typescript
// BEFORE (Win Rate card):
<StatCard
  label="Win Rate"
  value={`${stats.winRate}%`}
  sub="of decided proposals"
  accent="text-green-600"
/>

// AFTER (Generated this month card):
<StatCard
  label="Generated This Month"
  value={String(generatedCount)}
  sub={`${aiCallCount} AI calls made`}
  accent="text-purple-600"
/>
```

**Pipeline Value card — remove demo labels** (lines 193–199):
```typescript
// BEFORE:
<StatCard
  ...
  source="Data source: Salesforce Production Environment"
  weighted={`Weighted: ${formatCurrency(stats.weighted)}`}
  weightedBadge="via Workday"
/>

// AFTER:
<StatCard
  label="Pipeline Value"
  value={formatCurrency(stats.pipeline)}
  sub="excl. lost proposals"
  accent="text-blue-600"
/>
```

**`StatCard` props to remove** — remove `source`, `weighted`, `weightedBadge` props and their JSX from the `StatCard` sub-component (lines 100–124) if unused after Pipeline Value cleanup, or leave them in as optional (they are already `?` typed).

**Last Activity column in Priority Focus rows** (lines 248–251) — replace `LAST_ACTIVITY[p.id]` lookup with `p.updatedAt` formatted as relative time. The field needs to be added to the `Proposal` type and mapped in `mapRow` from `updated_at`.

---

### `src/pages/ProposalsList.tsx` (page, CRUD) — Supabase-backed archived/deleted tabs

**Remove** (line 10):
```typescript
const DEMO_NOW = new Date('2026-02-26T12:00:00')   // DELETE
```

**Replace `DEMO_NOW`** in `getUrgencyTag()` (line 51) → `new Date()`.

**Current in-memory filter pattern to replace** (lines 112–116):
```typescript
// CURRENT (in-memory from ID sets — replace this):
const viewProposals = proposals.filter(p => {
  if (view === 'deleted')  return deletedIds.has(p.id) && isWithin30Days(new Date(deletedAt[p.id]))
  if (view === 'archived') return archivedIds.has(p.id) && !deletedIds.has(p.id)
  return !archivedIds.has(p.id) && !deletedIds.has(p.id)
})
```

**Target pattern** — per D-20/D-21/D-22, replace with direct Supabase queries using the same chain pattern as ProposalsContext.tsx lines 52–65:
```typescript
// Archived query (D-21):
supabase.from('proposals').select('*').eq('is_archived', true).is('deleted_at', null)

// Deleted query (D-22):
supabase.from('proposals').select('*').is('deleted_at', null).not()  // deleted_at IS NOT NULL
// i.e.: .not('deleted_at', 'is', null)

// Active query (unchanged — already from ProposalsContext):
// proposals from useProposals() = is_archived false AND deleted_at null
```

**Status filter rename** (lines 12–26, 29–36) — update `in_review` → `in_progress` key and label in `STATUS_LABELS`, `STATUS_COLORS`, and `STATUS_FILTER_OPTIONS`.

**Inline status badge location** (lines 328–333) — this is where `<StatusSelector variant="compact" />` replaces the static `<span>` after the component is built:
```typescript
// BEFORE:
<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[p.status]}`}>
  {STATUS_LABELS[p.status]}
</span>

// AFTER:
<StatusSelector
  status={p.status}
  onChange={(next) => updateStatus(p.id, next)}
  variant="compact"
/>
```

---

### `src/pages/ProposalDetail.tsx` (page, request-response) — labeled StatusSelector in header

**Header area analog** (ProposalDetail.tsx lines 38–52 — existing STATUS_LABELS / STATUS_COLORS; same rename applies):
```typescript
const STATUS_LABELS: Record<ProposalStatus, string> = {
  draft:       'Draft',
  in_review:   'In Review',   // → in_progress: 'In Progress'
  submitted:   'Submitted',
  won:         'Won',
  lost:        'Lost',
}
```

**Labeled variant placement** — the header/toolbar area (find via Grep for "STATUS_LABELS" usage in JSX in this file). The labeled `StatusSelector` replaces whichever static status badge currently appears in the proposal header toolbar. Pattern:
```typescript
<StatusSelector
  status={proposal.status}
  onChange={(next) => updateStatus(proposal.id, next)}
  variant="labeled"
/>
```

**Context consumption pattern** (ProposalDetail.tsx line 13):
```typescript
import { useProposals } from '../context/ProposalsContext'
// destructure: const { updateStatus } = useProposals()
```

---

## Shared Patterns

### Supabase Write + Optimistic Update
**Source:** `src/context/ProposalsContext.tsx` lines 97–116 (`updateProposal`)
**Apply to:** `updateStatus` in ProposalsContext, archived/deleted tab queries in ProposalsList
```typescript
const { error } = await supabase.from('proposals').update(updateData).eq('id', id)
if (error) throw new Error(error.message)
setProposals((prev) => prev.map((p) => (p.id === id ? { ...p, ...data } : p)))
```

### Supabase Read with Auth Guard
**Source:** `src/context/ProposalsContext.tsx` lines 43–66 and `src/context/ArchivedContext.tsx` lines 18–32
**Apply to:** archived/deleted tab queries, usage_events query
```typescript
if (!session) { setState(empty); return }
supabase.from('table').select('*').eq('col', val).then(({ data, error }) => { ... })
```

### Confirmation Modal (Destructive Actions)
**Source:** `src/pages/ProposalsList.tsx` lines 388–438 (permanent delete modal)
**Apply to:** `StatusSelector` won/lost confirmation step
- Fixed overlay: `fixed inset-0 bg-black/40 backdrop-blur-sm z-50`
- Card: `bg-white rounded-2xl shadow-2xl w-full max-w-md p-6`
- Backdrop click closes: `onClick={() => setConfirmTarget(null)}`
- `stopPropagation()` on card to prevent close

### Status Config Constants (Shared Location)
**Source:** Duplicated in Dashboard.tsx (lines 19–33), ProposalsList.tsx (lines 12–26), ProposalDetail.tsx (lines 38–52)
**Apply to:** Extract `STATUS_LABELS` and `STATUS_COLORS` into `src/components/StatusSelector.tsx` and import from there in all three pages. Eliminates triple-maintenance of the same map.

### Toast Feedback
**Source:** `src/pages/ProposalsList.tsx` lines 354–356 (`showToast(...)`)
**Apply to:** Status change confirmation — call `showToast('Status updated')` after successful `updateStatus` write.
```typescript
const { showToast } = useProposalModal()
// after successful updateStatus:
showToast('Status updated to Submitted')
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `supabase/migrations/[new].sql` | migration | — | No prior enum rename migration; planner should follow Postgres `ALTER TYPE ... RENAME VALUE` syntax |

---

## Metadata

**Analog search scope:** `src/components/`, `src/pages/`, `src/context/`, `src/types/`
**Files read:** 7 source files
**Pattern extraction date:** 2026-05-07
