---
phase: 07
phase_name: proposal-generation-engine
status: draft
created: 2026-03-24
tool: none
registry: none
---

# UI-SPEC — Phase 07: Proposal Generation Engine

> Visual and interaction contract for the streaming proposal generation UI.
> Consumed by gsd-planner, gsd-executor, gsd-ui-checker, and gsd-ui-auditor.

---

## 1. Design System

| Property | Value | Source |
|----------|-------|--------|
| Tool | None (custom Tailwind v4 `@theme`) | `src/index.css` detected |
| CSS framework | Tailwind CSS v4 (`@import "tailwindcss"`) | `src/index.css` |
| Component library | None — hand-rolled components | Codebase scan |
| shadcn | Not initialized | `components.json` absent |
| Registry | None | Not applicable |
| Icon approach | Inline SVG (heroicons-style paths, no icon package) | `ProposalDraftRenderer.tsx`, `Sidebar.tsx` |
| Animation library | `framer-motion` (already installed, used in `ProposalDraftRenderer.tsx`) | `ProposalDraftRenderer.tsx` |

---

## 2. Color Contract

**Source:** `src/index.css` `@theme` block + existing component patterns.

### 60 / 30 / 10 Split

| Role | Token / Value | Usage |
|------|--------------|-------|
| 60% dominant surface | `#F9FAFB` (body bg) + `white` (card surfaces) | Page background, section stream cards |
| 30% secondary | `gray-50` (#F9FAFB), `gray-100`, `gray-200` | Card borders, dividers, sidebar, nav |
| 10% accent | `jamo-500` (#E8524A) / `jamo-600` (#D43E36) | Primary CTA "Generate Proposal" button, active nav item, progress ring fill |

### Semantic Colors (reserved use only)

| Color | Token | Reserved For |
|-------|-------|-------------|
| Accent | `jamo-500` / `jamo-600` | "Generate Proposal" CTA, wave progress indicator fill |
| Accent tint | `jamo-50` (#FEF2F1) | Active section highlight in nav, active wave badge background |
| Success | `green-100` / `green-600` | Section status: `complete` badge, approved assumption carry-over |
| Warning | `amber-50` / `amber-600` | `needs_review` section status, `[PLACEHOLDER: ...]` inline highlight |
| Destructive | `red-100` / `red-600` | Section status: `error` badge, retry state |
| Generating | `blue-50` / `blue-600` | Section status: `generating...` badge (active streaming) |
| Queued | `gray-100` / `gray-500` | Section status: `queued` badge (waiting to start) |

**Accent rule:** `jamo-*` is reserved strictly for the primary CTA and the wave/progress indicator. Do not use it for status badges, hover states, or informational elements.

---

## 3. Typography

**Source:** `src/index.css` `--font-sans: 'Inter'` + observed sizes in existing components.

### Font Family

All text: `font-sans` → `'Inter', system-ui, -apple-system, sans-serif`

### Type Scale (4 sizes only)

| Role | Size | Weight | Line Height | Tailwind class |
|------|------|--------|-------------|---------------|
| Page heading | 20px | 700 (bold) | 1.2 | `text-xl font-bold` |
| Section title | 16px | 700 (bold) | 1.2 | `text-base font-bold` |
| Body / stream text | 14px | 400 (regular) | 1.5 | `text-sm` |
| Label / badge / meta | 12px | 600 (semibold) or 400 | 1.4 | `text-xs font-semibold` or `text-xs` |

**Rule:** Use exactly these 4 sizes. Do not introduce 13px, 15px, 18px, or any non-listed size.

### Font Weights

Two weights only:
- **400 regular** — body text, stream content, secondary labels
- **700 bold** — section titles, page headings, CTA button labels

`font-semibold` (600) is permitted only for badge labels and navigation active states (matches existing patterns in `Sidebar.tsx`, `ProposalDraftRenderer.tsx`).

---

## 4. Spacing Scale

**8-point grid. Multiples of 4px only.**

| Step | px | Tailwind | Use |
|------|----|----------|-----|
| 1 | 4px | `p-1` / `gap-1` | Inline badge padding, icon gap |
| 2 | 8px | `p-2` / `gap-2` | Button padding (compact), icon-to-label gap |
| 3 | 12px | `p-3` / `gap-3` | Card inner padding (compact), list item spacing |
| 4 | 16px | `p-4` / `gap-4` | Card inner padding (standard), section gap |
| 6 | 24px | `p-6` / `gap-6` | Panel padding, section card vertical margin |
| 8 | 32px | `p-8` / `gap-8` | Between wave groups |
| 12 | 48px | `mb-12` | Bottom of generation panel |

**Touch targets:** All interactive controls (Regenerate, tone selector, retry) must be minimum 44px tall. Use `min-h-[44px]` on icon-only buttons.

---

## 5. Layout

**Source:** REQUIREMENTS.md REQ-4.x, CONTEXT.md D-03/D-04, existing `ProposalDraftRenderer.tsx` layout pattern.

### Generation View (Phase 7 scope)

Phase 7 extends `ProposalDraftRenderer` inside `ProposalDetail`. The generation view is a **single-column scrollable list of section stream cards**, displayed where the draft renderer currently lives.

```
ProposalDetail
└── ProposalDraftRenderer (extended)
    ├── GenerationHeader          — "Generating proposal…" title + wave progress indicator
    ├── GenerationControls        — Tone selector (formal/regulatory/persuasive) + "Generate All" CTA
    └── SectionStreamCard × 9    — One card per section, stacked vertically
        ├── SectionTitle          — section_name + wave badge
        ├── StatusBadge           — queued / generating... / waiting for body sections / complete / error
        ├── LiveTextArea          — monospace streaming text buffer (visible while generating)
        └── SectionActions        — "Regenerate" button (shown only when status === complete or error)
```

**No left nav during generation** — the existing `DraftNav` sidebar is hidden (`hideNav={true}`) while generation is in progress. It reappears after all sections reach `complete`.

**Wave grouping:** Section cards are grouped visually into three waves with a subtle `text-xs text-gray-400` wave label above each group:
- "Wave 1 — Foundation" (1 card)
- "Wave 2 — Body sections" (6 cards in a 2-column grid on `md:` screens, single column on mobile)
- "Wave 3 — Summary" (2 cards)

Wave 2 cards render side-by-side at `md:grid-cols-2` to communicate parallelism. Wave 1 and Wave 3 are full-width.

---

## 6. Component Inventory

### New Components (Phase 7)

| Component | Path | Purpose |
|-----------|------|---------|
| `SectionStreamCard` | `src/components/SectionStreamCard.tsx` | Per-section streaming display card |
| `GenerationHeader` | `src/components/GenerationHeader.tsx` | Title + wave progress ring/bar |
| `GenerationControls` | `src/components/GenerationControls.tsx` | Tone selector + "Generate All" CTA |
| `StatusBadge` | `src/components/StatusBadge.tsx` | Reusable status pill (queued/generating/waiting/complete/error) |

### Extended Components (Phase 7)

| Component | Change |
|-----------|--------|
| `src/components/ProposalDraftRenderer.tsx` | Add streaming card layout mode. Controlled by `mode: 'streaming' | 'review'` prop. Does NOT break existing review mode. |

### New Hook

| Hook | Path | Purpose |
|------|------|---------|
| `useProposalGeneration` | `src/hooks/useProposalGeneration.ts` | Client orchestrator: wave logic, anchor management, SSE reading, Realtime subscription |

### New Types

| File | Exports |
|------|---------|
| `src/types/generation.ts` | `SectionStatus`, `GenerationState`, `WaveNumber`, `ToneOption` |

---

## 7. Section Stream Card — Visual Spec

### Card Container

```
border border-gray-200 rounded-lg bg-white p-4 mb-4
transition-shadow duration-200
```

### Status Badge Colors

| Status | Background | Text | Border |
|--------|-----------|------|--------|
| `queued` | `bg-gray-100` | `text-gray-500` | none |
| `generating` | `bg-blue-50` | `text-blue-600` | none |
| `waiting` | `bg-gray-100` | `text-gray-500` | none |
| `complete` | `bg-green-100` | `text-green-600` | none |
| `error` | `bg-red-100` | `text-red-600` | none |

Badge class: `px-2 py-1 text-xs font-semibold rounded-full`

### Live Text Area

While streaming (`status === 'generating'`):
- Element: `<div>` (NOT `<textarea>` — read-only)
- Class: `font-mono text-sm text-gray-700 leading-relaxed whitespace-pre-wrap bg-gray-50 rounded-md p-3 mt-3 min-h-[80px] max-h-[400px] overflow-y-auto`
- Cursor: animated blinking `|` appended to live text via CSS `after:content-['|'] after:animate-pulse`

When `status === 'complete'`:
- Switch from `font-mono bg-gray-50` to `font-sans bg-white` — text snaps to final presentation style
- Remove cursor

When `status === 'error'`:
- Show error message in `text-sm text-red-600` below the card title
- Show "Retry" button: `text-sm text-red-600 underline hover:no-underline`

### Placeholder Highlight

`[PLACEHOLDER: ...]` text in streamed content is highlighted amber:
- Wrap in `<mark className="bg-amber-100 text-amber-800 rounded px-0.5">` during post-stream render pass
- Applied when `status === 'complete'` on the final text display

### Wave Badge

Shown in top-right of each card:
- Wave 1: `bg-jamo-50 text-jamo-600 text-xs font-semibold px-2 py-0.5 rounded-full` "Wave 1"
- Wave 2: `bg-blue-50 text-blue-600 text-xs font-semibold px-2 py-0.5 rounded-full` "Wave 2"
- Wave 3: `bg-purple-50 text-purple-600 text-xs font-semibold px-2 py-0.5 rounded-full` "Wave 3"

---

## 8. Generation Header — Visual Spec

```
<div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-100">
  <div>
    <h2 className="text-xl font-bold text-gray-900">Generating Proposal</h2>
    <p className="text-sm text-gray-500 mt-1">{completedCount} of {totalCount} sections complete</p>
  </div>
  <WaveProgressIndicator />
</div>
```

**Wave Progress Indicator:** Three numbered circles (1, 2, 3), connected by a horizontal line.
- Inactive wave: `w-8 h-8 rounded-full border-2 border-gray-200 text-gray-400 text-xs font-bold`
- Active wave: `w-8 h-8 rounded-full bg-jamo-500 text-white text-xs font-bold`
- Complete wave: `w-8 h-8 rounded-full bg-green-500 text-white text-xs font-bold` with checkmark SVG inside
- Connector line: `h-0.5 w-8 bg-gray-200` (turns `bg-green-300` when wave completes)

---

## 9. Generation Controls — Visual Spec

Positioned directly below `GenerationHeader`, above the section cards.

```
<div className="flex items-center gap-3 mb-6">
  <ToneSelector />
  <div className="flex-1" />
  <GenerateAllButton />
</div>
```

### Tone Selector

Three-button toggle group (not a `<select>`):

```
<div className="flex rounded-lg border border-gray-200 overflow-hidden">
  {['formal', 'regulatory', 'persuasive'].map(tone => (
    <button
      className={`px-3 py-2 text-sm font-medium transition-colors ${
        selected === tone
          ? 'bg-jamo-500 text-white'
          : 'bg-white text-gray-600 hover:bg-gray-50'
      }`}
    >
      {tone.charAt(0).toUpperCase() + tone.slice(1)}
    </button>
  ))}
</div>
```

Default selected tone: `formal`

### "Generate Proposal" CTA Button

```
<button className="px-6 py-2.5 bg-jamo-500 hover:bg-jamo-600 text-white text-sm font-bold rounded-lg transition-colors min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed">
  Generate Proposal
</button>
```

- Disabled when generation is already in progress (`isGenerating === true`)
- While generating: label changes to "Generating…" with a `animate-spin` spinner SVG prepended

---

## 10. Copywriting Contract

### Primary CTA

| Element | Copy |
|---------|------|
| Generate all sections | "Generate Proposal" |
| Regenerate one section | "Regenerate" |
| Retry failed section | "Retry" |

### Status Labels

| Status | Label |
|--------|-------|
| `queued` | "Queued" |
| `generating` | "Generating…" |
| `waiting` (Wave 3 before Wave 2 done) | "Waiting for body sections" |
| `complete` | "Complete" |
| `error` | "Generation failed" |

### Empty / Initial State

When the user lands on the generation tab before pressing "Generate Proposal":
- Header: "Ready to generate"
- Sub-copy: "Review your tone selection, then click Generate Proposal to begin."
- All section cards show status "Queued" with no live text area visible.

### Error State (per section card)

- Primary: "Generation failed — {section_name} could not be completed."
- Secondary: "This may be a temporary issue. Click Retry to try again."
- Destructive action copy: No destructive actions in Phase 7. Regeneration is non-destructive (uses `upsert`).

### Progress Copy

- During Wave 1: "Generating foundation section…"
- During Wave 2: "Generating body sections in parallel…"
- During Wave 3: "Generating summary sections…"
- All complete: "{totalCount} sections complete. Review your proposal below."

### Placeholder Marker Display

`[PLACEHOLDER: ...]` text is preserved verbatim in output and visually highlighted amber. No copy changes to the marker text itself — it is a locked output contract from the prompt system (REQ-4.10).

---

## 11. Interaction Contracts

### Generate All Flow

1. User selects tone (default: formal)
2. User clicks "Generate Proposal"
3. Button immediately disables + spinner appears
4. Wave 1 card transitions from `queued` to `generating` — live text begins appearing
5. Wave 2 cards remain `queued` during Wave 1
6. Wave 1 completes — Wave 2 cards transition simultaneously to `generating`
7. Wave 3 cards show `waiting for body sections` during Wave 2
8. Wave 2 completes — Wave 3 cards transition to `generating`
9. Wave 3 completes — header updates to "N sections complete", DraftNav reappears
10. Generate button re-enables with label "Regenerate All"

### Regenerate Single Section

1. User clicks "Regenerate" on a `complete` or `error` card
2. Card transitions back to `generating` status immediately (optimistic)
3. Live text area clears and begins refilling from SSE stream
4. On completion, card snaps back to `complete` with new content

### Stream → Snap Transition

- While `generating`: `font-mono bg-gray-50` text area with blinking cursor
- On `complete`: crossfade (150ms `opacity` transition) to `font-sans bg-white` presentation display
- Placeholder markers highlighted amber in the final display pass

### Error Recovery

1. Section stream closes abnormally (network error or Anthropic error)
2. Card transitions to `error` state
3. Error message and "Retry" button appear
4. Client waits up to 10 seconds after SSE close for Realtime `complete` confirmation
5. If no Realtime event within 10 seconds, card transitions to `error` (Pitfall 4 from RESEARCH.md)

### Keyboard / Accessibility

- Tone selector buttons: `role="group"` on wrapper, each `<button>` focusable, `aria-pressed={selected === tone}`
- Status badges: `role="status"` with `aria-live="polite"` on the wrapper `<div>` so screen readers announce status changes
- Generate button: standard `<button>` with `aria-busy={isGenerating}` when generating
- Section cards: `aria-label="{section_name} — {status}"` on card container

---

## 12. Animation Contract

| Element | Animation | Duration | Library |
|---------|-----------|----------|---------|
| Card status change (queued → generating) | `opacity` fade: 0→1 | 150ms ease | CSS transition |
| Live text cursor | `animate-pulse` (Tailwind) | 1s infinite | Tailwind |
| Stream → snap transition | `opacity` crossfade | 150ms ease | CSS transition |
| Wave progress circle activate | `scale` 0.9→1 + `opacity` 0→1 | 200ms ease | framer-motion (already installed) |
| Error state entrance | `opacity` 0→1, `y` 4→0 | 180ms ease | framer-motion |

**Rule:** Do not introduce new animation libraries. framer-motion is already installed (`ProposalDraftRenderer.tsx`). Use Tailwind transitions for simple state changes; framer-motion only for entrance/exit animations.

---

## 13. Responsive Breakpoints

| Viewport | Wave 2 grid | Controls layout |
|----------|-------------|-----------------|
| Mobile (`< md`) | Single column | Tone selector + CTA stack vertically |
| Desktop (`md:`) | `grid-cols-2` | Tone selector left, CTA right (flex row) |

Wave 1 and Wave 3 are always full-width regardless of breakpoint.

---

## 14. Pre-Population Sources

| Field | Pre-populated From | Value |
|-------|--------------------|-------|
| Font family | `src/index.css` | Inter |
| Color accent | `src/index.css` `@theme` | `jamo-500` #E8524A |
| Color scale | `src/index.css` `@theme` | Full `jamo-*` 50–900 scale |
| Body background | `src/index.css` `body` | #F9FAFB |
| Body text color | `src/index.css` `body` | #1F2937 |
| Section card patterns | `ProposalDraftRenderer.tsx`, `Step3AssumptionReview.tsx` | `border rounded-lg p-3/p-4`, status badge pattern |
| Nav active state | `Sidebar.tsx` | `bg-jamo-50 text-jamo-600` |
| Sidebar width | `Sidebar.tsx` | `w-64` |
| Icon approach | All components | Inline SVG only |
| Animation library | `ProposalDraftRenderer.tsx` | framer-motion |
| Section title style | `ProposalDraftRenderer.tsx` | `text-base font-bold text-gray-900` |
| Body text style | `ProposalDraftRenderer.tsx` `RenderBlock` | `text-sm text-gray-700 leading-relaxed` |
| Status badge pattern | `Step3AssumptionReview.tsx` | `px-2 py-1 text-xs rounded-full bg-{color}-100 text-{color}-600` |
| Wave concept | CONTEXT.md D-01 | Three-wave: foundation / parallel body / summary |
| Streaming card spec | CONTEXT.md D-03 | queued / generating / waiting / complete states |
| No TipTap | CONTEXT.md D-04 | Plain div/pre elements only — TipTap is Phase 8 |
| Tone options | CONTEXT.md D-07 | formal / regulatory / persuasive |

---

## 15. Out of Scope (Phase 7)

- TipTap rich text editor blocks (Phase 8)
- Section lock/unlock toggle (Phase 8)
- Version history (Phase 8)
- AI chat panel (Phase 9)
- DOCX export (Phase 10)
- Any Jamo logo animation or aurora effect in the generation UI (reserved for AI chat panel)

---

*Phase: 07-proposal-generation-engine*
*UI-SPEC drafted: 2026-03-24*
*Status: draft — awaiting gsd-ui-checker validation*
