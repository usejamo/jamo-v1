# Proposal Wizard: Drug Discovery phase + "Other" freetext options

**Date:** 2026-09-10
**Status:** Approved
**Component:** `src/components/wizard/Step1StudyInfo.tsx`, `cro-proposal-generator.js`

## Problem

Step 1 of the proposal creation wizard (`Study Info`) has two required dropdowns —
**Study Phase** and **Therapeutic Area** — both backed by fixed option lists
(`STUDY_PHASES`, `THERAPEUTIC_AREAS` in `cro-proposal-generator.js`). Two gaps:

1. There's no option for **drug discovery** (pre-clinical) work — only clinical
   phases (Phase I–IV, bioequivalence, observational, expanded access) are listed.
2. Neither dropdown has an escape hatch for a phase/area that isn't in the list at
   all. Users are stuck picking the closest wrong option.

Both fields are not cosmetic: they're interpolated directly into the generation
prompt (`supabase/functions/generate-proposal-section/promptAssembly.ts:164,299,303`
— `**Study Phase:** ${studyInfo.studyPhase}`, `**Therapeutic Area:**
${studyInfo.therapeuticArea}`) and persisted to the `proposals` table (`study_phase`,
`therapeutic_area` — plain `TEXT` columns, no enum/check constraint) via
`createProposal()` in `ProposalCreationWizard.tsx`. Whatever ends up in
`studyInfo.studyPhase` / `studyInfo.therapeuticArea` is what the sponsor's proposal
is actually generated and stored with.

## Requirements

1. Add `'Drug Discovery'` to the Study Phase dropdown, ordered **before** `Phase I
   (First-in-Human)` (reads chronologically: discovery precedes clinical phases).
2. Add an `'Other'` option to **both** Study Phase and Therapeutic Area dropdowns.
   Selecting it reveals a freetext input; whatever the user types becomes the
   actual field value used in generation and storage — not the literal string
   `"Other"`.
3. No change to required-field validation semantics: both fields stay required,
   whether satisfied by a preset option or custom text.
4. Must survive the wizard's existing `sessionStorage` persistence
   (`ProposalCreationWizard.tsx` serializes the whole `WizardState` on every change
   and restores it on remount) — reloading mid-draft, or navigating away and back,
   must not lose "Other" mode or the typed text.

## Approach

**Derived local UI state — no `WizardState` / reducer / type / DB changes.**

Considered adding explicit `therapeuticAreaOther` / `studyPhaseOther` booleans (plus
custom-text fields) to `StudyInfo`/`WizardState`, wired through new reducer actions
and a `stateVersion` bump. Rejected: it adds reducer, type, and persistence surface
for a fact ("is this field in custom mode") that the component can already
recompute for free by checking membership in the known list. Nothing outside
`Step1StudyInfo` needs to know custom text was used — the resolved string is
indistinguishable, by design, from a preset value once dispatched.

Instead, `Step1StudyInfo` keeps one `useState<boolean>` per field:

- **Init:** `true` if the persisted `studyInfo.studyPhase` (or `therapeuticArea`) is
  non-empty and *not* found in `STUDY_PHASES` (or `THERAPEUTIC_AREAS`). This is what
  makes reload/back-navigation work — the flag is re-derived from whatever string
  is already sitting in `studyInfo`, no extra serialized state needed.
- **Select's displayed `value`:** `'Other'` when the flag is true, else the real
  `studyInfo` value.
- **On selecting `'Other'`:** set the flag true, dispatch `''` to clear the field
  (so the existing required-field validation forces the user to actually type
  something before `Next` succeeds).
- **On selecting any real option:** set the flag false, dispatch normally (existing
  behavior, unchanged).
- **While the flag is true:** render a text `<input>` directly below the `<select>`,
  styled like the existing `Indication` input, bound straight to
  `studyInfo.studyPhase` / `studyInfo.therapeuticArea` (dispatches on every
  keystroke via the existing `handleTextChange`), placeholder "Enter study phase" /
  "Enter therapeutic area".

### Data changes

- `cro-proposal-generator.js`: prepend `'Drug Discovery'` to `STUDY_PHASES`.
- No changes to `THERAPEUTIC_AREAS` contents (only the `<select>` gains an `Other`
  `<option>`).

### Out of scope

- No conditional logic elsewhere in the wizard based on "Drug Discovery" being
  selected (e.g. hiding clinical-only fields). Not requested; would be scope creep.
- No normalization/dedup of custom text (e.g. two users typing "CNS" vs
  "Neurology" stay as distinct free strings) — matches how every other free-text
  field in this form already behaves (`indication`, `sponsorName`).
- No character limit on the custom text beyond what the existing text inputs allow
  (none).

## Testing

- `Step1StudyInfo` (component/unit level, likely a new or extended test file
  alongside the existing wizard tests):
  - Study Phase select lists `Drug Discovery` first, before `Phase I`.
  - Both selects list `Other` as the last option.
  - Selecting `Other` reveals the freetext input and clears the field's value
    (Next is blocked until text is entered).
  - Typing custom text updates `studyInfo.studyPhase` / `therapeuticArea` directly
    (verify via dispatched action / resulting state), not a literal `"Other"`.
  - Re-mounting with a `studyInfo` value that isn't in the known list (simulating
    session restore) shows the select as `Other` with the freetext pre-filled.
- `ProposalCreationWizard.test.tsx`: extend/verify existing wizard-level tests still
  pass if they assert on dropdown option counts/contents.
