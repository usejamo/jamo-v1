// src/lib/orgDeletion.test.ts
import { describe, it, expect } from 'vitest'
import { blockReasonForOrgDeletion, superAdminBlockReason } from './orgDeletion'

describe('blockReasonForOrgDeletion', () => {
  it('allows deletion when confirm_name matches exactly and no members are super_admin', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Acme Corp',
      members: [
        { email: 'admin@acme.com', role: 'admin' },
        { email: 'user@acme.com', role: 'user' },
      ],
    })
    expect(reason).toBeNull()
  })

  it('blocks when confirm_name does not match org name', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Acme Corpp',
      members: [],
    })
    expect(reason?.code).toBe('name_mismatch')
    expect(reason?.message).toBe('Name does not match')
  })

  it('accepts a whitespace-padded confirm_name (trimmed before comparison)', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: '  Acme Corp  ',
      members: [],
    })
    expect(reason).toBeNull()
  })

  it('blocks when a single member is a super_admin and names them', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Acme Corp',
      members: [
        { email: 'aaron@example.com', role: 'super_admin' },
        { email: 'user@acme.com', role: 'user' },
      ],
    })
    expect(reason?.code).toBe('super_admin_member')
    expect(reason?.message).toBe(
      'Cannot delete: aaron@example.com is a super_admin in this organization. Move them to another organization first.'
    )
  })

  it('names ALL blocking members when multiple are super_admin', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Acme Corp',
      members: [
        { email: 'aaron@example.com', role: 'super_admin' },
        { email: 'bea@example.com', role: 'super_admin' },
        { email: 'user@acme.com', role: 'user' },
      ],
    })
    expect(reason?.code).toBe('super_admin_member')
    expect(reason?.message).toBe(
      'Cannot delete: aaron@example.com, bea@example.com are super_admins in this organization. Move them to another organization first.'
    )
  })

  it('allows deletion when an org has only admin/user members', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Acme Corp',
      members: [
        { email: 'admin@acme.com', role: 'admin' },
        { email: 'user1@acme.com', role: 'user' },
        { email: 'user2@acme.com', role: 'user' },
      ],
    })
    expect(reason).toBeNull()
  })

  it('allows deletion when an org has zero members', () => {
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Acme Corp',
      members: [],
    })
    expect(reason).toBeNull()
  })

  it('checks name confirmation before the super_admin guard', () => {
    // Name mismatch should be reported even when a super_admin is also present —
    // the caller never learns which gate would have fired next.
    const reason = blockReasonForOrgDeletion({
      orgName: 'Acme Corp',
      confirmName: 'Wrong Name',
      members: [{ email: 'aaron@example.com', role: 'super_admin' }],
    })
    expect(reason?.code).toBe('name_mismatch')
    expect(reason?.message).toBe('Name does not match')
  })
})

describe('superAdminBlockReason (what PREVIEW uses)', () => {
  // Regression: the dialog previews on open, before the user has typed the
  // confirmation name. When preview used the full guard, the empty name
  // produced 'Name does not match' every time — which both masked the real
  // super_admin reason and left the confirm button permanently unrendered,
  // so the dialog could never delete anything.
  it('does not consider the typed name at all', () => {
    expect(superAdminBlockReason([{ email: 'admin@acme.com', role: 'admin' }])).toBeNull()
  })

  it('still blocks on a super_admin member, and names them', () => {
    const reason = superAdminBlockReason([
      { email: 'aaron@example.com', role: 'super_admin' },
      { email: 'user@acme.com', role: 'user' },
    ])
    expect(reason?.code).toBe('super_admin_member')
    expect(reason?.message).toContain('aaron@example.com')
  })

  it('allows an org with no members', () => {
    expect(superAdminBlockReason([])).toBeNull()
  })

  it('agrees with the full guard once the name matches', () => {
    const members = [{ email: 'aaron@example.com', role: 'super_admin' }]
    const full = blockReasonForOrgDeletion({ orgName: 'Acme Corp', confirmName: 'Acme Corp', members })
    expect(full).toEqual(superAdminBlockReason(members))
  })
})
