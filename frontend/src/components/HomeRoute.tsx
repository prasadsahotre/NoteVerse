import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import HomePage from '../pages/HomePage'

function HomeRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  if (user?.roles.includes('STUDENT')) {
    return <Navigate to="/student" replace />
  }

  return <HomePage />
}

export default HomeRoute