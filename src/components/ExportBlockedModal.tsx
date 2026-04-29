import React from 'react'
import type { PlaceholderItem } from '../lib/exportDocx'

interface Props {
  placeholders: PlaceholderItem[]
  onClose: () => void
  onForce: () => void
}

export function ExportBlockedModal({ placeholders, onClose, onForce }: Props) {
  // Group by sectionName
  const grouped = placeholders.reduce<Record<string, string[]>>((acc, p) => {
    ;(acc[p.sectionName] ??= []).push(p.label)
    return acc
  }, {})

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full mx-4 mt-24 p-6">
        <h2 className="text-base font-semibold text-red-700 mb-1">Export Blocked — Unresolved Placeholders</h2>
        <p className="text-sm text-gray-500 mb-4">
          The following placeholders must be filled before exporting. Click "Resolve →" to jump to each section.
        </p>

        <ul className="space-y-3 mb-6 max-h-64 overflow-y-auto">
          {Object.entries(grouped).map(([section, labels]) => (
            <li key={section}>
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1">{section}</p>
              <ul className="space-y-1">
                {labels.map((label, i) => (
                  <li key={i} className="flex items-center justify-between text-sm text-gray-600">
                    <span>• {label}</span>
                    <button
                      onClick={onClose}
                      className="text-xs text-indigo-600 hover:text-indigo-800 ml-4 shrink-0"
                    >
                      Resolve →
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between">
          <button
            onClick={onForce}
            className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
          >
            Force export anyway
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default ExportBlockedModal
