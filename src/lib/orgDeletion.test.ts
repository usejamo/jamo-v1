// src/lib/orgDeletion.test.ts
import { describe, it, expect } from 'vitest'
import { blockReasonForOrgDeletion } from './orgDeletion'

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
    expect(reason).toBe('Name does not match')
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
    expect(reason).toBe(
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
    expect(reason).toBe(
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
    expect(reason).toBe('Name does not match')
  })
})
