import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// D-14: exact error copy — never render raw Salesforce error responses
const SF_ERROR_COPY: Record<string, string> = {
  user_denied: 'Salesforce authorization was cancelled. Please try again.',
  state_mismatch: 'The connection request expired or was tampered with. Please try again.',
  token_exchange_failed: 'Could not complete the Salesforce connection. Please try again or contact support.',
  userinfo_failed: 'Connected to Salesforce but could not retrieve org details. Please try again.',
  unknown: 'Something went wrong connecting to Salesforce. Please try again.',
}

interface SalesforceConnectionRow {
  sf_username: string
  is_sandbox: boolean
}

export function SalesforceConnection() {
  const { profile } = useAuth()
  const orgId = profile?.org_id
  const [searchParams] = useSearchParams()

  const [connection, setConnection] = useState<SalesforceConnectionRow | null>(null)
  const [fetchLoading, setFetchLoading] = useState(true)
  const [isSandbox, setIsSandbox] = useState(false) // Production default
  const [loading, setLoading] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // D-15: Read sf_error on mount, strip from URL immediately
  useEffect(() => {
    const sfErr = searchParams.get('sf_error')
    if (sfErr) {
      setError(SF_ERROR_COPY[sfErr] ?? SF_ERROR_COPY['unknown'])
      window.history.replaceState(
        {},
        '',
        window.location.pathname +
          window.location.search
            .replace(/[?&]sf_error=[^&]*/g, '')
            .replace(/^&/, '?')
      )
    }
  }, []) // run once on mount only

  // D-16: graceful degradation — error on fetch = disconnected state, never throws
  useEffect(() => {
    if (!orgId) return
    setFetchLoading(true)
    supabase
      .from('salesforce_connections')
      .select('sf_username, is_sandbox')
      .eq('org_id', orgId)
      .maybeSingle()
      .then(({ data, error }) => {
        // D-16: never throw — error or null result = disconnected state
        setConnection(data ?? null)
        setFetchLoading(false)
      })
  }, [orgId])

  const handleConnect = async () => {
    if (!orgId) return  // WR-03: profile not yet loaded — prevent undefined org_id
    setLoading(true)
    setError(null)
    const { data, error } = await supabase.functions.invoke('salesforce-oauth-initiate', {
      body: { org_id: orgId, is_sandbox: isSandbox },
    })
    if (error || !data?.auth_url) {
      setError(SF_ERROR_COPY['unknown'])
      setLoading(false)
      return
    }
    window.location.href = data.auth_url
    // loading stays true — browser is navigating away
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    const { error } = await supabase.functions.invoke('salesforce-oauth-disconnect', {
      body: { org_id: orgId },
    })
    if (error) {
      setError(SF_ERROR_COPY['unknown'])
      setDisconnecting(false)
      return
    }
    setConnection(null)
    setDisconnecting(false)
  }

  const isConnected = connection !== null

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
      {/* Header row — always shown */}
      <div className="flex items-center gap-3">
        <img
          src="https://www.vectorlogo.zone/logos/salesforce/salesforce-icon.svg"
          alt="Salesforce"
          className="max-h-6 object-contain shrink-0"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Salesforce</span>
            {isConnected && (
              <span className="flex items-center gap-1 text-[11px] font-medium text-green-600">
                <span
                  className="w-1.5 h-1.5 rounded-full bg-green-500"
                  aria-label="Salesforce connected"
                />
                Connected
              </span>
            )}
          </div>
          <span className="text-xs text-gray-500 mt-0.5 block">
            CRM pipeline and opportunity management
          </span>
        </div>
      </div>

      {/* Inline error banner — above footer divider */}
      {error && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3 text-xs text-red-700"
        >
          {/* Warning icon — exclamation triangle, 14px */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="text-red-500 shrink-0 mt-0.5"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
          <span className="flex-1 leading-relaxed">{error}</span>
          <button
            aria-label="Dismiss error"
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-600 shrink-0"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}

      {/* Footer row */}
      <div className="flex items-center justify-between pt-3 border-t border-gray-100">
        {fetchLoading ? (
          /* Loading skeleton — entire footer replaced with animate-pulse placeholder */
          <div className="h-8 bg-gray-100 rounded animate-pulse w-full" />
        ) : isConnected ? (
          /* Connected state */
          <>
            <span className="text-[11px] text-gray-400">{connection.sf_username}</span>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className={`text-xs font-medium text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition-colors${disconnecting ? ' opacity-60' : ''}`}
            >
              {disconnecting ? (
                <span role="status" aria-label="Loading" className="inline-flex items-center gap-1.5">
                  <svg
                    className="animate-spin text-red-500"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Disconnecting…
                </span>
              ) : (
                'Disconnect'
              )}
            </button>
          </>
        ) : (
          /* Disconnected state */
          <>
            {/* Radio group: Production / Sandbox */}
            <div className="flex items-center gap-4" role="group" aria-label="Salesforce environment">
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="radio"
                  name="sf-env"
                  value="production"
                  checked={!isSandbox}
                  onChange={() => setIsSandbox(false)}
                />
                Production
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-600">
                <input
                  type="radio"
                  name="sf-env"
                  value="sandbox"
                  checked={isSandbox}
                  onChange={() => setIsSandbox(true)}
                />
                Sandbox
              </label>
            </div>

            {/* Connect button */}
            <button
              onClick={handleConnect}
              disabled={loading || fetchLoading || !orgId}
              className={`text-xs font-medium text-jamo-600 hover:text-jamo-700 border border-jamo-200 hover:border-jamo-300 px-3 py-1.5 rounded-lg transition-colors${(loading || fetchLoading || !orgId) ? ' opacity-60' : ''}`}
            >
              {loading ? (
                <span role="status" aria-label="Loading" className="inline-flex items-center gap-1.5">
                  <svg
                    className="animate-spin text-jamo-500"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                  Connecting…
                </span>
              ) : (
                'Connect Salesforce'
              )}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
