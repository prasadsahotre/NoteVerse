import { useAuth } from '../auth/useAuth'
import { useNavigate } from 'react-router-dom'

function EducatorDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  if (user?.educatorApprovalStatus === 'PENDING') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="max-w-xl rounded-2xl border border-amber-400/20 bg-amber-400/5 p-8 text-center">
          <h1 className="text-3xl font-bold">Application under review</h1>
          <p className="mt-4 text-slate-300">Your educator application is pending admin approval. You can access educator authoring features after approval.</p>
          <button onClick={handleLogout} className="mt-6 rounded-lg border border-white/15 px-4 py-2 font-medium text-slate-200 hover:bg-white/5">
            Logout
          </button>
        </section>
      </div>
    )
  }

  if (user?.educatorApprovalStatus === 'REJECTED') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <section className="max-w-xl rounded-2xl border border-red-400/20 bg-red-400/5 p-8 text-center">
          <h1 className="text-3xl font-bold">Application not approved</h1>
          <p className="mt-4 text-slate-300">Your educator application was not approved. Educator authoring features are unavailable.</p>
          <button onClick={handleLogout} className="mt-6 rounded-lg border border-white/15 px-4 py-2 font-medium text-slate-200 hover:bg-white/5">
            Logout
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-wider text-indigo-400">
          Educator
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          Educator Dashboard
        </h1>

        <p className="mt-4 text-slate-400">
          Manage your courses, students, and teaching activity.
        </p>
      </div>
    </div>
  )
}

export default EducatorDashboard
