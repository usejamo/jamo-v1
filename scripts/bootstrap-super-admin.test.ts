// scripts/bootstrap-super-admin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bootstrapSuperAdmin, INTERNAL_ORG } from './bootstrap-super-admin'

/**
 * Minimal chainable Supabase query-builder mock. Each call records itself onto `calls` so tests
 * can assert both WHICH operations ran and the ORDER they ran in, without a real Supabase client.
 */
function makeMockAdmin(opts: { existingSuperAdmin: boolean }) {
  const calls: string[] = []
  const createUser = vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null }))

  const from = vi.fn((table: string) => {
    if (table === 'user_profiles') {
      return {
        select: () => ({
          eq: () => ({
            limit: async () => {
              calls.push('select:user_profiles')
              return {
                data: opts.existingSuperAdmin ? [{ id: 'existing-super-admin' }] : [],
                error: null,
              }
            },
          }),
        }),
      }
    }
    if (table === 'organizations') {
      return {
        upsert: () => ({
          select: () => ({
            single: async () => {
              calls.push('upsert:organizations')
              return { data: { id: 'org-1', ...INTERNAL_ORG }, error: null }
            },
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
              return { data: { id: 'invite-1', ...row }, error: null }
            },
          }),
        }),
        update: (row: Record<string, unknown>) => ({
          eq: async () => {
            calls.push(`update:invites:${row.status}`)
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
          return createUser(args)
        },
      },
    },
  }

  return { admin, calls, createUser }
}

describe('bootstrapSuperAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('skips entirely WITHOUT calling createUser when a super_admin already exists', async () => {
    const { admin, calls, createUser } = makeMockAdmin({ existingSuperAdmin: true })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bootstrapSuperAdmin(admin as any, 'admin@jamo.internal', 'test-password')

    expect(calls).toEqual(['select:user_profiles'])
    expect(createUser).not.toHaveBeenCalled()
  })

  it('runs upsert(org) -> insert(invite pending) -> createUser -> update(invite accepted) in order', async () => {
    const { admin, calls, createUser } = makeMockAdmin({ existingSuperAdmin: false })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await bootstrapSuperAdmin(admin as any, 'admin@jamo.internal', 'test-password')

    expect(calls).toEqual([
      'select:user_profiles',
      'upsert:organizations',
      'insert:invites:pending',
      'auth.admin.createUser',
      'update:invites:accepted',
    ])
    expect(createUser).toHaveBeenCalledWith({
      email: 'admin@jamo.internal',
      password: 'test-password',
      email_confirm: true,
    })
  })
})
