# Phase 6: AI Assumption Extraction - Research

**Researched:** 2026-03-23
**Domain:** Supabase Edge Functions (Deno), React wizard state, Claude API structured output, Tailwind UI patterns
**Confidence:** HIGH — all findings based on existing codebase inspection; no speculative library choices

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Extraction trigger:**
- When ALL `proposal_documents` for the proposal reach `parse_status === 'complete'`, immediately invoke `extract-assumptions` as fire-and-forget from Step 2
- This simultaneously unblocks the Step 2 "Next" button (which is disabled while any doc is `pending` or `extracting`)
- Step 3 renders assumption results when ready — no hard loading gate, but a lightweight spinner fallback for the edge case where the user navigates before extraction finishes
- Extraction does NOT re-trigger on subsequent Step 3 visits if assumptions already exist in WizardState

**Assumption card UX:**
- Controls: Approve (checkmark) and Reject (X) toggle buttons on each card. Clicking the value text makes it editable inline.
- Approved state: Green border
- Rejected state: Card stays visible, grayed out with strikethrough text — un-rejectable by clicking checkmark again
- Confidence badges: Three-tier — High (>=0.8, green), Medium (0.5–0.79, yellow), Low (<0.5, red). Matches StatusBadge pattern already in the codebase.
- Manual add: "+ Add assumption" button at the bottom of the list creates a blank card with category and value fields. User fills in and approves.

**Missing info presentation:**
- Layout: Separate "Warning: Missing Information (N)" section at the top of Step 3, styled amber/yellow, above the extracted assumptions list
- Fill-in UX: Each missing item has an inline text field labeled with the field name. User fills in and saves.
- On save: Filled missing items become approved assumption cards with `source: 'user-provided'`. Same table, same serialization path as AI-extracted assumptions.
- Skippable: No hard gate. Proceed ("Next") button shows an inline count badge when items remain unfilled: e.g., "Next (3 missing)". Unfilled items produce `[PLACEHOLDER: field_name]` markers at generation time (Phase 7 concern, but format established here).

**Wizard step expansion:**
- Step type: Expand `step: 0 | 1 | 2` to `step: 0 | 1 | 2 | 3`
  - 0 = Study Info, 1 = Document Upload, 2 = Assumption Review (new), 3 = Template & Generate
- WIZARD_STEPS constant: Add 'Assumption Review' between 'Document Upload' and 'Template & Generate'
- Skip to Fast Draft: Update dispatch target from `step: 2` to `step: 3`. Update button tooltip/helper text to reflect that both Upload and Assumption Review are bypassed. The Generation step's context indicator must show document count = 0 and assumption count = 0 when arriving via Fast Draft.
- Assumption state in sessionStorage: Add an `assumptions` array to `WizardState` (AI-extracted + user-added, with per-item status: approved/rejected/pending). SessionStorage persists automatically via existing `useEffect`. If user goes back to Step 2 and adds a document, re-entering Step 3 re-runs extraction and overwrites the assumptions array.

### Claude's Discretion

None specified — all key decisions were locked in the context discussion.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 6 adds a new Step 3 "Assumption Review" to the proposal creation wizard, inserting a structured Claude extraction pass between document upload and generation. The extraction runs as a Supabase Edge Function (`extract-assumptions`) that queries `document_extracts` for the proposal, sends them to the Anthropic API with a focused extraction prompt, and returns typed JSON. Results are reviewed and approved in a new `Step3AssumptionReview` component, then persisted to the existing `proposal_assumptions` table.

The codebase is well-prepared for this phase. The `proposal_assumptions` table already exists with the correct schema. The fire-and-forget `supabase.functions.invoke` pattern is already established in `FileUpload.tsx`. The `DocumentList` polling pattern (2s interval, stops when all docs complete) is the direct model for the extraction trigger. The existing `StatusBadge` component in `DocumentList.tsx` provides the confidence badge color pattern to replicate.

The primary implementation work is: (1) new `extract-assumptions` Edge Function, (2) new `Step3AssumptionReview` component, (3) wizard type/state expansion, and (4) wiring the trigger in `Step2DocumentUpload`. No new database migrations are needed.

**Primary recommendation:** Follow the `extract-document` edge function as the exact structural template for `extract-assumptions`. Follow the `DocumentList` polling completion detection as the model for triggering extraction. Replicate `StatusBadge` pill pattern for confidence badges.

---

## Standard Stack

### Core (all already in use — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase Edge Functions (Deno) | Existing | Host `extract-assumptions` | All AI calls go through Edge Functions (API key never in browser) |
| Anthropic Claude API | claude-haiku (per STATE.md) | Extraction pass | Haiku for extraction/anchors per active decision |
| `supabase.functions.invoke` | Existing JS client | Fire-and-forget trigger | Already used in FileUpload; same pattern |
| React `useReducer` + sessionStorage | Existing | Wizard state | Existing pattern in ProposalCreationWizard |
| Tailwind CSS | Existing | Assumption card UI | All UI uses Tailwind; jamo-500, green-*, yellow-*, red-*, amber-* |

### No new dependencies required

All implementation uses existing installed libraries. The edge function uses the Anthropic SDK pattern already established in Phase 4's `retrieve-context` function.

---

## Architecture Patterns

### Existing Edge Function Structure (extract-document/index.ts — direct template)

```typescript
// Pattern: serve() + CORS headers + createClient with service role key
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'supabase'

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  // ... service role client, fetch data, call AI, persist results
})
```

`extract-assumptions` follows this exact structure. Input: `{ proposalId: string }`. Fetch all `document_extracts` for that proposal, build prompt, call Anthropic, parse JSON, bulk-insert into `proposal_assumptions`.

### Extraction Trigger Pattern (from DocumentList.tsx polling)

```typescript
// In Step2DocumentUpload — after each upload completes, check if ALL docs are complete
const allComplete = documents.length > 0 && documents.every(d => d.parse_status === 'complete')
const hasAssumptions = state.assumptions && state.assumptions.length > 0

if (allComplete && !hasAssumptions && !extractionTriggered) {
  setExtractionTriggered(true)
  supabase.functions.invoke('extract-assumptions', {
    body: { proposalId: state.proposalId }
  }).catch(err => console.error('Failed to trigger extraction:', err))
  dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'extracting' })
}
```

The `extractionTriggered` local ref prevents double-firing. The `state.assumptions.length > 0` guard prevents re-triggering on Step 3 revisits.

### WizardState Extension

**Current state in `src/types/wizard.ts`:**
```typescript
export interface WizardState {
  step: 0 | 1 | 2           // 0=StudyInfo, 1=DocumentUpload, 2=Generate
  proposalId: string | null
  studyInfo: StudyInfo
  errors: Partial<Record<keyof StudyInfo, string>>
  submitting: boolean
}
```

**Required extensions for Phase 6:**
```typescript
export type AssumptionStatus = 'pending' | 'approved' | 'rejected'
export type ConfidenceLevel = 'high' | 'medium' | 'low'
export type ExtractionStatus = 'idle' | 'extracting' | 'complete' | 'error'

export interface WizardAssumption {
  id: string                    // temp UUID, replaced by DB id after save
  category: string              // 'sponsor_metadata'|'scope'|'timeline'|'budget'|'criteria'
  value: string                 // the assumption text (editable)
  confidence: ConfidenceLevel   // from AI or 'high' for user-provided
  source: string                // document filename or 'user-provided'
  status: AssumptionStatus
}

export interface MissingField {
  field: string                 // e.g. 'primary_endpoint'
  description: string           // e.g. 'Primary efficacy endpoint not specified'
  filledValue?: string          // set when user fills in the inline field
}

// WizardState additions:
// step: 0 | 1 | 2 | 3
// assumptions: WizardAssumption[]
// missingFields: MissingField[]
// extractionStatus: ExtractionStatus
```

### New Action Types for wizardReducer

```typescript
| { type: 'SET_STEP'; step: 0 | 1 | 2 | 3 }
| { type: 'SET_ASSUMPTIONS'; assumptions: WizardAssumption[]; missing: MissingField[] }
| { type: 'UPDATE_ASSUMPTION'; id: string; updates: Partial<WizardAssumption> }
| { type: 'ADD_ASSUMPTION' }
| { type: 'FILL_MISSING'; field: string; value: string }
| { type: 'SET_EXTRACTION_STATUS'; status: ExtractionStatus }
// SKIP_TO_GENERATE: update dispatch target from step: 2 to step: 3
```

### File Moves Required

| Current | New |
|---------|-----|
| `src/components/wizard/Step3Generate.tsx` | `src/components/wizard/Step4Generate.tsx` |
| (new) | `src/components/wizard/Step3AssumptionReview.tsx` |

All internal `dispatch({ type: 'SET_STEP', step: 2 })` calls in Step3Generate become `step: 3`. The `Back` button in Step4Generate navigates to `step: 2`.

### Assumption Card Component Structure

```typescript
// ConfidenceBadge — replicates StatusBadge pill pattern from DocumentList
function ConfidenceBadge({ level }: { level: ConfidenceLevel }) {
  if (level === 'high')
    return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-600">High</span>
  if (level === 'medium')
    return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-600">Medium</span>
  return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600">Low</span>
}

// AssumptionCard — approved=green border, rejected=gray+strikethrough
// Inline edit: click value text → contentEditable or input field, blur to save
// Approve/Reject: toggle buttons dispatch UPDATE_ASSUMPTION
```

### Edge Function: extract-assumptions Prompt Design

The extraction prompt must request structured JSON output. Claude haiku is reliable for JSON extraction when the schema is explicit in the prompt.

```typescript
const systemPrompt = `You are a clinical research assumption extractor.
Extract key assumptions from CRO proposal documents.
Return ONLY valid JSON matching this exact schema:
{
  "assumptions": [
    { "category": "sponsor_metadata|scope|timeline|budget|criteria", "value": "string", "confidence": 0.0-1.0, "source": "filename or 'inferred'" }
  ],
  "missing": [
    { "field": "snake_case_field_name", "description": "human readable description of what is missing" }
  ]
}`
```

Categories align with `proposal_assumptions.category` column values defined in the migration.

Confidence from AI (0.0–1.0 float) maps to badge tiers: >=0.8 → 'high', 0.5–0.79 → 'medium', <0.5 → 'low'.

### proposal_assumptions Table Schema (existing — no migration needed)

```sql
-- Already deployed: 20260305000008_proposal_assumptions.sql
CREATE TABLE proposal_assumptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id     UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  category        TEXT NOT NULL,
  content         TEXT NOT NULL,        -- maps to WizardAssumption.value
  confidence      TEXT NOT NULL DEFAULT 'medium',  -- 'high'|'medium'|'low'
  status          TEXT NOT NULL DEFAULT 'pending', -- 'pending'|'approved'|'rejected'|'edited'
  user_edited     BOOLEAN NOT NULL DEFAULT FALSE,
  source_document UUID REFERENCES proposal_documents(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Schema note:** The table uses `content` not `value`. The edge function and frontend must use `content` when reading/writing. `source_document` is a UUID FK — the edge function should resolve document filename to UUID when populating this field (or leave null for inferred assumptions).

The `missing` items from the AI response are NOT stored in `proposal_assumptions` — they live only in `WizardState.missingFields` until the user fills them in. Filled missing items are then stored as approved assumptions with `source: 'user-provided'` and `category: 'missing'`.

### Anti-Patterns to Avoid

- **Polling for extraction completion from Step 3:** The trigger fires from Step 2 when docs complete. Step 3 reads from `WizardState.assumptions` which is populated by the trigger callback. Do not add a separate Supabase poll in Step 3.
- **Blocking "Next" on extraction completion:** The decision is a spinner fallback only — user should not be hard-blocked if extraction is slow.
- **Re-triggering extraction on Step 3 revisit:** Guard with `state.assumptions.length > 0` before firing.
- **Storing `missing` fields as assumption rows before user fills them:** They are UI-only until user saves.
- **Using float confidence in the DB:** The `proposal_assumptions` table stores `'high'|'medium'|'low'` strings. Convert float from AI response at the edge function level before insertion.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Confidence badge styling | Custom badge component from scratch | Copy StatusBadge pattern from DocumentList.tsx exactly |
| Fire-and-forget invoke | Custom fetch to edge function | `supabase.functions.invoke()` — already proven in FileUpload |
| Inline text editing | Custom rich text system | Simple HTML `contentEditable` or controlled `<input>` on click |
| Extraction status tracking | Separate Supabase table/poll | WizardState.extractionStatus in sessionStorage |
| Missing field placeholder format | Custom format | `[PLACEHOLDER: field_name]` — established in REQUIREMENTS.md REQ-4.10 |

---

## Common Pitfalls

### Pitfall 1: Step number collisions after wizard expansion

**What goes wrong:** Existing tests hardcode `step: 2` as the Generate step. After expansion, step 2 is Assumption Review and step 3 is Generate.
**Why it happens:** `WizardState.step` is a literal union type; all dispatch calls with `step: 2` will need updating.
**How to avoid:** Update type first (`0 | 1 | 2 | 3`), then TypeScript compiler errors will identify every dispatch site. Check `ProposalCreationWizard.test.tsx` — tests pre-load `step: 2` to reach the Generate panel; update to `step: 3`.
**Warning signs:** Tests for REQ-9.4 render `step-generate` from sessionStorage `step: 2` — will fail silently if type union is updated but sessionStorage value is not.

### Pitfall 2: Double extraction trigger

**What goes wrong:** Extraction fires multiple times as documents transition to 'complete' one by one.
**Why it happens:** The DocumentList polling fires `fetchDocuments` every 2s. Each fetch could re-evaluate the "all complete" condition.
**How to avoid:** Use a `useRef` flag (`extractionFiredRef`) in Step2DocumentUpload — set it to true when fire-and-forget is called. Only fire when `!extractionFiredRef.current`.

### Pitfall 3: Claude JSON response not parseable

**What goes wrong:** Claude returns explanation text around the JSON, or uses trailing commas, causing `JSON.parse` to throw.
**Why it happens:** Even with explicit "return ONLY valid JSON" instructions, Claude occasionally wraps output.
**How to avoid:** In the edge function, use a regex to extract the JSON object from the response: `const match = response.match(/\{[\s\S]*\}/)`. Wrap in try/catch and return a graceful empty-assumptions response on parse failure rather than a 500 error.

### Pitfall 4: `proposal_assumptions` schema mismatch

**What goes wrong:** Edge function inserts `value` column but the table has `content`.
**Why it happens:** CONTEXT.md and REQUIREMENTS.md use `value` as the field name; the actual migration uses `content`.
**How to avoid:** Always use `content` when doing DB operations. In `WizardAssumption` interface, the frontend property can be named `value` for clarity, but the DB upsert must map `value -> content`.

### Pitfall 5: sessionStorage hydration with old WizardState shape

**What goes wrong:** A previously-stored sessionStorage entry (from Phase 5) has `step: 2` pointing at Generate. After Phase 6, step 2 is Assumption Review. User gets wrong step on hydration.
**Why it happens:** sessionStorage persists across deploys.
**How to avoid:** Add a version field to WizardState (e.g., `stateVersion: 6`). In `getInitialState()`, check version and return `DEFAULT_WIZARD_STATE` if version is outdated.

---

## Code Examples

### Fire-and-forget extraction trigger (Step2DocumentUpload)

```typescript
// Source: FileUpload.tsx lines 151-160 (existing pattern)
supabase.functions.invoke('extract-assumptions', {
  body: { proposalId: state.proposalId },
}).catch(err => {
  console.error('Failed to trigger extract-assumptions:', err)
  dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'error' })
})
dispatch({ type: 'SET_EXTRACTION_STATUS', status: 'extracting' })
```

### All-docs-complete detection (DocumentList.tsx polling — adapt for Step2)

```typescript
// Source: DocumentList.tsx lines 122-133 (existing pattern)
const hasActiveProcessing = documents.some(
  (doc) => doc.parse_status === 'pending' || doc.parse_status === 'extracting'
)
// Inverse: all complete when hasActiveProcessing is false AND documents.length > 0
const allComplete = documents.length > 0 && !hasActiveProcessing
```

### Confidence badge (replicate StatusBadge from DocumentList.tsx lines 28-57)

```typescript
// Source: DocumentList.tsx StatusBadge pattern
function ConfidenceBadge({ confidence }: { confidence: 'high' | 'medium' | 'low' }) {
  if (confidence === 'high')
    return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-600">High</span>
  if (confidence === 'medium')
    return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-600">Medium</span>
  return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-600">Low</span>
}
```

### Edge function bulk insert pattern

```typescript
// After parsing Claude JSON response
const rows = parsed.assumptions.map((a: any) => ({
  proposal_id: proposalId,
  org_id: orgId,
  category: a.category,
  content: a.value,
  confidence: a.confidence >= 0.8 ? 'high' : a.confidence >= 0.5 ? 'medium' : 'low',
  status: 'pending',
  source_document: null, // resolve if needed
}))

await supabase.from('proposal_assumptions').insert(rows)
```

### Next button with missing count badge

```typescript
// Step3AssumptionReview "Next" button
const unfilledCount = state.missingFields.filter(f => !f.filledValue).length

<button onClick={() => dispatch({ type: 'SET_STEP', step: 3 })}>
  {unfilledCount > 0 ? `Next (${unfilledCount} missing)` : 'Next'}
</button>
```

---

## Validation Architecture

`workflow.nyquist_validation` is not set to false in `.planning/config.json` — validation section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-3.1 | Edge function called when all docs complete | unit | `npm run test:run -- --reporter=verbose` | No — Wave 0 |
| REQ-3.2 | Extraction identifies sponsor/scope/timeline/budget/criteria/missing | unit | `npm run test:run` | No — Wave 0 |
| REQ-3.3 | Each assumption has high/medium/low confidence badge | unit | `npm run test:run` | No — Wave 0 |
| REQ-3.4 | Step 3 renders assumption cards | unit | `npm run test:run` | No — Wave 0 |
| REQ-3.5 | Edit/approve/reject/add controls function | unit | `npm run test:run` | No — Wave 0 |
| REQ-3.6 | Approved assumptions persist to proposal_assumptions | unit | `npm run test:run` | No — Wave 0 |
| REQ-3.7 | Missing fields shown in amber section with fill-in prompts | unit | `npm run test:run` | No — Wave 0 |
| REQ-1.1 | Wizard now shows 4 steps including Assumption Review | unit | `npm run test:run` | Update existing |

### Sampling Rate

- **Per task commit:** `npm run test:run`
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `src/components/__tests__/Step3AssumptionReview.test.tsx` — covers REQ-3.4, REQ-3.5, REQ-3.7
- [ ] `src/components/__tests__/AssumptionCard.test.tsx` — covers REQ-3.3, REQ-3.5 (approve/reject/edit)
- [ ] `supabase/functions/extract-assumptions/test.ts` — covers REQ-3.1, REQ-3.2 (Deno test, skip under Vitest via existing denoSpecifierStubPlugin)
- [ ] Update `ProposalCreationWizard.test.tsx` — REQ-1.1 now expects 4 steps; `step: 2` sessionStorage fixtures need updating to `step: 3` for Generate panel tests

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 3-step wizard (0/1/2) | 4-step wizard (0/1/2/3) | Phase 6 | All step dispatch literals +1 for Generate |
| No assumption state in WizardState | `assumptions`, `missingFields`, `extractionStatus` fields added | Phase 6 | sessionStorage schema versioning required |
| Step3Generate.tsx | Renamed Step4Generate.tsx | Phase 6 | Import paths update in ProposalCreationWizard |

---

## Open Questions

1. **Anthropic SDK import in Deno Edge Functions**
   - What we know: Phase 4's retrieve-context function uses the Anthropic API. Check how it imports the SDK.
   - What's unclear: Whether the existing edge functions use `npm:@anthropic-ai/sdk` or the HTTP API directly.
   - Recommendation: Check `supabase/functions/retrieve-context/index.ts` before writing `extract-assumptions`. Mirror the exact import pattern.

2. **RLS on proposal_assumptions for the edge function**
   - What we know: The edge function uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS.
   - What's unclear: Whether the frontend reads `proposal_assumptions` directly or only through WizardState.
   - Recommendation: For Phase 6, all DB reads/writes go through the edge function (service role). Frontend only reads from WizardState. No RLS issue for this phase.

3. **proposal_assumptions `source` field**
   - What we know: CONTEXT.md describes `source: 'user-provided'` for manually filled items. The DB table has `source_document UUID` (FK to documents), not a text source field.
   - What's unclear: Whether a text `source` column needs to be added for user-provided items.
   - Recommendation: Use `source_document = null` for user-provided items and infer source from `user_edited = true`. No migration needed. The WizardAssumption interface can have a `source: string` display field that is not persisted to DB directly.

---

## Sources

### Primary (HIGH confidence)

- `src/components/ProposalCreationWizard.tsx` — wizard reducer pattern, sessionStorage, step type
- `src/types/wizard.ts` — current WizardState shape
- `src/components/wizard/Step2DocumentUpload.tsx` — current Step 2 stub (minimal — needs full rebuild)
- `src/components/wizard/Step3Generate.tsx` — current Step 3 (becomes Step4Generate)
- `src/components/DocumentList.tsx` — StatusBadge pattern, polling pattern
- `src/components/FileUpload.tsx` — fire-and-forget invoke pattern
- `supabase/functions/extract-document/index.ts` — edge function structure template
- `supabase/migrations/20260305000008_proposal_assumptions.sql` — exact DB schema
- `src/components/__tests__/ProposalCreationWizard.test.tsx` — existing test patterns
- `.planning/STATE.md` — claude-haiku for extraction, all active decisions

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — REQ-3.1 through REQ-3.7, REQ-4.10 placeholder format
- `.planning/phases/06-ai-assumption-extraction/06-CONTEXT.md` — all locked decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing patterns confirmed in source
- Architecture: HIGH — direct codebase inspection of all integration points
- Pitfalls: HIGH — derived from specific schema/type mismatches found in code
- Validation: HIGH — existing test infrastructure confirmed, gaps enumerated

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (stable codebase, no fast-moving external dependencies)
