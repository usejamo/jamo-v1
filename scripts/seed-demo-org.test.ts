// scripts/seed-demo-org.test.ts
// NOTE: every credential in this file is a fake placeholder. The real presenter credentials
// live only in env (DEMO_PRESENTER_EMAIL / DEMO_PRESENTER_PASSWORD) and must never appear here.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { seedDemoOrg, DEMO_ORG } from './seed-demo-org'

const FAKE_EMAIL = 'presenter@example.invalid'
const FAKE_PASSWORD = 'placeholder-not-a-real-secret'

/**
 * Minimal chainable Supabase query-builder mock (same convention as
 * scripts/bootstrap-super-admin.test.ts). Each call records itself onto `calls` so tests can
 * assert both WHICH operations ran and the ORDER they ran in, with no real Supabase client.
 */
function makeMockAdmin(opts: {
  demoOrgExists: boolean
  demoPresenterExists: boolean
  createUserError?: { message: string }
}) {
  const calls: string[] = []
  const upsertArgs: Record<string, unknown>[] = []
  const inviteInserts: Record<string, unknown>[] = []
  const inviteUpdates: Record<string, unknown>[] = []
  const createUser = vi.fn(async () => ({
    data: opts.createUserError ? { user: null } : { user: { id: 'user-1' } },
    error: opts.createUserError ?? null,
  }))

  const from = vi.fn((table: string) => {
    if (table === 'organizations') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => {
              calls.push('select:organizations')
              return { data: opts.demoOrgExists ? { id: 'demo-org-1' } : null, error: null }
            },
          }),
        }),
        upsert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              calls.push('upsert:organizations')
              upsertArgs.push(row)
              return { data: { id: 'demo-org-1', ...row }, error: null }
            },
          }),
        }),
      }
    }
    if (table === 'user_profiles') {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              limit: async () => {
                calls.push('select:user_profiles')
                return {
                  data: opts.demoPresenterExists ? [{ id: 'existing-demo-presenter' }] : [],
                  error: null,
                }
              },
            }),
          }),
        }),
      }
    }
    if (table === 'invites') {
      return {
        insert: (row: Record<string, unknown>) => ({
          select: () => ({
            single: async () => {
              calls.push(`insert:invites:${row.status}`)
              inviteInserts.push(row)
              return { data: { id: 'invite-1', ...row }, error: null }
            },
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => {
            calls.push(`update:invites:${row.status}`)
            inviteUpdates.push(row)
            return { error: null }
          },
        }),
      }
    }
    throw new Error(`Unexpected table in mock: ${table}`)
  })

  const admin = {
    from,
    auth: {
      admin: {
        createUser: async (args: unknown) => {
          calls.push('auth.admin.createUser')
          return createUser(args as never)
        },
      },
    },
  }

  return { admin, calls, createUser, upsertArgs, inviteInserts, inviteUpdates }
}

describe('seedDemoOrg', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('short-circuits WITHOUT calling createUser when a super_admin already exists in the demo org', async () => {
    const { admin, calls, createUser } = makeMockAdmin({ demoOrgExists: true, demoPresenterExists: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedDemoOrg(admin as any, FAKE_EMAIL, FAKE_PASSWORD)

    expect(calls).toEqual(['select:organizations', 'select:user_profiles'])
    expect(createUser).not.toHaveBeenCalled()
  })

  it('runs org lookup -> upsert(org) -> insert(invite pending) -> createUser -> update(invite accepted) in order', async () => {
    const { admin, calls, createUser } = makeMockAdmin({ demoOrgExists: false, demoPresenterExists: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedDemoOrg(admin as any, FAKE_EMAIL, FAKE_PASSWORD)

    expect(calls).toEqual([
      'select:organizations',
      'upsert:organizations',
      'insert:invites:pending',
      'auth.admin.createUser',
      'update:invites:accepted',
    ])
    expect(createUser).toHaveBeenCalledWith({
      email: FAKE_EMAIL,
      password: FAKE_PASSWORD,
      email_confirm: true,
    })
  })

  it('still seeds the presenter when the demo org row exists but carries no super_admin yet', async () => {
    const { admin, calls } = makeMockAdmin({ demoOrgExists: true, demoPresenterExists: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedDemoOrg(admin as any, FAKE_EMAIL, FAKE_PASSWORD)

    expect(calls).toEqual([
      'select:organizations',
      'select:user_profiles',
      'upsert:organizations',
      'insert:invites:pending',
      'auth.admin.createUser',
      'update:invites:accepted',
    ])
  })

  it('upserts the demo org with is_demo=true and invites the presenter as super_admin', async () => {
    const { admin, upsertArgs, inviteInserts } = makeMockAdmin({
      demoOrgExists: false,
      demoPresenterExists: false,
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await seedDemoOrg(admin as any, FAKE_EMAIL, FAKE_PASSWORD)

    expect(upsertArgs[0]).toMatchObject({ slug: DEMO_ORG.slug, feature_flags: { is_demo: true } })
    expect(inviteInserts[0]).toMatchObject({
      email: FAKE_EMAIL,
      org_id: 'demo-org-1',
      role: 'super_admin',
      status: 'pending',
    })
  })

  it('revokes the pending invite and throws an actionable error when the auth account already exists', async () => {
    const { admin, calls, inviteUpdates } = makeMockAdmin({
      demoOrgExists: true,
      demoPresenterExists: false,
      createUserError: { message: 'A user with this email address has already been registered' },
    })

    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      seedDemoOrg(admin as any, FAKE_EMAIL, FAKE_PASSWORD)
    ).rejects.toThrow(/already exists for the configured DEMO_PRESENTER_EMAIL/)

    expect(inviteUpdates).toEqual([{ status: 'revoked' }])
    expect(calls).not.toContain('update:invites:accepted')
  })
})
