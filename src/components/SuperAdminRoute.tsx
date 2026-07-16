import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function SuperAdminRoute() {
  const { session, profile, profileLoaded, loading } = useAuth()

  // Wait while auth is resolving, OR while a session exists but its profile
  // fetch hasn't completed yet. Without the profileLoaded guard, a render where
  // the session has landed but the profile is still null would falsely redirect
  // a legitimate super_admin. Bounded: once profileLoaded is true it falls
  // through to the role check, so a genuinely missing profile still redirects.
  if (loading || (session && !profileLoaded)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    )
  }

  // Redirect to home if not a super_admin
  if (!profile || profile.role !== 'super_admin') {
    return <Navigate to="/" replace />
  }

  // Render child routes if super_admin
  return <Outlet />
}
