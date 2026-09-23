import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

// Matches the live project's password_min_length auth setting.
const MIN_PASSWORD_LENGTH = 6

const INPUT_CLASS =
  'w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-jamo-200 focus:border-jamo-400 transition-colors'

export function ChangePasswordSection() {
  const { user } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleChangePassword() {
    setError(null)
    setSuccess(false)

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Please fill in all three fields')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError(`New password must be at least ${MIN_PASSWORD_LENGTH} characters`)
      return
    }
    if (newPassword === currentPassword) {
      setError('New password must be different from your current password')
      return
    }
    if (!user?.email) {
      setError('Could not determine your account email')
      return
    }

    setSaving(true)

    // The live project has security_update_password_require_reauthentication: false
    // and security_update_password_require_current_password: false, so Supabase
    // itself will happily change a password from nothing but a live session. This
    // current-password check is OURS, and it is what stops someone at an
    // unattended logged-in laptop from taking over the account. Re-verifying via
    // signInWithPassword returns a fresh session for the same user — that's
    // expected and harmless — we only proceed to updateUser if it succeeds.
    const { error: verifyError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })
    if (verifyError) {
      setSaving(false)
      setError('Current password is incorrect')
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    setSaving(false)

    if (updateError) {
      setError(updateError.message || 'Failed to change password')
      return
    }

    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    setSuccess(true)
  }

  return (
    <div className="border-t border-gray-200 pt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Change Password</h3>
      <div className="bg-gray-50 rounded-lg p-6 space-y-4 max-w-sm">
        <div>
          <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Current Password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className={INPUT_CLASS}
            disabled={saving}
          />
        </div>
        <div>
          <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={INPUT_CLASS}
            disabled={saving}
          />
        </div>
        <div>
          <label htmlFor="confirmNewPassword" className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password
          </label>
          <input
            id="confirmNewPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={INPUT_CLASS}
            disabled={saving}
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-600">Password updated</p>}

        <button
          onClick={handleChangePassword}
          disabled={saving}
          className="inline-flex items-center text-sm font-medium text-white bg-jamo-500 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </div>
    </div>
  )
}
