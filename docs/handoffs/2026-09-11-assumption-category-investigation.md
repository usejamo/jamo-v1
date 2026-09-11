# Assumption `category` — is it load-bearing? (investigation, 2026-09-11)

Todo #3 "Assumption type selector" from `.planning/todos/pending/2026-09-10-ui-ux-bug-batch.md`.

## Verdict

**Load-bearing on the model, not on the code.** Neither of the two branches in the
brief is cleanly correct — it is not display-only, but nothing in the code branches
on it either.

### Nothing branches on it

All 10 non-test read sites of `.category`, categorised:

| Site | Role |
|---|---|
| `Step2DocumentUpload.tsx:90,108` | pass-through (edge fn → state → DB) |
| `ProposalCreationWizard.tsx:95` | pass-through (state → DB) |
| `useProposalGeneration.ts:242` | pass-through (DB → generation request) |
| `Step3AssumptionReview.tsx:70` | display (uppercase label) |
| `demo-capture-fixture/index.ts:326` | fixture copy |
| `demo-run-start/index.ts:407` | fixture copy, invents `'general'` |
| `useDemoRun.ts:172` | invents `'scope'` |
| `promptAssembly.ts:177`, `:306` | **interpolated into the LLM prompt** |

No grouping, no ordering, no filtering, no retrieval keying, no conditionals.

### But it reaches the model verbatim

`supabase/functions/generate-proposal-section/promptAssembly.ts:177` and `:306`:

```ts
const assumptionsList = assumptions.map((a) => `- [${a.category}] ${a.content}`).join('\n')
sections.push(`## EXTRACTED ASSUMPTIONS\n${assumptionsList}`)
```

So every assumption is presented to the model as `- [scope] <content>` under an
`## EXTRACTED ASSUMPTIONS` heading. The category is an uninstructed semantic tag:
the system prompt never defines the taxonomy or says what to do with the tags.
Blast radius is therefore "a wrong word in the prompt", not "wrong code path".

## Four disagreeing taxonomies — and the migration comment is wrong

| Source | Allowed set |
|---|---|
| `20260305000008_proposal_assumptions.sql:5` (comment) | sponsor_metadata, scope, timeline, budget, **missing** |
| `extract-assumptions/index.ts:186` (the actual producer) | sponsor_metadata, scope, timeline, budget, **criteria** |
| `src/types/wizard.ts:27` (comment) | sponsor_metadata, scope, timeline, budget, **criteria** |
| `demo-run-start/index.ts:407` (fallback) | **general** |

Live production (950 rows, service-role query 2026-09-11):

```
scope             464  48.8%
timeline          196  20.6%
criteria          120  12.6%
budget            100  10.5%
sponsor_metadata   70   7.4%
```

`missing` — the value the migration documents — has **never existed**. `general`
has never existed. `criteria`, 12.6% of production, is absent from the migration
comment. The column is bare `TEXT NOT NULL` with no CHECK and no enum.

## The mislabelled rows are exactly identifiable

`ProposalCreationWizard.tsx:99` sets `user_edited: a.source === 'user-provided'`,
and `source: 'user-provided'` is set **only** by `ADD_ASSUMPTION` and `FILL_MISSING`
(`wizardReducer.ts:54,69`) — the same two sites that hardcode `category: 'scope'`.

So `user_edited = true` ⟺ user-added. Live: **34 rows, 100% `scope`, 0 user-added
rows carry any other category.** That is the bug reproduced in production data.

Caveat: the fingerprint identifies the wrong rows but cannot infer the right value.
A backfill cannot know that a given row should have been `timeline`.

## Larger bug found next door: FILL_MISSING discards the field name

The 34 user-added rows' contents are bare values:

```
2500 · 2500 · 2500 · 2500 · 10,000 · 5% · 12,500 · 10,999
```

`Step3AssumptionReview.tsx:144` dispatches `{ field: field.field, value: ... }`.
`wizardReducer.ts:66-75` uses `field` only to mark `missingFields[].filledValue`
and stores `content: action.value` — **the field name never reaches `content`**.

The model therefore receives `- [scope] 2500` with no indication that 2500 is
target enrollment. The lost field name is a worse defect than the wrong category,
and it is fixable with certainty (`field.field` / `field.description` are both in
hand at the dispatch site), unlike the category backfill.

## Incidental: duplicate rows

Two write paths — `Step2DocumentUpload.tsx:114` inserts `pending`,
`ProposalCreationWizard.tsx:90` upserts `approved` **with no `onConflict` target**,
so it inserts rather than updates. Live: 316 duplicate `(proposal_id, content)`
groups covering 648 of 950 rows; signatures `approved+pending` ×302,
`approved+approved(+pending)` ×14. `fetchAssumptions` filters to `approved`, so
~14 groups currently emit duplicated prompt lines. Out of scope for this todo, but
it decides *which row* a category edit must write to.

## Method / limits

Code trace + live service-role query against production `proposal_assumptions`.
The bug is confirmed empirically in live data (34/34 user-added rows are `scope`);
I did not additionally click through the running app.
