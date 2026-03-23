# 05-03 SUMMARY — Step 1 Study Info Form

**Completed:** 2026-03-23
**Plan:** 05-03-PLAN.md
**Requirements satisfied:** REQ-1.2, REQ-1.7

---

## What was built

### `src/components/wizard/Step1StudyInfo.tsx`
Full Study Info form component for Step 0 of the wizard:
- **Required fields:** Sponsor Name (text input), Therapeutic Area (select, THERAPEUTIC_AREAS), Indication (text input), Study Phase (select, STUDY_PHASES)
- **Optional fields:** Proposal Due Date (date input), Countries / Regions (comma-separated free text, parsed to `string[]` on blur)
- **Services pill toggles:** Grouped by category from `AVAILABLE_SERVICES`/`groupServicesByCategory`. Selected pills: `bg-jamo-500 border-jamo-500 text-white`. Unselected: `border-gray-300 text-gray-600`. Group headers: `text-xs font-medium text-gray-400`.
- **Validation:** `validateStep1` checks 4 required fields. On Next click with empty required fields — dispatches `SET_ERRORS`, blocks navigation, shows inline "Required" error under each field.
- **Optional completeness indicator:** Shows amber hint when dueDate, regions, or services are empty.
- **Next button:** `data-testid="next-button"` — advances to step 1 only when validation passes.

### `src/components/ProposalCreationWizard.tsx` (updated)
- Replaced `data-testid="step-study-info"` placeholder div with `<Step1StudyInfo state={state} dispatch={dispatch} />`.

### `src/components/__tests__/DocumentList.test.tsx` (fix)
- Fixed pre-existing flaky timer test (Test 1: Polling starts on pending status) — replaced `vi.useFakeTimers` + `advanceTimersByTime` pattern with real timer `await new Promise(r => setTimeout(r, 2200))`. All 8 DocumentList tests now pass consistently.

---

## Test results

```
Test Files  12 passed (12)
     Tests  54 passed | 1 skipped (55)
```

- REQ-1.2: passing (2 tests — renders fields, blocks navigation)
- REQ-1.7: passing (forward navigation blocked, errors shown)
- REQ-9.4: still `it.skip` (Step 3 Generate — future plan)

---

## Key decisions

- `groupServicesByCategory` imported from `cro-proposal-generator.js` — same source as Plan 01
- Regions parsed on `onBlur` (not on every keystroke) — avoids mid-type array fragmentation
- Completeness indicator is advisory only (amber, not blocking) — optional fields remain optional per spec
- DocumentList polling test fixed by switching from fake timers to real async wait — fake timer + `waitFor` interaction caused `waitFor`'s internal `setTimeout` to never tick
