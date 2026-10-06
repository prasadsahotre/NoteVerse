function AdminDashboard() {
  return (
    <div className="min-h-screen bg-slate-950 px-6 py-12 text-white">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm uppercase tracking-wider text-indigo-400">
          Administrator
        </p>

        <h1 className="mt-2 text-4xl font-bold">
          Admin Dashboard
        </h1>

        <p className="mt-4 text-slate-400">
          Manage users, courses, reports, and platform activity.
        </p>
      </div>
    </div>
  )
}

export default AdminDashboard