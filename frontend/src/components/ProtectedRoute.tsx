import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: string[]
}

function ProtectedRoute({
  children,
  allowedRoles,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth()

  // Wait until authentication state has been loaded.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  // User is not logged in.
  if (!user) {
    return <Navigate to="/" replace />
  }

  // User is logged in but does not have the required role.
  if (
    allowedRoles &&
    !user.roles.some((role) => allowedRoles.includes(role))
  ) {
    return <Navigate to="/" replace />
  }

  // User is authenticated and has the required role.
  return <>{children}</>
}

export default ProtectedRoute