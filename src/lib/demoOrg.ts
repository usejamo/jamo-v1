import { supabase } from './supabase'

// ── Demo-org resolution (shared) ─────────────────────────────────────────────
//
// Extracted from SaveAsDemoFixtureButton (16-07) once the demo run surface
// (16-08) needed the same gate.
//
// TWO super_admins exist — the demo presenter in `jamo-demo` and the Phase-15
// internal account — so `role === 'super_admin'` alone is NOT a sufficient
// condition for a demo affordance: it would show the control to an account for
// whom every server call 403s. Every demo gate must additionally require that
// the caller's OWN org is the demo org.
//
// The org is resolved at RUNTIME by flag or slug. Never hardcode the demo org
// UUID: the seed is reproducible per environment and the id differs.
//
// These gates are COSMETIC. The authoritative boundary is server-side, in
// demo-capture-fixture / demo-run-start / demo-reset, each of which re-reads
// the caller's role from `user_profiles` and re-resolves the demo org itself.

export const DEMO_ORG_SLUG = 'jamo-demo'

/**
 * Runtime demo-org resolution. Returns true when the given org is flagged
 * `feature_flags.is_demo` or carries the canonical `jamo-demo` slug.
 * Fails closed: any error or missing row resolves to false.
 */
export async function resolveIsDemoOrg(orgId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('organizations')
    .select('id, slug, feature_flags')
    .eq('id', orgId)
    .maybeSingle()

  if (error || !data) return false
  const flags = (data.feature_flags ?? {}) as Record<string, unknown>
  return flags.is_demo === true || data.slug === DEMO_ORG_SLUG
}
