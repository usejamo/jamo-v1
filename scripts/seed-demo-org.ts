// scripts/seed-demo-org.ts
// Idempotent seed for the Phase 16 demo org's shared super_admin PRESENTER account
// (SPEC Decision A / CONTEXT D-07, D-08).
//
// The demo `organizations` row itself is created by the committed migration
// supabase/migrations/20260721000003_demo_org.sql ("org via migration, account via
// invite-script" — the split every other org+user pair in this codebase already uses).
// This script upserts the same org row defensively (same slug, jsonb-merged flag) so it is
// runnable stand-alone, then creates the presenter account through the EXACT 5-step
// invite-first sequence of scripts/bootstrap-super-admin.ts:
//   1. Idempotency guard — scoped to the DEMO org, so it never touches or clobbers the
//      Phase-15 internal super_admin (T-16-06).
//   2. Upsert the demo org (onConflict: 'slug', feature_flags: { is_demo: true }).
//   3. Insert a PENDING invites row — the handle_new_user trigger reads org/role from it and
//      requires status = 'pending' at create time
//      (supabase/migrations/20260713000002_invites_and_trigger_hardening.sql).
//   4. Admin-API user creation (the trigger runs synchronously inside the insert and binds
//      user_profiles.org_id = demo org, role = super_admin). NEVER a raw auth-schema insert.
//   5. Flip the invites row to 'accepted'.
//
// The presenter role is `super_admin` because every demo endpoint gates on
// `role === 'super_admin'` (SPEC Req: super_admin server gate) and Decision A binds that
// account's org to the demo org so all org-scoped RLS keeps working unmodified.
//
// Usage:
//   npm run seed:demo-org
//
// Requires env (from .env or process.env):
//   VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   DEMO_PRESENTER_EMAIL, DEMO_PRESENTER_PASSWORD
//
// The presenter credentials and the service-role key are env-sourced ONLY — never hardcoded,
// never defaulted, and never printed (T-16-05, mirroring T-15-26).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const DEMO_ORG = { name: 'Jamo Demo', slug: 'jamo-demo', plan: 'internal' } as const
export const DEMO_ORG_FEATURE_FLAGS = { is_demo: true } as const

// ---- Minimal .env loader (verbatim pattern from scripts/bootstrap-super-admin.ts:31-49) ----
function loadEnv(): Record<string, string> {
  const out: Record<string, string> = { ...process.env } as Record<string, string>
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8')
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (out[key] === undefined || out[key] === '') out[key] = val
    }
  } catch {
    // .env optional if vars already in process.env
  }
  return out
}

/** True when Supabase's admin API rejected createUser because the email is already registered. */
function isAlreadyRegistered(message: string): boolean {
  return /already (been )?registered|already exists|duplicate key|email_exists/i.test(message)
}

/**
 * Runs the idempotent demo-org seed against the provided admin client. Exported (and
 * client-injectable) so scripts/seed-demo-org.test.ts can mock the Supabase client and assert
 * call ordering without touching a real project.
 */
export async function seedDemoOrg(admin: SupabaseClient, email: string, password: string): Promise<void> {
  // 1. Idempotency guard — scoped to the DEMO org only. Look the org up by slug first; if it
  // exists and already holds a super_admin profile, a previous run completed, so do nothing.
  // Deliberately NOT a global "any super_admin exists" check: the Phase-15 internal
  // super_admin must not suppress this seed, and this seed must not touch it (T-16-06).
  const { data: existingOrg, error: existingOrgError } = await admin
    .from('organizations')
    .select('id')
    .eq('slug', DEMO_ORG.slug)
    .maybeSingle()
  if (existingOrgError) {
    throw new Error(`Failed looking up demo org: ${existingOrgError.message}`)
  }

  if (existingOrg) {
    const { data: existingPresenter, error: presenterError } = await admin
      .from('user_profiles')
      .select('id')
      .eq('org_id', existingOrg.id)
      .eq('role', 'super_admin')
      .limit(1)
    if (presenterError) {
      throw new Error(`Failed checking for existing demo presenter: ${presenterError.message}`)
    }
    if (existingPresenter && existingPresenter.length > 0) {
      console.log(`Demo presenter super_admin already exists in org '${DEMO_ORG.slug}', skipping seed.`)
      return
    }
  }

  // 2. Upsert the demo org. jsonb flag written explicitly; the committed migration performs the
  // same upsert with a jsonb merge, so applying either (or both, in any order) converges.
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .upsert({ ...DEMO_ORG, feature_flags: { is_demo: true } }, { onConflict: 'slug' })
    .select()
    .single()
  if (orgError || !org) {
    throw new Error(`Failed upserting demo org: ${orgError?.message ?? 'no org returned'}`)
  }

  // 3. Insert a PENDING invite — must be 'pending' at create time; the handle_new_user trigger
  // filters `status = 'pending'` and reads org_id/role from this row (never client metadata).
  const { data: invite, error: inviteError } = await admin
    .from('invites')
    .insert({ email, org_id: org.id, role: 'super_admin', status: 'pending' })
    .select()
    .single()
  if (inviteError || !invite) {
    throw new Error(`Failed inserting demo presenter invite: ${inviteError?.message ?? 'no invite returned'}`)
  }

  // 4. Create the auth user via the admin API — the trigger runs synchronously inside this call
  // and binds the profile (org = demo org, role = super_admin) from the pending invite.
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError) {
    // Revoke the invite we just minted so a stray PENDING super_admin invite can never bind a
    // later signup for this address (Rule 2 hardening; the guard above cannot see this case
    // because the account exists WITHOUT a demo-org profile).
    await admin.from('invites').update({ status: 'revoked' }).eq('id', invite.id)
    if (isAlreadyRegistered(createError.message)) {
      throw new Error(
        `An auth account already exists for the configured DEMO_PRESENTER_EMAIL, but it has no ` +
          `super_admin profile in org '${DEMO_ORG.slug}'. This is a partial/foreign state the seed ` +
          `will not silently repair: either use a different DEMO_PRESENTER_EMAIL, or delete that ` +
          `account and re-run. (The pending invite created by this run has been revoked.)`
      )
    }
    throw new Error(`Failed creating demo presenter user: ${createError.message}`)
  }

  // 5. Flip the invite to accepted only AFTER user creation succeeds.
  const { error: acceptError } = await admin.from('invites').update({ status: 'accepted' }).eq('id', invite.id)
  if (acceptError) {
    throw new Error(`Failed marking demo presenter invite accepted: ${acceptError.message}`)
  }

  console.log(`Demo presenter super_admin seeded in org '${DEMO_ORG.slug}'.`)
}

// ---- CLI entrypoint ----

/**
 * `env` is overridable so tests can exercise main() against a mocked client without touching a
 * real project or a real .env file.
 */
export async function main(env: Record<string, string> = loadEnv()): Promise<void> {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const email = env.DEMO_PRESENTER_EMAIL
  const password = env.DEMO_PRESENTER_PASSWORD

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!email || !password) {
    throw new Error(
      'Missing DEMO_PRESENTER_EMAIL / DEMO_PRESENTER_PASSWORD (env-sourced, never hardcoded)'
    )
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  await seedDemoOrg(admin, email, password)
  process.exit(0)
}

// Only auto-run when executed directly (not when imported by Vitest).
const isMain = !!process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  main().catch((err) => {
    console.error('Fatal:', err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
