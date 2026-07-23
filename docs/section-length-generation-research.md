# Adaptive section length — research & options

**Question:** sections should naturally differ in length (a cover letter ≠ the scope of work), so a single global word count is wrong. How do we get right-sized sections without truncation and without flattening everything to one size?

**Short answer:** the truncation you saw is not a token-ceiling problem, it's a *missing-guidance* problem — and the machinery to fix it per-section already exists in the code but is half-wired. You don't need a global word count. You need to finish wiring the per-section guidance that's already there.

---

## What's actually happening (grounded in the code)

The live wizard uses the **v2** generation path (`useProposalGeneration.ts:372` sends `version: 2`), which calls `buildSectionPromptV2` in `promptAssembly.ts`. That builder already differentiates sections three ways:

1. **`SECTION SCOPE`** — from each section's `description` (stored per section in `template_sections`).
2. **`SECTION STRATEGY`** — from a hardcoded `roleHints` map keyed by the section's `role` (`promptAssembly.ts:207`).
3. **Tone**, consistency anchor, prior-section context.

So per-section adaptivity is *already the design*. The problem is the length dimension was never added to it, and the strategy map has a wiring bug.

### The wiring bug (this is most of your runaway)

The `roleHints` map keys don't match the actual section roles in the default template:

| Section (position) | DB `role` | Has a `roleHints` entry? |
|---|---|---|
| Understanding of the Study | `study_understanding` | **No** — map has `understanding`, which never matches |
| Scope of Work | `scope_of_work` | **No** |
| Proposed Team | `proposed_team` | **No** |
| Timeline | `timeline` | Yes |
| Budget | `budget` | Yes |
| Regulatory Strategy | `regulatory_strategy` | Yes |
| Quality Management | `quality_management` | **No** |
| Executive Summary | `executive_summary` | Yes |
| Cover Letter | `cover_letter` | Yes |

**4 of 9 sections — including the two largest prose sections (Understanding, Scope) — currently receive zero strategy guidance.** The `understanding` hint that *does* exist is dead code: no section has that role. So the exact section that ran to 2,500 words was flying completely blind. It had no shape to aim for, so it sprawled into an 8-subsection treatise until it hit `max_tokens` and got chopped mid-word.

Meanwhile the *only* length signals in the whole prompt live inside `roleHints` and apply to just two sections:
- `executive_summary`: "1–2 page executive summary"
- `cover_letter`: "Keep under 1 page"

Those two are the only sections that get told how big to be — and, not coincidentally, they're not the ones running away.

### Two independent problems, don't conflate them

1. **No per-section shape** → sections have no target, so the richest ones sprawl. (Fix below.)
2. **Truncation is silent** → the function never checks `stop_reason`. A `max_tokens` cutoff is streamed and saved as if complete (`index.ts:307` accumulates and writes on stream close; no `stop_reason` inspection anywhere). For a *demo fixture* this is the dangerous one: a truncated-but-non-blank section passes the capture guard and is replayed forever.

---

## Options

### Option A — Add a length/depth dimension to the existing per-section machinery *(recommended)*

Extend what's already there rather than inventing anything. Two parts:

1. **Fix the role-key mismatch** so all 9 sections get their strategy hint (rename map keys to match the real roles, or key off something stable).
2. **Add a per-role depth target** to each hint — expressed as a *shape*, not a hard number. E.g.:

   | Role | Depth guidance |
   |---|---|
   | cover_letter | Under 1 page. Warm, brief, 3–4 short paragraphs. |
   | executive_summary | 1–2 pages. Synthesize; don't re-derive. |
   | study_understanding | Substantial — this is the credibility section. 4–7 focused paragraphs; cover design, population, geography, key risks. Conclude; don't catalogue every subsection. |
   | scope_of_work | Comprehensive but structured — lead with a services table, then per-area detail proportional to the services actually selected. |
   | proposed_team | Moderate — roles and responsibilities, table-friendly. |
   | timeline | Concise prose + milestone structure; let the table carry detail. |
   | budget | Concise prose + itemized table; the table is the content. |
   | regulatory_strategy | Moderate, region-structured. |
   | quality_management | Moderate. |

   Phrase each as "aim for roughly X; always finish with a concluding sentence — never stop mid-thought." The point is to make the model *plan an ending* it can reach, not to cap it.

**Why this is the right fit:** it uses infrastructure that already exists, it's explicitly per-section (directly answers your objection to a global number), and it fixes a live bug along the way. Cost: ~30 min of prompt work in one file, redeploy. Fully reversible.

**Keep `max_tokens` at 4000** as a safety net well above every target — not as the lever.

### Option B — Make depth a first-class column on `template_sections`

Add `target_depth` (`brief` | `standard` | `comprehensive`) or `target_words` to the `template_sections` table; the prompt reads it. This is Option A "productized": section size becomes template metadata the org edits, not a hardcoded map in the edge function.

**Why consider it:** the template is already where section identity, scope, and role live — length belongs there too, and different templates/clients may want different depths for the same section. **Why not now:** it's a migration + UI + prompt change for a benefit you don't need for the demo. Good as the eventual home; overkill this week. (A is forward-compatible with it — the role hints become the default values.)

### Option C — Let the model size the section from content richness (two-pass / self-planned)

Before writing, have the model assess how much the RFP actually supports for this section and plan N subsections, then write to that plan. This adapts to *content*, not just section type — a thin RFP yields a short Understanding, a rich one yields more.

**Why consider it:** it's the only option that adapts to how much there genuinely is to say. **Why not now:** doubles latency and cost per section, adds real complexity, and for a curated demo where you control the RFP you don't need content-adaptivity — you need predictable, complete sections. Note as the sophisticated long-term direction.

### Option D — Just raise `max_tokens` and rely on natural stopping

Set the ceiling high (e.g. 8000) and add no guidance.

**Rejected:** your pasted output is the counter-evidence. Left unguided the model doesn't conclude — it pads ("insert validated FGF19 prevalence rate here", "calculated milestone date to be confirmed") and runs long. A higher ceiling just moves the cliff and makes every demo slower and costlier. Raising to 4000 was the right *emergency* stopgap; it is not the fix.

---

## Recommendation

**A, plus a truncation guard.**

1. Fix the `roleHints` key mismatch so all 9 sections get guidance.
2. Add per-role depth targets (shapes, not hard numbers) — this *is* the per-section answer you wanted.
3. Keep `max_tokens: 4000` as a safety net.
4. **Add a `stop_reason === 'max_tokens'` check** so a truncated section is surfaced (error / regenerate), never silently saved. Cheap, and it means you can never again unknowingly bake a cutoff into the fixture.

Sequence B and C later only if the product needs org-editable depth (B) or content-adaptive sizing (C). A is a prompt-only change in `promptAssembly.ts` + redeploy, fully reversible, and directly fixes what you hit.

---

## Separate, but capture-blocking — the output quality issues

The pasted section also shows problems a length fix won't solve, and they'd bake into the fixture:

- **Instruction-to-self left in prose:** "ranges from approximately *insert validated FGF19 amplification prevalence rate in HCC, with source citation*". The model wrote a note to itself instead of using the `[PLACEHOLDER: …]` mechanism the prompt tells it to use (`promptAssembly.ts:230`). Worth a prompt reinforcement.
- **Mangled heading:** `clear role3>1.7 Monitoring Strategy` — a corrupted tag/heading in the stream.
- **Dropped paragraph:** a sentence starting mid-thought ("stage adds a layer…").

These are generation-quality issues to review before capture regardless of how the length question is resolved — the fixture is permanent.
