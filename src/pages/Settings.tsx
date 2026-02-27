import { useState } from 'react'

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

// ── Sub-tabs ──────────────────────────────────────────────────────────────────

const SUB_TABS = ['Integrations', 'General', 'Notifications'] as const
type SubTab = (typeof SUB_TABS)[number]

// ── Logo with letter-mark fallback ───────────────────────────────────────────
// Uses vectorlogo.zone SVGs. Falls back to initials if the image fails to load.

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
      {/* Logo + name row */}
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

      {/* Footer row */}
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

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SubTab>('Integrations')

  return (
    <div className="space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your workspace configuration</p>
      </div>

      {/* Sub-tab navigation */}
      <div className="flex gap-1 border-b border-gray-200 pb-0">
        {SUB_TABS.map(tab => (
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

      {/* Integrations view */}
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

      {/* Placeholder sub-views */}
      {activeTab !== 'Integrations' && (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-sm font-medium text-gray-500">{activeTab} settings</p>
          <p className="text-xs text-gray-400 mt-1">Coming soon</p>
        </div>
      )}

    </div>
  )
}
