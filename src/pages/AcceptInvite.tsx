import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// This page is identified purely by its ROUTE (/accept-invite), never by inspecting
// auth state or onAuthStateChange event type. Invite links (implicit flow) establish a
// session the instant they're clicked, before a password is set — this route forces the
// set-password step regardless of which auth event fired. See 15-RESEARCH.md Pitfall 1/2.
export default function AcceptInvite() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    let cancelled = false

    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setHasSession(!!data.session)
      setCheckingSession(false)
    })

    return () => {
      cancelled = true
    }
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)

    try {
      const { error: updateError } = await supabase.auth.updateUser({ password })

      if (updateError) {
        setError(updateError.message || 'An error occurred while setting your password')
        setLoading(false)
        return
      }

      // Mark the invite 'accepted' so it clears from the admin's Pending Invites
      // list. The invitee has no RLS write on invites, so a service-role edge
      // function performs the own-invite-scoped update. Non-blocking: a failure
      // here must not trap the user on this page — worst case the invite stays
      // pending, which is the pre-existing behavior.
      const { error: acceptError } = await supabase.functions.invoke('accept-invite')
      if (acceptError) {
        console.error('Failed to mark invite accepted:', acceptError)
      }

      navigate('/')
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        {checkingSession ? (
          <div className="text-gray-500 text-sm">Loading...</div>
        ) : !hasSession ? (
          <>
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Set Your Password</h1>
            <p className="text-sm text-gray-700">
              This invite link is invalid or has expired. Ask your admin to resend it.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-semibold text-gray-900 mb-6">Set Your Password</h1>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
                  placeholder="Enter a password"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
                  placeholder="Re-enter the password"
                  disabled={loading}
                />
              </div>

              {error && (
                <div className="text-red-600 text-sm mt-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-jamo-500 hover:bg-jamo-600 text-white font-medium py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Setting Password...' : 'Set Password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
