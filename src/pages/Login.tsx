import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [orgId, setOrgId] = useState('00000000-0000-0000-0000-000000000001') // Default to Org A
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (isSignUp) {
        // Sign up flow
        const { data, error: signUpError } = await signUp(email, password, {
          full_name: fullName,
          org_id: orgId,
          role: 'user'
        })

        if (signUpError) {
          setError(signUpError.message || 'An error occurred during sign up')
          setLoading(false)
          return
        }

        // Success - navigate to home (session created automatically)
        if (data) {
          navigate('/')
        }
      } else {
        // Sign in flow
        const { data, error: signInError } = await signIn(email, password)

        if (signInError) {
          // Handle different error types
          if (signInError.status === 400 || signInError.message?.includes('Invalid')) {
            setError('Invalid login credentials')
          } else {
            setError(signInError.message || 'An error occurred during sign in')
          }
          setLoading(false)
          return
        }

        // Success - navigate to home
        if (data) {
          navigate('/')
        }
      }
    } catch (err) {
      setError('An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">
          {isSignUp ? 'Sign Up for Jamo' : 'Sign In to Jamo'}
        </h1>

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
              placeholder="Enter your password"
              disabled={loading}
            />
          </div>

          {isSignUp && (
            <>
              <div>
                <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
                  placeholder="John Doe"
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="org" className="block text-sm font-medium text-gray-700 mb-1">
                  Organization (for testing)
                </label>
                <select
                  id="org"
                  value={orgId}
                  onChange={(e) => setOrgId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-jamo-200 focus:border-jamo-500 outline-none"
                  disabled={loading}
                >
                  <option value="00000000-0000-0000-0000-000000000001">Test Org A</option>
                  <option value="00000000-0000-0000-0000-000000000002">Test Org B</option>
                </select>
              </div>
            </>
          )}

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
            {loading ? (isSignUp ? 'Signing up...' : 'Signing in...') : (isSignUp ? 'Sign Up' : 'Sign In')}
          </button>
        </form>

        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={() => {
              setIsSignUp(!isSignUp)
              setError(null)
            }}
            className="text-sm text-jamo-600 hover:text-jamo-700"
          >
            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
          </button>
        </div>
      </div>
    </div>
  )
}
