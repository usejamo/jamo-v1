import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    // Rate limiting reveals nothing about whether the account exists (it applies
    // either way), so surfacing it leaks no information. Swallowing it made a real
    // failure — no email ever sent — look identical to success.
    if (resetError?.status === 429) {
      setError('Too many requests. Please wait a minute and try again.')
      setLoading(false)
      return
    }
    if (resetError) {
      // Any other failure still shows the neutral copy below, but must not be silent.
      console.error('resetPasswordForEmail failed:', resetError.status, resetError.message)
    }

    // Otherwise always show the static confirmation, regardless of whether the
    // email exists — do not reveal account existence.
    setSubmitted(true)
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Forgot password?</h1>

        {submitted ? (
          <p className="text-sm text-gray-700">
            If an account exists for that email, a reset link is on its way.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
                placeholder="you@company.com"
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
              {loading ? 'Sending...' : 'Send Reset Link'}
            </button>
          </form>
        )}

        <Link to="/login" className="text-sm text-jamo-600 hover:text-jamo-700 mt-4 inline-block">
          Back to sign in
        </Link>
      </div>
    </div>
  )
}
