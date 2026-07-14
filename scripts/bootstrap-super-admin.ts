// scripts/bootstrap-super-admin.ts
// Idempotent bootstrap for the first platform super_admin (D-12 / req 11).
//
// Solves the chicken-and-egg problem: /admin is unreachable with no super_admin, and there is no
// UI path to create the very first one. This script uses the EXACT same invite-first flow as every
// other provisioning path in the app (no special trigger branch):
//   1. Idempotency guard — skip entirely if a super_admin already exists.
//   2. Upsert the internal Jamo org.
//   3. Insert a PENDING invites row (the handle_new_user trigger reads this — status must be
//      'pending' at createUser time, see supabase/migrations/20260713000002_invites_and_trigger_hardening.sql).
//   4. auth.admin.createUser (trigger runs synchronously inside the insert and binds org/role).
//   5. Flip the invites row to 'accepted'.
//
// Usage:
//   npx tsx scripts/bootstrap-super-admin.ts
//
// Requires env (from .env or process.env):
//   VITE_SUPABASE_URL (or SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY,
//   BOOTSTRAP_SUPER_ADMIN_EMAIL, BOOTSTRAP_SUPER_ADMIN_PASSWORD
//
// NEVER hardcode the password or service-role key here — env-sourced only (T-15-26).

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const INTERNAL_ORG = { name: 'Jamo Internal', slug: 'jamo-internal', plan: 'internal' } as const

// ---- Minimal .env loader (verbatim pattern from scripts/seed-regulatory.ts:155-173) ----
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

/**
 * Runs the idempotent bootstrap sequence against the provided admin client. Exported (and
 * client-injectable) so scripts/bootstrap-super-admin.test.ts can mock the Supabase client and
 * assert call ordering without touching a real project.
 */
export async function bootstrapSuperAdmin(admin: SupabaseClient, email: string, password: string): Promise<void> {
  // 1. Idempotency guard (T-15-25) — never mint a second platform super_admin.
  const { data: existing, error: existingError } = await admin
    .from('user_profiles')
    .select('id')
    .eq('role', 'super_admin')
    .limit(1)
  if (existingError) {
    throw new Error(`Failed checking for existing super_admin: ${existingError.message}`)
  }
  if (existing && existing.length > 0) {
    console.log('super_admin already exists, skipping bootstrap.')
    return
  }

  // 2. Upsert the internal org.
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .upsert(INTERNAL_ORG, { onConflict: 'slug' })
    .select()
    .single()
  if (orgError || !org) {
    throw new Error(`Failed upserting internal org: ${orgError?.message ?? 'no org returned'}`)
  }

  // 3. Insert a PENDING invite — must be 'pending' at createUser time; the handle_new_user
  // trigger filters `status = 'pending'` (RESEARCH.md Pattern 3 / T-15-27).
  const { data: invite, error: inviteError } = await admin
    .from('invites')
    .insert({ email, org_id: org.id, role: 'super_admin', status: 'pending' })
    .select()
    .single()
  if (inviteError || !invite) {
    throw new Error(`Failed inserting bootstrap invite: ${inviteError?.message ?? 'no invite returned'}`)
  }

  // 4. Create the auth user — the trigger runs synchronously inside this call and binds the
  // profile from the pending invite (no raw_user_meta_data branch, per D-12 Approach A).
  const { error: createError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (createError) {
    throw new Error(`Failed creating super_admin user: ${createError.message}`)
  }

  // 5. Flip the invite to accepted only AFTER createUser succeeds (T-15-27 ordering).
  const { error: acceptError } = await admin.from('invites').update({ status: 'accepted' }).eq('id', invite.id)
  if (acceptError) {
    throw new Error(`Failed marking bootstrap invite accepted: ${acceptError.message}`)
  }

  console.log(`super_admin bootstrapped for ${email} in org '${INTERNAL_ORG.slug}'.`)
}

// ---- CLI entrypoint ----

/**
 * `env` is overridable so tests can exercise main() against a mocked client without touching a
 * real project or a real .env file.
 */
export async function main(env: Record<string, string> = loadEnv()): Promise<void> {
  const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const email = env.BOOTSTRAP_SUPER_ADMIN_EMAIL
  const password = env.BOOTSTRAP_SUPER_ADMIN_PASSWORD

  if (!supabaseUrl || !serviceKey) {
    throw new Error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!email || !password) {
    throw new Error('Missing BOOTSTRAP_SUPER_ADMIN_EMAIL / BOOTSTRAP_SUPER_ADMIN_PASSWORD (env-sourced, never hardcoded)')
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  await bootstrapSuperAdmin(admin, email, password)
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
