import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { TemplatesTab } from '../components/settings/TemplatesTab'

// ── Shared constants ──────────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-jamo-200 focus:border-jamo-400 transition-colors'

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'SGD', 'CNY', 'INR']

const TIMEZONES = [
  'America/New_York (ET)',
  'America/Chicago (CT)',
  'America/Denver (MT)',
  'America/Los_Angeles (PT)',
  'America/Anchorage (AKT)',
  'Pacific/Honolulu (HT)',
  'Europe/London (GMT/BST)',
  'Europe/Paris (CET)',
  'Europe/Berlin (CET)',
  'Europe/Zurich (CET)',
  'Asia/Dubai (GST)',
  'Asia/Tokyo (JST)',
  'Asia/Shanghai (CST)',
  'Asia/Singapore (SGT)',
  'Australia/Sydney (AEST)',
]

// ── Integration data ──────────────────────────────────────────────────────────

type IntegrationStatus = 'connected' | 'disconnected'

interface Integration {
  name: string
  logoUrl: string
  description: string
  status: IntegrationStatus
  detail: string
}

const INTEGRATIONS: Integration[] = [
  {
    name: 'Salesforce',
    logoUrl: 'https://www.vectorlogo.zone/logos/salesforce/salesforce-icon.svg',
    description: 'CRM pipeline and opportunity management',
    status: 'connected',
    detail: 'Production Environment · Last sync 2 min ago',
  },
  {
    name: 'HubSpot',
    logoUrl: 'https://www.vectorlogo.zone/logos/hubspot/hubspot-icon.svg',
    description: 'Marketing automation and contact tracking',
    status: 'disconnected',
    detail: 'Not configured',
  },
  {
    name: 'Workday',
    logoUrl: 'https://www.vectorlogo.zone/logos/workday/workday-icon.svg',
    description: 'Financial planning and revenue recognition',
    status: 'connected',
    detail: 'Production · Financial module enabled',
  },
]

// ── Notification rows ─────────────────────────────────────────────────────────

type NotifKey =
  | 'rfpDetected'
  | 'wonLost'
  | 'deadline72h'
  | 'missedReview'
  | 'securityAlerts'
  | 'syncErrors'

const NOTIF_GROUPS: { group: string; items: { key: NotifKey; label: string; sub: string }[] }[] = [
  {
    group: 'Pipeline Events',
    items: [
      {
        key: 'rfpDetected',
        label: 'New RFP detected in Salesforce',
        sub: 'Triggers when a new RFP opportunity is synced from your Salesforce production environment.',
      },
      {
        key: 'wonLost',
        label: 'Proposal won / lost status update',
        sub: 'Notifies when a proposal status changes to Won or Lost, including the final contract value.',
      },
    ],
  },
  {
    group: 'Urgency Alerts',
    items: [
      {
        key: 'deadline72h',
        label: 'Deadline approaching (72 h)',
        sub: 'Alert fired when a proposal due date is within 72 hours and no submission has been logged.',
      },
      {
        key: 'missedReview',
        label: 'Missed internal review date',
        sub: 'Fires when a review milestone passes without a logged activity or status change.',
      },
    ],
  },
  {
    group: 'System',
    items: [
      {
        key: 'securityAlerts',
        label: 'Security login alerts',
        sub: 'Email notification sent for unrecognized sign-in attempts or new device logins.',
      },
      {
        key: 'syncErrors',
        label: 'Integration sync errors',
        sub: 'Alerts when a Salesforce or Workday sync fails to complete within the expected window.',
      },
    ],
  },
]

// ── Sub-tabs ──────────────────────────────────────────────────────────────────

const SUB_TABS = ['Profile', 'Integrations', 'General', 'Notifications', 'Templates'] as const
type SubTab = (typeof SUB_TABS)[number]

// ── Primitives ────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-widest mb-4">
      {children}
    </p>
  )
}

/** Minimalist toggle — div (not button) to avoid global button::before overlay */
function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-200 ${
        checked ? 'bg-jamo-500 hover:bg-jamo-600' : 'bg-gray-200 hover:bg-gray-300'
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </div>
  )
}

function SaveButton({ onSave, saved }: { onSave: () => void; saved: boolean }) {
  return (
    <button
      onClick={onSave}
      className="inline-flex items-center gap-2 text-sm font-medium text-white bg-jamo-500 px-4 py-2 rounded-lg transition-colors"
    >
      {saved ? (
        <>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Saved
        </>
      ) : (
        'Save Changes'
      )}
    </button>
  )
}

// ── Logo with letter-mark fallback ───────────────────────────────────────────

function IntegrationLogo({ name, logoUrl }: { name: string; logoUrl: string }) {
  const [errored, setErrored] = useState(false)

  if (errored) {
    return (
      <div className="flex items-center justify-center shrink-0" style={{ width: 24, height: 24 }}>
        <span className="text-xs font-bold text-gray-400 select-none">
          {name.slice(0, 2).toUpperCase()}
        </span>
      </div>
    )
  }

  return (
    <img
      src={logoUrl}
      alt={name}
      className="object-contain shrink-0"
      style={{ maxHeight: 24, width: 'auto' }}
      onError={() => setErrored(true)}
    />
  )
}

// ── Integration card ──────────────────────────────────────────────────────────

function IntegrationCard({ integration }: { integration: Integration }) {
  const connected = integration.status === 'connected'

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4 transition-all hover:shadow-sm hover:border-gray-300 active:scale-[0.97]">
      <div className="flex items-center gap-3">
        <IntegrationLogo name={integration.name} logoUrl={integration.logoUrl} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{integration.name}</p>
            {connected && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-green-600">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                Connected
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{integration.description}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        <p className="text-[11px] text-gray-400">{integration.detail}</p>
        {connected ? (
          <button className="inline-flex items-center text-xs font-medium text-gray-600 hover:text-gray-800 border border-gray-200 px-3 py-1.5 rounded-lg transition-colors">
            Manage
          </button>
        ) : (
          <button className="inline-flex items-center text-xs font-medium text-jamo-600 hover:text-jamo-700 border border-jamo-200 hover:border-jamo-300 px-3 py-1.5 rounded-lg transition-colors">
            Connect
          </button>
        )}
      </div>
    </div>
  )
}

// ── Profile tab ──────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user, profile } = useAuth()

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">User Profile</h3>
        <div className="bg-gray-50 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <div className="text-gray-900">{profile?.full_name || 'Not set'}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <div className="text-gray-900">{user?.email}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <div className="text-gray-900">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-jamo-100 text-jamo-800">
                {profile?.role || 'user'}
              </span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Organization ID</label>
            <div className="text-gray-500 text-sm font-mono">{profile?.org_id || 'Not assigned'}</div>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">About Roles</h3>
        <p className="text-sm text-gray-600">
          <strong>Admin:</strong> Can manage organization settings and users.<br />
          <strong>User:</strong> Can create and manage proposals.<br />
          <strong>Super Admin:</strong> Platform-level access (Jamo staff only).
        </p>
      </div>
    </div>
  )
}

// ── General tab ───────────────────────────────────────────────────────────────

function GeneralTab() {
  const [form, setForm] = useState({
    companyName: 'Jamo Clinical Research',
    hqLocation: 'Boston, MA, USA',
    currency: 'USD',
    timezone: 'America/New_York (ET)',
    taxId: 'US-47-1234567',
  })
  const [saved, setSaved] = useState(false)

  function set(field: keyof typeof form, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

      {/* Organization */}
      <div className="p-6">
        <SectionLabel>Organization</SectionLabel>
        <div className="space-y-4 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Company Name</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={form.companyName}
              onChange={e => set('companyName', e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">HQ Location</label>
            <input
              type="text"
              className={INPUT_CLASS}
              value={form.hqLocation}
              onChange={e => set('hqLocation', e.target.value)}
              placeholder="City, State, Country"
            />
          </div>
        </div>
      </div>

      {/* Localization */}
      <div className="p-6">
        <SectionLabel>Localization</SectionLabel>
        <div className="grid grid-cols-2 gap-4 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Default Currency</label>
            <select
              className={INPUT_CLASS}
              value={form.currency}
              onChange={e => set('currency', e.target.value)}
            >
              {CURRENCIES.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Timezone</label>
            <select
              className={INPUT_CLASS}
              value={form.timezone}
              onChange={e => set('timezone', e.target.value)}
            >
              {TIMEZONES.map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Finance */}
      <div className="p-6">
        <SectionLabel>Finance</SectionLabel>
        <div className="max-w-lg">
          <label className="block text-xs font-medium text-gray-500 mb-1.5">Tax / VAT ID</label>
          <input
            type="text"
            className={INPUT_CLASS}
            value={form.taxId}
            onChange={e => set('taxId', e.target.value)}
            placeholder="e.g. US-47-1234567"
          />
          <div className="flex items-center gap-1.5 mt-2">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
            <span className="text-[11px] text-gray-400">
              Linked to Workday · Production Financial module
            </span>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-end bg-gray-50 rounded-b-xl">
        <SaveButton onSave={handleSave} saved={saved} />
      </div>

    </div>
  )
}

// ── Notifications tab ─────────────────────────────────────────────────────────

function NotificationsTab() {
  const [notifs, setNotifs] = useState<Record<NotifKey, boolean>>({
    rfpDetected:    true,
    wonLost:        true,
    deadline72h:    true,
    missedReview:   false,
    securityAlerts: true,
    syncErrors:     true,
  })
  const [saved, setSaved] = useState(false)

  function toggle(key: NotifKey) {
    setNotifs(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">

      {NOTIF_GROUPS.map(group => (
        <div key={group.group} className="p-6">
          <SectionLabel>{group.group}</SectionLabel>
          <div className="space-y-0 divide-y divide-gray-50">
            {group.items.map((item, i) => (
              <div
                key={item.key}
                className={`flex items-start justify-between gap-6 py-3.5 ${i === 0 ? 'pt-0' : ''}`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{item.sub}</p>
                </div>
                <div className="pt-0.5 shrink-0">
                  <Toggle checked={notifs[item.key]} onChange={() => toggle(item.key)} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Footer */}
      <div className="px-6 py-4 flex items-center justify-end bg-gray-50 rounded-b-xl">
        <SaveButton onSave={handleSave} saved={saved} />
      </div>

    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const { profile } = useAuth()
  const [activeTab, setActiveTab] = useState<SubTab>('Profile')

  const visibleTabs = SUB_TABS.filter(tab =>
    tab !== 'Templates' || profile?.role === 'admin' || profile?.role === 'super_admin'
  )

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your workspace configuration</p>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-gray-200 pb-0">
        {visibleTabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`inline-flex items-center px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition-colors ${
              activeTab === tab
                ? 'text-jamo-600 border-jamo-500'
                : 'text-gray-500 border-transparent hover:text-gray-800'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Profile */}
      {activeTab === 'Profile' && <ProfileTab />}

      {/* Integrations */}
      {activeTab === 'Integrations' && (
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-gray-800">Connected platforms</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Manage the tools jamo syncs with to keep your proposal data up to date.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-5">
            {INTEGRATIONS.map(integration => (
              <IntegrationCard key={integration.name} integration={integration} />
            ))}
          </div>
        </div>
      )}

      {/* General */}
      {activeTab === 'General' && <GeneralTab />}

      {/* Notifications */}
      {activeTab === 'Notifications' && <NotificationsTab />}

      {/* Templates (admin only) */}
      {activeTab === 'Templates' && <TemplatesTab />}

    </div>
  )
}
