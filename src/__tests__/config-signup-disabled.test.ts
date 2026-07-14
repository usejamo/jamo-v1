// src/__tests__/config-signup-disabled.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// Static guard for req 1 (no local/prod signup divergence) and the Resend SMTP /
// redirect allow-list wiring from 15-02. Reads the committed config.toml as text —
// no Supabase CLI/runtime dependency, runtime should stay well under 1s.
describe('supabase/config.toml — signup disabled + Resend SMTP', () => {
  const configPath = resolve(process.cwd(), 'supabase/config.toml')
  const configText = readFileSync(configPath, 'utf8')

  it('does not contain enable_signup = true anywhere', () => {
    expect(configText).not.toContain('enable_signup = true')
  })

  it('has enable_signup = false present (both [auth] and [auth.email] sections)', () => {
    const matches = configText.match(/enable_signup = false/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it('points custom SMTP at Resend', () => {
    expect(configText).toContain('smtp.resend.com')
  })

  it('references the SMTP password via env var, never a literal secret', () => {
    expect(configText).toContain('env(RESEND_SMTP_PASSWORD)')
    expect(configText).not.toMatch(/\bre_[A-Za-z0-9]{8,}\b/)
    expect(configText).not.toMatch(/\bsbp_[A-Za-z0-9]{8,}\b/)
  })

  it('allow-lists the accept-invite auth redirect route', () => {
    expect(configText).toContain('accept-invite')
  })
})
