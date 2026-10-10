import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiRequest } from '../api/client'
import { useAuth } from '../auth/useAuth'

interface AdminAnalytics {
  totalUsers: number
  totalStudents: number
  totalEducators: number
  totalAdmins: number
  totalCourses: number
  publishedCourses: number
  draftCourses: number
  totalEnrollments: number
  totalCertificates: number
}

interface EducatorApplication {
  id: number
  name: string
  email: string
  createdAt: string
  educatorApprovalStatus: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NOT_APPLICABLE'
}

interface ApiResponse<T> {
  success: boolean
  message?: string
  data: T
}

interface ReviewVariables {
  applicantId: number
  status: 'APPROVED' | 'REJECTED'
}

function AdminDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [rejectionCandidate, setRejectionCandidate] = useState<EducatorApplication | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

  const analyticsQuery = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const response = await apiRequest<ApiResponse<AdminAnalytics>>('/admin/analytics')
      return response.data
    },
  })

  const applicationsQuery = useQuery({
    queryKey: ['admin-educator-applications'],
    queryFn: async () => {
      const response = await apiRequest<ApiResponse<EducatorApplication[]>>('/admin/educator-applications')
      return response.data
    },
  })

  const reviewMutation = useMutation({
    mutationFn: async ({ applicantId, status }: ReviewVariables) => {
      const response = await apiRequest<ApiResponse<EducatorApplication>>(
        `/admin/educator-applications/${applicantId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        },
      )
      return { ...response, status }
    },
    onSuccess: async ({ status }) => {
      setFeedback({
        kind: 'success',
        message: `Educator application ${status.toLowerCase()} successfully.`,
      })
      setRejectionCandidate(null)
      await queryClient.invalidateQueries({ queryKey: ['admin-educator-applications'] })
    },
    onError: (error) => {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to update the educator application.',
      })
    },
  })

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 lg:py-12">
      <main className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300">NoteVerse administration</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Platform overview</h1>
            <p className="mt-2 text-sm text-slate-400 sm:text-base">Monitor platform activity and review educator applications.</p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 sm:self-auto"
          >
            Logout
          </button>
        </header>

        <section className="mt-10" aria-labelledby="platform-metrics-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Platform metrics</p>
              <h2 id="platform-metrics-heading" className="mt-2 text-xl font-semibold sm:text-2xl">At a glance</h2>
            </div>
          </div>

          {analyticsQuery.isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading platform overview...</div>
          )}
          {analyticsQuery.isError && (
            <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
              <p>{analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Unable to load platform metrics.'}</p>
              <button type="button" onClick={() => void analyticsQuery.refetch()} className="mt-4 rounded-lg border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10">Retry</button>
            </div>
          )}
          {analyticsQuery.data && (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <MetricCard label="Total users" value={analyticsQuery.data.totalUsers} tone="indigo" />
                <MetricCard label="Students" value={analyticsQuery.data.totalStudents} tone="cyan" />
                <MetricCard label="Educators" value={analyticsQuery.data.totalEducators} tone="violet" />
                <MetricCard label="Administrators" value={analyticsQuery.data.totalAdmins} tone="slate" />
                <MetricCard label="Total courses" value={analyticsQuery.data.totalCourses} tone="indigo" />
                <MetricCard label="Published courses" value={analyticsQuery.data.publishedCourses} tone="emerald" />
                <MetricCard label="Draft courses" value={analyticsQuery.data.draftCourses} tone="amber" />
                <MetricCard label="Enrollments" value={analyticsQuery.data.totalEnrollments} tone="cyan" />
                <MetricCard label="Certificates issued" value={analyticsQuery.data.totalCertificates} tone="violet" />
              </div>
              {analyticsQuery.data.totalUsers === 0 && analyticsQuery.data.totalCourses === 0 && (
                <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/70 p-4 text-sm text-slate-400">No platform activity has been recorded yet.</p>
              )}
            </>
          )}
        </section>

        <section className="mt-14" aria-labelledby="educator-applications-heading">
          <div className="mb-5 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Review queue</p>
              <h2 id="educator-applications-heading" className="mt-2 text-xl font-semibold sm:text-2xl">Educator applications</h2>
              <p className="mt-1 text-sm text-slate-400">Review pending requests to create and publish courses.</p>
            </div>
            {applicationsQuery.data && (
              <span className="text-sm text-slate-400">{applicationsQuery.data.filter((application) => application.educatorApprovalStatus === 'PENDING').length} pending</span>
            )}
          </div>

          {feedback && (
            <div role={feedback.kind === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${feedback.kind === 'success' ? 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200' : 'border-red-400/20 bg-red-400/[0.07] text-red-200'}`}>
              {feedback.message}
              <button type="button" onClick={() => setFeedback(null)} className="ml-3 font-semibold underline underline-offset-2">Dismiss</button>
            </div>
          )}

          {applicationsQuery.isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading educator applications...</div>
          )}
          {applicationsQuery.isError && (
            <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
              <p>{applicationsQuery.error instanceof Error ? applicationsQuery.error.message : 'Unable to load educator applications.'}</p>
              <button type="button" onClick={() => void applicationsQuery.refetch()} className="mt-4 rounded-lg border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10">Retry</button>
            </div>
          )}
          {applicationsQuery.data?.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400/10 text-xl text-emerald-300" aria-hidden="true">✓</div>
              <h3 className="mt-4 font-semibold text-slate-100">No educator applications</h3>
              <p className="mt-1 text-sm text-slate-400">New applications will appear here for review.</p>
            </div>
          )}
          {applicationsQuery.data && applicationsQuery.data.length > 0 && (
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(130px,0.8fr)_minmax(190px,0.9fr)] gap-4 border-b border-slate-800 bg-slate-800/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-300 md:grid">
                <span>Applicant</span><span>Email</span><span>Status</span><span className="text-right">Actions</span>
              </div>
              <div className="divide-y divide-slate-800">
                {applicationsQuery.data.map((application) => (
                  <article key={application.id} className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_minmax(130px,0.8fr)_minmax(190px,0.9fr)] md:items-center">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-100" title={application.name}>{application.name}</p>
                      <p className="mt-1 text-xs text-slate-500">Applied {new Date(application.createdAt).toLocaleDateString()}</p>
                    </div>
                    <p className="break-all text-sm text-slate-300">{application.email}</p>
                    <div>
                      <StatusBadge status={application.educatorApprovalStatus} />
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      {application.educatorApprovalStatus === 'PENDING' ? (
                        <>
                          <button
                            type="button"
                            onClick={() => { setFeedback(null); reviewMutation.reset(); reviewMutation.mutate({ applicantId: application.id, status: 'APPROVED' }) }}
                            disabled={reviewMutation.isPending}
                            className="rounded-lg border border-emerald-400/25 bg-emerald-400/10 px-3 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-wait disabled:opacity-50"
                          >
                            {reviewMutation.isPending && reviewMutation.variables?.applicantId === application.id && reviewMutation.variables.status === 'APPROVED' ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setFeedback(null); reviewMutation.reset(); setRejectionCandidate(application) }}
                            disabled={reviewMutation.isPending}
                            className="rounded-lg border border-red-400/25 bg-red-400/[0.07] px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/15 disabled:cursor-wait disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span className="text-sm text-slate-500">Reviewed</span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>
      </main>

      {rejectionCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" onKeyDown={(event) => { if (event.key === 'Escape' && !reviewMutation.isPending) setRejectionCandidate(null) }} onMouseDown={(event) => { if (event.target === event.currentTarget && !reviewMutation.isPending) setRejectionCandidate(null) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="reject-dialog-heading" aria-describedby="reject-dialog-description" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/50 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-red-300">Confirm decision</p>
            <h2 id="reject-dialog-heading" className="mt-3 text-xl font-bold text-white">Reject educator application?</h2>
            <p id="reject-dialog-description" className="mt-3 text-sm leading-6 text-slate-300">
              {rejectionCandidate.name} will remain unable to create or publish courses.
            </p>
            {reviewMutation.isError && (
              <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200">
                {reviewMutation.error instanceof Error ? reviewMutation.error.message : 'Unable to reject application.'}
              </p>
            )}
            <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button type="button" autoFocus onClick={() => setRejectionCandidate(null)} disabled={reviewMutation.isPending} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => reviewMutation.mutate({ applicantId: rejectionCandidate.id, status: 'REJECTED' })} disabled={reviewMutation.isPending} className="rounded-lg border border-red-400/30 bg-red-500/15 px-4 py-2.5 text-sm font-semibold text-red-100 hover:bg-red-500/25 disabled:cursor-wait disabled:opacity-50">
                {reviewMutation.isPending ? 'Rejecting...' : 'Confirm rejection'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone: 'indigo' | 'cyan' | 'violet' | 'slate' | 'emerald' | 'amber'
}) {
  const accents = {
    indigo: 'bg-indigo-400',
    cyan: 'bg-cyan-400',
    violet: 'bg-violet-400',
    slate: 'bg-slate-400',
    emerald: 'bg-emerald-400',
    amber: 'bg-amber-400',
  }

  return (
    <article className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-black/20 transition hover:-translate-y-0.5 hover:border-slate-700 sm:p-6">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${accents[tone]}`} />
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-4xl">{value.toLocaleString()}</p>
    </article>
  )
}

function StatusBadge({ status }: { status: EducatorApplication['educatorApprovalStatus'] }) {
  const styles = {
    PENDING: 'border-amber-400/20 bg-amber-400/10 text-amber-200',
    APPROVED: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200',
    REJECTED: 'border-red-400/20 bg-red-400/10 text-red-200',
    NOT_APPLICABLE: 'border-slate-700 bg-slate-800 text-slate-300',
  }

  const label = status === 'NOT_APPLICABLE' ? 'Not applicable' : status[0] + status.slice(1).toLowerCase()

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[status]}`}>{label}</span>
}

export default AdminDashboard
