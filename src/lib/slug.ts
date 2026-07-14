// Pure slug-generation helper (req 3). Unit-tested here; also duplicated
// (not imported) inside supabase/functions/admin-create-org/index.ts because
// the Deno edge runtime cannot resolve src/lib/ imports at deploy time (same
// convention as chunker.ts / ingest-regulatory.ts per 14.6-PATTERNS). Keep
// both copies in sync manually if this logic changes.
export function baseSlug(name: string): string {
  const collapsed = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Cap at 60 chars, then re-trim in case the cut lands on a trailing hyphen.
  return collapsed.slice(0, 60).replace(/-+$/g, '')
}
