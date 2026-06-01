// Phase 14.2.2 — shared SHA-256 hex of TipTap-serialized section HTML.
// Used by both the resolved_items writer (client) and the analyze-proposal-gaps
// edge function (Deno) — Deno has its own copy because client utils can't be
// imported. Per CONTEXT.md D-31 + PATTERNS.md §S5.
//
// Distinct from useGapAnalysisTrigger.ts (which hashes ALL section summaries
// for cooldown debounce); this hashes ONE section's body for drift detection.
export async function sha256OfSection(sectionHtml: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sectionHtml))
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
