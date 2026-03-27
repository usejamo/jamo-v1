# Phase 8: Section Workspace & Rich Text Editor — Research

**Researched:** 2026-03-26
**Domain:** TipTap v3 rich text editor, React 19, Supabase autosave, AI action streaming, version history, compliance checking
**Confidence:** HIGH (stack verified against npm registry and official docs)

---

## Summary

Phase 8 replaces the read-only `ProposalDraftRenderer` with a full TipTap-powered editing workspace. The core architectural constraint is that **all content mutations must go through TipTap's command API** (`insertContent`, `setContent`, `insertContentAt`) — never via direct DOM or document mutation. This is required for Cmd+Z to work correctly and for Phase 9 (chat panel) injection to be undoable.

The most critical discovery from research: **TipTap is now at v3.x (3.20.5 as of March 2026), not v2 as referenced in REQUIREMENTS.md and CONTEXT.md**. The requirements and context decisions were written when v2 was current. TipTap v3 is the correct target — it declares React 19 peer dependency support, its command API (`insertContent`, `setContent`) is unchanged, and the core integration pattern is identical. The "v2" references in locked decisions should be read as "TipTap" — the API contracts described (D-05, D-16) are stable across the v2→v3 boundary.

The second key finding: `proposal_section_versions` table **does not exist** in any migration. It must be created in Phase 8. Similarly, `last_saved_content` column does not exist on `proposal_sections` — that migration is also Phase 8 work. Both are Wave 0 schema tasks.

**Primary recommendation:** Install `@tiptap/react @tiptap/pm @tiptap/starter-kit` (all at v3.20.5). One TipTap editor instance per section block. Use `useEditor` hook with `immediatelyRender: false` (required for SSR-safe / React 19 hydration). Wire all AI actions and Phase 9 injection through `editor.commands.insertContent()` / `editor.commands.setContent()`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**AI Action Result UX**
- D-01: All per-section AI actions (Expand, Condense, Rewrite, Generate, Regenerate) stream into a preview area — editor content is never overwritten until the user explicitly accepts.
- D-02: A snapshot of the current section content is taken before the stream starts, stored as a pre-action version. This happens regardless of whether the user ultimately accepts or rejects.
- D-03: Expand / Condense — inline preview below/beside the section with Accept / Reject buttons.
- D-04: Rewrite — before/after diff view before committing. Rewrite is the most destructive action and intentionally carries the most friction.
- D-05: Accepted content must be injected via TipTap's command API (`insertContent` / `setContent` on the correct node). Never via direct document mutation. Required for Cmd+Z to work.
- D-06: Cmd+Z restores previous section content even after the user accepts an AI action.

**Version History**
- D-07: `proposal_section_versions` stores AI action snapshots only — pre-action state (before) and post-accept result (after). Not a general document version history. Do not snapshot manual edits here.
- D-08: Manual edits covered by: TipTap in-memory undo stack (Cmd+Z) + periodic autosave to `last_saved_content` column on `proposal_sections` row (single overwriting column, not a versions table).
- D-09: Version history UI is an overlay panel (fixed position, semi-transparent backdrop — not a layout-shifting drawer).
- D-10: Panel shows each version as a diff against the current live section content, not raw snapshot text. Label each entry with triggering action and timestamp.
- D-11: Restore follows the same accept flow as any AI action: snapshot pre-restore state first, inject via TipTap command API, undoable with Cmd+Z.

**Cross-Section Consistency Check (REQ-5.7)**
- D-12: Consistency check auto-triggers after full generation completes. No manual trigger needed.

**Compliance Flags (REQ-5.8)**
- D-13: Compliance flags triggered on accept (not on stream complete, not on generation complete).
- D-14: Two-pass approach on accept: (1) rule-based checks first (word count, required headings, `[PLACEHOLDER]` detection); (2) Haiku compliance call only if section passes basic rules. Returns `{ compliant: boolean, flags: string[] }`.
- D-15: Compliance flags render inline in the editor margin as user works through sections.

**Phase 9 Injection Contract**
- D-16: Jamo AI chat injects content via ref-based editor command: `editorRef.current.commands.insertContentAt()`.
- D-17: Two-layer targeting: (1) "Chat about this section" entry point (section-initiated, locks target); (2) active section tracker updates target automatically if chat is already open and user navigates.

### Claude's Discretion
- Exact TipTap extension set (bold, italic, lists, headings — standard prose editing; no special-purpose extensions unless needed)
- Toolbar layout within each section card (floating vs. fixed header)
- Autosave debounce interval for `last_saved_content`
- Maximum versions to retain per section in `proposal_section_versions` (suggest 10–20, prune oldest)
- Specific section-type requirements lists used in compliance Haiku prompts

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-5.1 | Three-panel layout: left (section navigation) / center (editor) / right (AI panel reserved for Phase 9) | `DraftNav` in `ProposalDraftRenderer` is directly reusable; extend with status dots |
| REQ-5.2 | Rich text editor (TipTap v3) in center panel — replaces read-only `ProposalDraftRenderer` | TipTap v3.20.5 confirmed; `@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/pm` |
| REQ-5.3 | Per-section actions: Generate, Regenerate, Expand, Condense, Rewrite | `SectionActionToolbar` component; AI actions stream to preview area (D-01) |
| REQ-5.4 | Lock/unlock toggle per section — locked sections read-only, excluded from AI edits | `is_locked` column already exists on `proposal_sections` |
| REQ-5.5 | Version history per section — view and restore prior versions | `proposal_section_versions` table must be created (not in migrations); overlay panel (D-09) |
| REQ-5.6 | Section navigation shows completion status: complete / needs review / missing | Extend `DraftNav`; statuses map to `proposal_sections.status` column values |
| REQ-5.7 | Cross-section consistency checks after full generation | Auto-trigger (D-12); Haiku call with all section content; `ConsistencyCheckBanner` component |
| REQ-5.8 | Compliance flags inline: qualitative only, no numerical scores | Two-pass on accept (D-14); `ComplianceFlag` component; Haiku `claude-haiku-4-5-20251001` |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@tiptap/react` | 3.20.5 | React integration (`useEditor`, `EditorContent`) | Official React adapter; peer deps include React 19 |
| `@tiptap/pm` | 3.20.5 | ProseMirror bindings (required peer dep) | Required by all TipTap packages |
| `@tiptap/starter-kit` | 3.20.5 | Bundled extensions: bold, italic, headings, lists, history, paragraph, code blocks | Covers all prose editing needs for proposal text |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `framer-motion` | ^12.34.3 | Version history overlay enter/exit, AI preview appear/dismiss | Already installed; use for all overlay animations per UI-SPEC |
| `@supabase/supabase-js` | ^2.98.0 | Autosave to `last_saved_content`, version writes, compliance flag storage | Already installed |

### Not Needed
| Skipped | Reason |
|---------|--------|
| `@tiptap/extension-floating-menu` / `@tiptap/extension-bubble-menu` | Toolbar is a fixed header per section card (per UI-SPEC), not floating |
| `@floating-ui/dom` | Only required for BubbleMenu/FloatingMenu in v3; not used here |
| `tippy.js` | Removed in TipTap v3; not used |
| Any diff library | Rewrite diff is a two-column before/after view, not a word-level diff — no library needed |

**Installation (Wave 0):**
```bash
npm install @tiptap/react@3.20.5 @tiptap/pm@3.20.5 @tiptap/starter-kit@3.20.5
```

**Version verification:** Confirmed 3.20.5 via `npm view @tiptap/react version` on 2026-03-26.

**CRITICAL VERSION NOTE:** REQUIREMENTS.md and CONTEXT.md reference "TipTap v2". The current stable release is v3.20.5. All API contracts described in decisions (D-05, D-16 — `insertContent`, `setContent`, `insertContentAt`) are unchanged between v2 and v3. Use v3.

---

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/
│   ├── SectionWorkspace.tsx          # Top-level, replaces ProposalDraftRenderer
│   ├── SectionEditorBlock.tsx        # Per-section: TipTap + toolbar + compliance flags
│   ├── SectionActionToolbar.tsx      # Generate/Regenerate/Expand/Condense/Rewrite + Lock + History
│   ├── AIActionPreview.tsx           # Inline preview (Expand/Condense) — reuses SuggestedChange pattern
│   ├── RewriteDiffView.tsx           # Before/after diff for Rewrite (D-04)
│   ├── VersionHistoryOverlay.tsx     # Fixed-position overlay panel (D-09)
│   ├── ComplianceFlag.tsx            # Inline amber/red flag chip (D-15)
│   └── ConsistencyCheckBanner.tsx    # Full-width banner after full generation (D-12)
├── context/
│   └── SectionWorkspaceContext.tsx   # useReducer state for workspace (established pattern)
├── hooks/
│   ├── useSectionEditor.ts           # TipTap useEditor wrapper per section
│   └── useAutosave.ts                # Debounced autosave to last_saved_content
└── types/
    └── workspace.ts                  # WorkspaceState, SectionEditorState, VersionEntry types
```

### Pattern 1: One TipTap instance per section block
**What:** Each `SectionEditorBlock` owns its own `useEditor` instance. Sections are independent editors, not one document.
**When to use:** Always — proposals have 10 sections each needing independent lock, history, and compliance state.
**Example:**
```typescript
// Source: https://tiptap.dev/docs/editor/getting-started/install/react
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const editor = useEditor({
  extensions: [StarterKit],
  content: section.content ?? '',
  immediatelyRender: false,  // Required for React 19 / SSR-safe hydration
  editable: !section.is_locked,
  onUpdate: ({ editor }) => {
    debouncedAutosave(editor.getHTML())
  },
})
```

### Pattern 2: All content mutations via TipTap command API (D-05)
**What:** AI actions, restore, and Phase 9 injection all use `editor.commands.setContent()` or `editor.commands.insertContentAt()`. Never `innerHTML` or direct ProseMirror document mutations.
**When to use:** Every place content is programmatically set.
**Example:**
```typescript
// Source: https://tiptap.dev/docs/editor/api/commands/set-content
// Accept AI action result:
editor.commands.setContent(acceptedHtml, true) // true = emit update event

// Phase 9 injection at cursor:
editorRef.current.commands.insertContentAt(position, content)
```

### Pattern 3: Snapshot before mutation (D-02, D-07, D-11)
**What:** Before any AI action starts streaming, take `editor.getHTML()` and write to `proposal_section_versions`. Before restore, do the same.
**When to use:** Every AI action trigger and every restore trigger.
```typescript
// Pre-action snapshot
const snapshot = editor.getHTML()
await supabase.from('proposal_section_versions').insert({
  proposal_id, section_key,
  content: snapshot,
  action_label: 'Before Rewrite',
  created_at: new Date().toISOString(),
})
// Then start streaming
```

### Pattern 4: SectionWorkspaceContext with useReducer
**What:** Top-level workspace state (active section, streaming states, compliance flags, version history open state) in a React Context with `useReducer`.
**When to use:** Any state that crosses component boundaries (e.g., consistency check banner needs to know all sections complete).
**Source:** Established pattern in `src/context/` from Phase 5.

### Pattern 5: Ref forwarding for Phase 9 injection (D-16)
**What:** Each `SectionEditorBlock` exposes its editor via `useImperativeHandle` / `forwardRef` so `SectionWorkspace` can hold a `Map<sectionKey, EditorRef>` and hand the active ref to Phase 9.
```typescript
// SectionEditorBlock exposes:
export interface SectionEditorHandle {
  insertContentAt: (pos: number, content: string) => void
  setContent: (html: string) => void
  getContent: () => string
}
```

### Anti-Patterns to Avoid
- **Direct DOM mutation:** `document.getElementById('section-x').innerHTML = ...` — silently breaks Cmd+Z (D-05).
- **Single shared editor:** One TipTap instance for the whole document — breaks per-section lock, history, and compliance.
- **Snapshotting on every keystroke:** Floods `proposal_section_versions`; D-07 and D-08 explicitly rule this out.
- **Compliance on stream:** D-13 explicitly defers compliance to accept, not stream complete.
- **`immediatelyRender: true` with React 19:** Causes hydration mismatch warnings; always set `false`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rich text undo/redo | Custom undo stack | TipTap History extension (included in StarterKit) | ProseMirror handles transaction history; custom stacks conflict |
| Streaming cursor animation | Custom blinking span | `animate-pulse` CSS class (established in SectionStreamCard) | Already in project; consistent with Phase 7 |
| Accept/reject UI | New accept/reject component | Extend `SuggestedChange.tsx` pattern | Already exists, tested, matches design tokens |
| Overlay backdrop | Custom modal system | framer-motion `AnimatePresence` + fixed div | Already used in ProposalDraftRenderer for popovers |
| Intersection observer for active section | Custom scroll tracker | Copy `DraftNav` IntersectionObserver pattern from `ProposalDraftRenderer` | Already implemented and working |
| Debounce for autosave | setTimeout management | Standard `useRef` + `setTimeout` debounce pattern (150 lines max) | Simple enough to inline; no library needed |

---

## Schema Gaps (Wave 0 Migration Required)

Two schema items must be created in Phase 8 before any editor work:

### 1. `proposal_section_versions` table (does not exist)
```sql
CREATE TABLE proposal_section_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id   UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_key   TEXT NOT NULL,
  content       TEXT NOT NULL,           -- HTML or TipTap JSON at snapshot time
  action_label  TEXT NOT NULL,           -- e.g. 'Before Rewrite', 'After Expand'
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_psv_section ON proposal_section_versions(proposal_id, section_key, created_at DESC);
-- RLS: org_id scoped (same pattern as proposal_sections)
```
**Pruning:** Keep max 20 versions per section_key per proposal. Planner should include a pruning step (delete oldest when count > 20).

### 2. `last_saved_content` column on `proposal_sections` (does not exist)
```sql
ALTER TABLE proposal_sections ADD COLUMN last_saved_content TEXT;
```
This is the autosave durability column (D-08). Single overwriting value. Not a history mechanism.

---

## Common Pitfalls

### Pitfall 1: TipTap v3 `immediatelyRender`
**What goes wrong:** Editor renders server-side (or during React 19 strict mode double-invoke) and throws hydration mismatch.
**Why it happens:** TipTap v3 default `immediatelyRender: true` causes SSR/hydration issues with React 19.
**How to avoid:** Always pass `immediatelyRender: false` to `useEditor`.
**Warning signs:** Console warning "Hydration mismatch" or editor content flash on mount.

### Pitfall 2: TipTap `editor` is null on first render
**What goes wrong:** Accessing `editor.commands.*` before the editor is initialized throws.
**Why it happens:** `useEditor` returns `null` on first render cycle.
**How to avoid:** Guard all command calls with `if (!editor) return`. The `if (!editor) return null` pattern in the component render is the standard TipTap guard.

### Pitfall 3: Bypassing command API breaks undo (D-05)
**What goes wrong:** Content injected via DOM mutation or direct ProseMirror document access appears in the editor but isn't in the undo history.
**Why it happens:** TipTap only records transactions that go through `editor.commands.*`.
**How to avoid:** Enforce in code review: the only place `editor.getHTML()` or `editor.getJSON()` appears is for reading; writing always uses `editor.commands.*`.

### Pitfall 4: Multiple editors conflicting with autosave
**What goes wrong:** Each `SectionEditorBlock` triggers autosave independently; rapid navigation causes race conditions writing `last_saved_content`.
**Why it happens:** 10 simultaneous debounced writes to different rows (different `section_key`) — actually fine since rows are independent. Only a problem if the same section renders multiple instances.
**How to avoid:** Ensure each section_key maps to exactly one editor instance. Key the component on `section_key` to force remount on navigation, not `id`.

### Pitfall 5: Compliance Haiku call on streaming content
**What goes wrong:** User sees compliance flags that immediately become stale because they accepted or rejected the action.
**Why it happens:** Calling compliance on stream complete rather than on accept.
**How to avoid:** D-13 is a hard rule: trigger compliance only inside the `onAccept` handler, never in the streaming `onChunk` or `onComplete` callbacks.

### Pitfall 6: `proposal_section_versions` flooding
**What goes wrong:** Taking a snapshot on every autosave fills the table with thousands of rows quickly.
**Why it happens:** Confusing the autosave path with the version history path.
**How to avoid:** D-07/D-08 are explicit: autosave writes to `last_saved_content` only. Versions table is written only on AI action trigger and on accept. Two separate code paths that must never be merged.

---

## Code Examples

### TipTap Editor Setup (React 19 safe)
```typescript
// Source: https://tiptap.dev/docs/editor/getting-started/install/react
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'

const editor = useEditor({
  extensions: [StarterKit],
  content: initialContent,
  immediatelyRender: false,     // React 19 / SSR safety
  editable: !isLocked,
  onUpdate: ({ editor }) => {
    triggerAutosave(editor.getHTML())
  },
})

// Guard required — editor is null on first render
if (!editor) return null
```

### Programmatic content injection (D-05, D-16)
```typescript
// Source: https://tiptap.dev/docs/editor/api/commands/set-content
// Replace full section content (Generate, Regenerate, Rewrite accept, Restore):
editor.commands.setContent(newHtml, true)

// Source: https://tiptap.dev/docs/editor/api/commands/content/insert-content
// Insert at position (Phase 9 chat injection, D-16):
editor.commands.insertContentAt(position, content)
```

### Autosave pattern (D-08)
```typescript
// Debounced write to last_saved_content — NOT proposal_section_versions
const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

function triggerAutosave(html: string) {
  if (autosaveRef.current) clearTimeout(autosaveRef.current)
  autosaveRef.current = setTimeout(async () => {
    setAutosaveStatus('saving')
    await supabase
      .from('proposal_sections')
      .update({ last_saved_content: html, updated_at: new Date().toISOString() })
      .eq('proposal_id', proposalId)
      .eq('section_key', sectionKey)
    setAutosaveStatus('saved')
  }, 1500) // 1500ms debounce (Claude's discretion default from UI-SPEC)
}
```

### Pre-action version snapshot (D-02, D-07)
```typescript
async function snapshotBeforeAction(label: string) {
  const content = editor.getHTML()
  const { count } = await supabase
    .from('proposal_section_versions')
    .select('id', { count: 'exact', head: true })
    .eq('proposal_id', proposalId)
    .eq('section_key', sectionKey)

  await supabase.from('proposal_section_versions').insert({
    proposal_id: proposalId,
    org_id: orgId,
    section_key: sectionKey,
    content,
    action_label: label,
  })

  // Prune if over 20 versions
  if ((count ?? 0) >= 20) {
    // Delete oldest — fetch IDs sorted by created_at ASC, delete first N
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TipTap v2 (as in REQUIREMENTS.md) | TipTap v3.x (3.20.5) | Stable release ~late 2024 | `immediatelyRender: false` required; BubbleMenu moved to separate entrypoint (not used here); command API unchanged |
| `tippy.js` for menus | `@floating-ui/dom` | TipTap v3 | Not needed — this phase uses fixed toolbar headers, not floating menus |
| `shouldRerenderOnTransaction` absent | New opt-in prop; `false` by default in v3 | TipTap v3 | Performance win — editor doesn't re-render React component on every keystroke unless opted in |

**Deprecated/outdated:**
- `tippy.js`: Removed as TipTap dependency in v3. Do not install.
- TipTap v2 packages (`@tiptap/react@2.x`): Do not use. npm registry now serves v3 by default.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm | Package install | ✓ | Confirmed (project active) | — |
| `@tiptap/react` | REQ-5.2 | ✗ (not installed) | — | None — must install |
| `@tiptap/pm` | TipTap peer dep | ✗ (not installed) | — | None — must install |
| `@tiptap/starter-kit` | REQ-5.2 | ✗ (not installed) | — | None — must install |
| `framer-motion` | Overlay animations | ✓ | ^12.34.3 | — |
| `@supabase/supabase-js` | Autosave, versions | ✓ | ^2.98.0 | — |
| Supabase project (live) | DB migrations | ✓ | fuuvdcvbliijffogjnwg | — |

**Missing dependencies with no fallback:**
- `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit` — Wave 0 must install these before any editor implementation.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.0.4 |
| Config file | `vitest.config.ts` (root) |
| Quick run command | `npm run test:run` |
| Full suite command | `npm run test:run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-5.1 | Three-panel layout renders left nav, center editor, right slot | unit (render) | `npm run test:run -- SectionWorkspace` | ❌ Wave 0 |
| REQ-5.2 | TipTap editor renders, accepts content prop, emits onUpdate | unit | `npm run test:run -- SectionEditorBlock` | ❌ Wave 0 |
| REQ-5.3 | Toolbar shows Generate/Regenerate/Expand/Condense/Rewrite; actions disabled when locked | unit | `npm run test:run -- SectionActionToolbar` | ❌ Wave 0 |
| REQ-5.4 | Lock toggle sets `editable: false` on editor; locked section excluded from AI action | unit | `npm run test:run -- SectionEditorBlock` | ❌ Wave 0 |
| REQ-5.5 | Version history overlay opens; restore calls `setContent` via command API | unit | `npm run test:run -- VersionHistoryOverlay` | ❌ Wave 0 |
| REQ-5.6 | Nav status dots reflect section status values from proposal_sections | unit | `npm run test:run -- DraftNav` | ❌ Wave 0 |
| REQ-5.7 | Consistency check banner appears after all sections complete; dismissible | unit | `npm run test:run -- ConsistencyCheckBanner` | ❌ Wave 0 |
| REQ-5.8 | Compliance flag renders amber for warning, red for fail; fires on accept not on stream | unit | `npm run test:run -- ComplianceFlag` | ❌ Wave 0 |

**TipTap testing note:** TipTap's `useEditor` requires a DOM environment. The project uses `happy-dom` which is sufficient. However, `useEditor` may need `act()` wrapping for async initialization. Test stubs should use `it.skip` per established project pattern (not dynamic imports — Vite resolves at transform time).

### Sampling Rate
- **Per task commit:** `npm run test:run` (exits in <15s per project constraint)
- **Per wave merge:** `npm run test:run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/__tests__/SectionWorkspace.test.tsx` — covers REQ-5.1
- [ ] `src/components/__tests__/SectionEditorBlock.test.tsx` — covers REQ-5.2, REQ-5.4
- [ ] `src/components/__tests__/SectionActionToolbar.test.tsx` — covers REQ-5.3
- [ ] `src/components/__tests__/VersionHistoryOverlay.test.tsx` — covers REQ-5.5
- [ ] `src/components/__tests__/DraftNav.test.tsx` — covers REQ-5.6
- [ ] `src/components/__tests__/ConsistencyCheckBanner.test.tsx` — covers REQ-5.7
- [ ] `src/components/__tests__/ComplianceFlag.test.tsx` — covers REQ-5.8
- [ ] TipTap package install: `npm install @tiptap/react@3.20.5 @tiptap/pm@3.20.5 @tiptap/starter-kit@3.20.5`
- [ ] DB migrations: `proposal_section_versions` table + `last_saved_content` column

---

## Open Questions

1. **TipTap v3 in happy-dom test environment**
   - What we know: `useEditor` needs DOM. happy-dom is confirmed for the project.
   - What's unclear: Whether `useEditor` async initialization (returns null then editor) causes flakiness with act() in happy-dom vs jsdom.
   - Recommendation: Wave 0 stubs use `it.skip`; Wave 1 first task smoke-tests a minimal TipTap render in happy-dom before writing full tests. If it fails, switch to jsdom for the editor test files only (jsdom is also installed).

2. **`proposal_sections.content` column type for TipTap**
   - What we know: Column is `TEXT`, comment says "markdown or TipTap JSON". Phase 7 writes markdown/plain text from generation streaming.
   - What's unclear: Should Phase 8 store HTML or TipTap JSON? TipTap can load either via `setContent`.
   - Recommendation: Store HTML (TipTap's `editor.getHTML()`). It's human-readable, loads cleanly into TipTap, and is trivially parseable for compliance checks. TipTap JSON is preferred only when custom node types are used (none here).

3. **Consistency check Edge Function or client-side Haiku call**
   - What we know: Phase 7 uses Supabase Edge Functions for all AI calls (API key security). Compliance check uses Haiku (lighter).
   - What's unclear: Consistency check passes all section content — should it be an Edge Function call or client-side via existing pattern?
   - Recommendation: Edge Function (same pattern as extract-assumptions) to keep API key off browser. Client invokes via `supabase.functions.invoke('consistency-check', { body: { sections } })`.

---

## Sources

### Primary (HIGH confidence)
- npm registry `npm view @tiptap/react version` — confirmed v3.20.5, React 19 peer dep support
- npm registry `npm view @tiptap/starter-kit dependencies` — confirmed bundled extension list
- `supabase/migrations/20260305000005_proposal_sections.sql` — confirmed `is_locked` column exists, `last_saved_content` absent
- Migrations grep — confirmed `proposal_section_versions` table does not exist

### Secondary (MEDIUM confidence)
- [TipTap v3 stable release notes](https://tiptap.dev/blog/release-notes/tiptap-3-0-is-stable) — BubbleMenu moved to @floating-ui/dom, tippy.js removed, `immediatelyRender` required for React 19
- [TipTap React install docs](https://tiptap.dev/docs/editor/getting-started/install/react) — `useEditor` + `EditorContent` pattern, `immediatelyRender: false`
- [TipTap setContent command](https://tiptap.dev/docs/editor/api/commands/set-content) — command API confirmed stable
- [TipTap insertContent command](https://tiptap.dev/docs/editor/api/commands/content/insert-content) — command API confirmed stable

### Tertiary (LOW confidence)
- WebSearch results on TipTap v3 React 19 compatibility — `fast-deep-equal` module resolution issue mentioned (LOW: single unverified report; peer dep declaration shows React 19 as supported)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified against npm registry on research date
- Architecture: HIGH — derived from locked decisions in CONTEXT.md + established project patterns
- Schema gaps: HIGH — verified by direct migration file inspection
- TipTap v3 API stability: HIGH — command API (`insertContent`, `setContent`) confirmed in official docs, unchanged from v2 contract
- React 19 + TipTap v3 compatibility: MEDIUM — peer dep declares support; one edge case (fast-deep-equal) flagged but not verified as blocking

**Research date:** 2026-03-26
**Valid until:** 2026-04-25 (TipTap releases frequently; re-verify version before install if >30 days)
