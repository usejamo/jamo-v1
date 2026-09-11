import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export const DEBUG_MODE_STORAGE_KEY = 'jamo_debug_mode'

// GATE: super_admin only. This toggle was previously rendered for everyone, so
// clients and org admins could see and flip it.
//
// Extracted from ProposalsList into its own self-gating component to match
// SaveAsDemoFixtureButton/DemoRunSurface, which gate the same way — the role
// check lives with the control rather than in the page that happens to place it.
//
// SCOPE: this is a visibility control, not an access control. Debug mode is a
// localStorage flag read by useProposalGeneration to generate 1-2 sentences per
// section, so anyone who knows the key can still set it by hand. That is
// acceptable — the flag only makes generation cheaper and shorter, it does not
// unlock data or privileged behaviour. If it ever gates something that matters,
// it needs a server-side check, not this.
export function DebugModeToggle() {
  const { profile } = useAuth()
  const [debugMode, setDebugMode] = useState(
    () => localStorage.getItem(DEBUG_MODE_STORAGE_KEY) === 'true'
  )

  const isSuperAdmin = profile?.role === 'super_admin'

  // Clear a stranded flag. Anyone who switched debug on before this gate
  // existed still has 'true' in localStorage, and useProposalGeneration reads
  // it — so without this they would keep getting 1-2 sentence sections with the
  // control that turns it off now hidden from them.
  useEffect(() => {
    if (!isSuperAdmin && localStorage.getItem(DEBUG_MODE_STORAGE_KEY) !== null) {
      localStorage.removeItem(DEBUG_MODE_STORAGE_KEY)
      setDebugMode(false)
    }
  }, [isSuperAdmin])

  // Defaults to hidden while the profile is still loading, which is the safe
  // direction for hiding a control: a legitimate super_admin sees it a beat
  // late, rather than everyone else glimpsing it and it vanishing.
  if (!isSuperAdmin) return null

  return (
    <button
      onClick={() => {
        const next = !debugMode
        setDebugMode(next)
        if (next) {
          localStorage.setItem(DEBUG_MODE_STORAGE_KEY, 'true')
        } else {
          localStorage.removeItem(DEBUG_MODE_STORAGE_KEY)
        }
      }}
      title="Debug mode: generates 1-2 sentences per section to save cost"
      data-testid="debug-mode-toggle"
      className={`text-xs font-medium px-3 py-2 rounded-xl border transition-colors ${
        debugMode
          ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-600'
      }`}
    >
      {debugMode ? 'Debug ON' : 'Debug'}
    </button>
  )
}
