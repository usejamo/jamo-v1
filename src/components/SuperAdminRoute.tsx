import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export function SuperAdminRoute() {
  const { profile, loading } = useAuth()

  // Show nothing while checking auth state
  if (loading) {
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
