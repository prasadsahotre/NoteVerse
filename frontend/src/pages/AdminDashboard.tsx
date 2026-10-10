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

interface AdminUser {
  id: number
  name: string
  email: string
  roles: string[]
  createdAt: string
  updatedAt: string
  educatorApprovalStatus: EducatorApplication['educatorApprovalStatus']
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

interface RoleUpdateVariables {
  userId: number
  role: 'STUDENT' | 'EDUCATOR'
}

interface RoleUpdateResponse {
  id: number
  name: string
  email: string
  role: 'STUDENT' | 'EDUCATOR'
  educatorApprovalStatus: EducatorApplication['educatorApprovalStatus']
}

type CourseStatus = 'DRAFT' | 'PUBLISHED'

interface AdminCourse {
  id: number
  title: string
  description: string | null
  status: CourseStatus
  educator: { id: number; name: string; email: string }
  enrollmentCount: number
  moduleCount: number
  createdAt: string
  updatedAt: string
}

interface CourseStatusResponse {
  id: number
  title: string
  status: CourseStatus
}

function AdminDashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [rejectionCandidate, setRejectionCandidate] = useState<EducatorApplication | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [userRoleFilter, setUserRoleFilter] = useState('ALL')
  const [userStatusFilter, setUserStatusFilter] = useState('ALL')
  const [roleChangeCandidate, setRoleChangeCandidate] = useState<{ user: AdminUser; role: RoleUpdateVariables['role'] } | null>(null)
  const [courseSearch, setCourseSearch] = useState('')
  const [courseStatusFilter, setCourseStatusFilter] = useState<'ALL' | CourseStatus>('ALL')
  const [courseStatusCandidate, setCourseStatusCandidate] = useState<{ course: AdminCourse; status: CourseStatus } | null>(null)
  const [courseFeedback, setCourseFeedback] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)

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

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await apiRequest<ApiResponse<AdminUser[]>>('/admin/users')
      return response.data
    },
  })

  const roleUpdateMutation = useMutation({
    mutationFn: async ({ userId, role }: RoleUpdateVariables) => {
      const response = await apiRequest<ApiResponse<RoleUpdateResponse>>(`/admin/users/${userId}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      return { response, role }
    },
    onSuccess: async ({ role }) => {
      setFeedback({ kind: 'success', message: `User role updated to ${role.toLowerCase()}.` })
      setRoleChangeCandidate(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-analytics'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-educator-applications'] }),
      ])
    },
    onError: (error) => {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to update the user role.',
      })
    },
  })

  const coursesQuery = useQuery({
    queryKey: ['admin-courses'],
    queryFn: async () => {
      const response = await apiRequest<ApiResponse<AdminCourse[]>>('/admin/courses')
      return response.data
    },
  })

  const courseStatusMutation = useMutation({
    mutationFn: async ({ courseId, status }: { courseId: number; status: CourseStatus }) => {
      const response = await apiRequest<ApiResponse<CourseStatusResponse>>(`/admin/courses/${courseId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      return { response, status }
    },
    onSuccess: async ({ status }) => {
      setCourseFeedback({ kind: 'success', message: `Course ${status === 'PUBLISHED' ? 'published' : 'returned to draft'} successfully.` })
      setCourseStatusCandidate(null)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-courses'] }),
        queryClient.invalidateQueries({ queryKey: ['admin-analytics'] }),
      ])
    },
    onError: (error) => {
      setCourseFeedback({ kind: 'error', message: error instanceof Error ? error.message : 'Unable to update the course status.' })
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

        <section className="mt-14" aria-labelledby="user-management-heading">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Platform accounts</p>
            <h2 id="user-management-heading" className="mt-2 text-xl font-semibold sm:text-2xl">User management</h2>
            <p className="mt-1 text-sm text-slate-400">Search accounts and manage student or educator roles.</p>
          </div>

          {usersQuery.isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading users...</div>
          )}
          {usersQuery.isError && (
            <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
              <p>{usersQuery.error instanceof Error ? usersQuery.error.message : 'Unable to load users.'}</p>
              <button type="button" onClick={() => void usersQuery.refetch()} className="mt-4 rounded-lg border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10">Retry</button>
            </div>
          )}
          {usersQuery.data && (
            <>
              <div className="mb-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-3">
                <label className="sm:col-span-2 lg:col-span-1">
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Search name or email</span>
                  <input value={userSearch} onChange={(event) => setUserSearch(event.target.value)} type="search" placeholder="Search users" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Role</span>
                  <select value={userRoleFilter} onChange={(event) => setUserRoleFilter(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none">
                    <option value="ALL">All roles</option><option value="STUDENT">Student</option><option value="EDUCATOR">Educator</option><option value="ADMIN">Administrator</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Educator status</span>
                  <select value={userStatusFilter} onChange={(event) => setUserStatusFilter(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none">
                    <option value="ALL">All statuses</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="NOT_APPLICABLE">Not applicable</option>
                  </select>
                </label>
              </div>

              {usersQuery.data.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                  <h3 className="font-semibold text-slate-100">No users yet</h3>
                  <p className="mt-1 text-sm text-slate-400">Registered accounts will appear here.</p>
                </div>
              ) : (() => {
                const normalizedSearch = userSearch.trim().toLocaleLowerCase()
                const filteredUsers = usersQuery.data.filter((user) => {
                  const matchesSearch = !normalizedSearch || user.name.toLocaleLowerCase().includes(normalizedSearch) || user.email.toLocaleLowerCase().includes(normalizedSearch)
                  const matchesRole = userRoleFilter === 'ALL' || user.roles.includes(userRoleFilter)
                  const matchesStatus = userStatusFilter === 'ALL' || user.educatorApprovalStatus === userStatusFilter
                  return matchesSearch && matchesRole && matchesStatus
                })

                return filteredUsers.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                    <h3 className="font-semibold text-slate-100">No matching users</h3>
                    <p className="mt-1 text-sm text-slate-400">Try changing the search or filters.</p>
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                    <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(100px,0.7fr)_minmax(130px,0.8fr)_minmax(180px,1fr)] gap-4 border-b border-slate-800 bg-slate-800/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-300 lg:grid">
                      <span>Name</span><span>Email</span><span>Role</span><span>Educator status</span><span className="text-right">Role action</span>
                    </div>
                    <div className="divide-y divide-slate-800">
                      {filteredUsers.map((user) => {
                        const role = user.roles[0] ?? 'UNKNOWN'
                        const isAdmin = user.roles.includes('ADMIN')
                        const nextRole = role === 'EDUCATOR' ? 'STUDENT' : 'EDUCATOR'
                        return (
                          <article key={user.id} className="grid gap-4 px-5 py-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1.5fr)_minmax(100px,0.7fr)_minmax(130px,0.8fr)_minmax(180px,1fr)] lg:items-center">
                            <div className="min-w-0"><p className="truncate font-semibold text-slate-100" title={user.name}>{user.name}</p></div>
                            <p className="break-all text-sm text-slate-300">{user.email}</p>
                            <div><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${role === 'ADMIN' ? 'border-violet-400/20 bg-violet-400/10 text-violet-200' : role === 'EDUCATOR' ? 'border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border-indigo-400/20 bg-indigo-400/10 text-indigo-200'}`}>{role === 'ADMIN' ? 'Administrator' : role === 'EDUCATOR' ? 'Educator' : 'Student'}</span></div>
                            <div>{user.roles.includes('EDUCATOR') ? <StatusBadge status={user.educatorApprovalStatus} /> : <span className="text-sm text-slate-500">—</span>}</div>
                            <div className="lg:text-right">
                              {isAdmin ? (
                                <p className="text-xs leading-5 text-slate-400">Administrator roles cannot be changed through this interface.</p>
                              ) : (
                                <button type="button" onClick={() => { setFeedback(null); roleUpdateMutation.reset(); setRoleChangeCandidate({ user, role: nextRole }) }} disabled={roleUpdateMutation.isPending} className="rounded-lg border border-indigo-400/25 bg-indigo-400/10 px-3 py-2 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-400/15 disabled:cursor-not-allowed disabled:opacity-50">
                                  Change to {nextRole === 'STUDENT' ? 'Student' : 'Educator'}
                                </button>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </>
          )}
        </section>

        <section className="mt-14" aria-labelledby="course-moderation-heading">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Content oversight</p>
            <h2 id="course-moderation-heading" className="mt-2 text-xl font-semibold sm:text-2xl">Course moderation</h2>
            <p className="mt-1 text-sm text-slate-400">Review course details and publish courses or return them to draft.</p>
          </div>

          {courseFeedback && (
            <div role={courseFeedback.kind === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-xl border px-4 py-3 text-sm ${courseFeedback.kind === 'success' ? 'border-emerald-400/20 bg-emerald-400/[0.07] text-emerald-200' : 'border-red-400/20 bg-red-400/[0.07] text-red-200'}`}>
              {courseFeedback.message}
              <button type="button" onClick={() => setCourseFeedback(null)} className="ml-3 font-semibold underline underline-offset-2">Dismiss</button>
            </div>
          )}

          {coursesQuery.isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading courses...</div>
          )}
          {coursesQuery.isError && (
            <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
              <p>{coursesQuery.error instanceof Error ? coursesQuery.error.message : 'Unable to load courses.'}</p>
              <button type="button" onClick={() => void coursesQuery.refetch()} className="mt-4 rounded-lg border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10">Retry</button>
            </div>
          )}
          {coursesQuery.data && (
            <>
              <div className="mb-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:grid-cols-[minmax(0,1fr)_220px]">
                <label>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Search courses or educators</span>
                  <input value={courseSearch} onChange={(event) => setCourseSearch(event.target.value)} type="search" placeholder="Course title, description, educator" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/20" />
                </label>
                <label>
                  <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">Course status</span>
                  <select value={courseStatusFilter} onChange={(event) => setCourseStatusFilter(event.target.value as 'ALL' | CourseStatus)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 focus:border-indigo-400 focus:outline-none">
                    <option value="ALL">All statuses</option><option value="DRAFT">Draft</option><option value="PUBLISHED">Published</option>
                  </select>
                </label>
              </div>

              {coursesQuery.data.length === 0 ? (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                  <h3 className="font-semibold text-slate-100">No courses to review</h3>
                  <p className="mt-1 text-sm text-slate-400">Courses will appear here when educators create them.</p>
                </div>
              ) : (() => {
                const normalizedSearch = courseSearch.trim().toLocaleLowerCase()
                const filteredCourses = coursesQuery.data.filter((course) => {
                  const searchableText = `${course.title} ${course.description ?? ''} ${course.educator.name} ${course.educator.email}`.toLocaleLowerCase()
                  return (!normalizedSearch || searchableText.includes(normalizedSearch)) && (courseStatusFilter === 'ALL' || course.status === courseStatusFilter)
                })

                return filteredCourses.length === 0 ? (
                  <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                    <h3 className="font-semibold text-slate-100">No matching courses</h3>
                    <p className="mt-1 text-sm text-slate-400">Try changing the search or status filter.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredCourses.map((course) => (
                      <article key={course.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg shadow-black/10 sm:p-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3">
                              <h3 className="min-w-0 break-words text-lg font-semibold text-slate-100">{course.title}</h3>
                              <CourseStatusBadge status={course.status} />
                            </div>
                            <p className="mt-2 text-sm text-slate-400">Educator: <span className="font-medium text-slate-200">{course.educator.name}</span> <span className="break-all text-slate-500">({course.educator.email})</span></p>
                            {course.description && <p className="mt-3 whitespace-pre-line break-words text-sm leading-6 text-slate-300">{course.description}</p>}
                            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-400">
                              <span>{course.moduleCount} {course.moduleCount === 1 ? 'module' : 'modules'}</span>
                              <span>{course.enrollmentCount} {course.enrollmentCount === 1 ? 'enrollment' : 'enrollments'}</span>
                              <span>Created {new Date(course.createdAt).toLocaleDateString()}</span>
                              <span>Updated {new Date(course.updatedAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <button type="button" onClick={() => { setCourseFeedback(null); courseStatusMutation.reset(); setCourseStatusCandidate({ course, status: course.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED' }) }} disabled={courseStatusMutation.isPending} className={`shrink-0 self-start rounded-lg border px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${course.status === 'PUBLISHED' ? 'border-amber-400/25 bg-amber-400/10 text-amber-200 hover:bg-amber-400/15' : 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15'}`}>
                            {course.status === 'PUBLISHED' ? 'Return to draft' : 'Publish course'}
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )
              })()}
            </>
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

      {roleChangeCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" onKeyDown={(event) => { if (event.key === 'Escape' && !roleUpdateMutation.isPending) setRoleChangeCandidate(null) }} onMouseDown={(event) => { if (event.target === event.currentTarget && !roleUpdateMutation.isPending) setRoleChangeCandidate(null) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="role-change-heading" aria-describedby="role-change-description" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/50 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Confirm role change</p>
            <h2 id="role-change-heading" className="mt-3 text-xl font-bold text-white">Change user role?</h2>
            <p id="role-change-description" className="mt-3 text-sm leading-6 text-slate-300">Change {roleChangeCandidate.user.name} from {roleChangeCandidate.user.roles[0]?.toLowerCase()} to {roleChangeCandidate.role.toLowerCase()}? Educator accounts will require approval before authoring.</p>
            {roleUpdateMutation.isError && <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200">{roleUpdateMutation.error instanceof Error ? roleUpdateMutation.error.message : 'Unable to update the user role.'}</p>}
            <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button type="button" autoFocus onClick={() => setRoleChangeCandidate(null)} disabled={roleUpdateMutation.isPending} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => roleUpdateMutation.mutate({ userId: roleChangeCandidate.user.id, role: roleChangeCandidate.role })} disabled={roleUpdateMutation.isPending} className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-4 py-2.5 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-50">{roleUpdateMutation.isPending ? 'Updating...' : 'Confirm role change'}</button>
            </div>
          </section>
        </div>
      )}

      {courseStatusCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4 py-6 backdrop-blur-sm" onKeyDown={(event) => { if (event.key === 'Escape' && !courseStatusMutation.isPending) setCourseStatusCandidate(null) }} onMouseDown={(event) => { if (event.target === event.currentTarget && !courseStatusMutation.isPending) setCourseStatusCandidate(null) }}>
          <section role="alertdialog" aria-modal="true" aria-labelledby="course-status-heading" aria-describedby="course-status-description" className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/50 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Confirm moderation action</p>
            <h2 id="course-status-heading" className="mt-3 text-xl font-bold text-white">{courseStatusCandidate.status === 'PUBLISHED' ? 'Publish this course?' : 'Return this course to draft?'}</h2>
            <p id="course-status-description" className="mt-3 break-words text-sm leading-6 text-slate-300">{courseStatusCandidate.status === 'PUBLISHED' ? 'Publishing' : 'Returning to draft'} “{courseStatusCandidate.course.title}” will update its availability to students.</p>
            {courseStatusMutation.isError && <p role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200">{courseStatusMutation.error instanceof Error ? courseStatusMutation.error.message : 'Unable to update the course status.'}</p>}
            <div className="mt-6 flex flex-col-reverse justify-end gap-3 sm:flex-row">
              <button type="button" autoFocus onClick={() => setCourseStatusCandidate(null)} disabled={courseStatusMutation.isPending} className="rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={() => courseStatusMutation.mutate({ courseId: courseStatusCandidate.course.id, status: courseStatusCandidate.status })} disabled={courseStatusMutation.isPending} className="rounded-lg border border-indigo-400/30 bg-indigo-500/15 px-4 py-2.5 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25 disabled:cursor-wait disabled:opacity-50">{courseStatusMutation.isPending ? 'Updating...' : 'Confirm status change'}</button>
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

function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const styles = status === 'PUBLISHED'
    ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    : 'border-slate-700 bg-slate-800 text-slate-300'

  return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}>{status === 'PUBLISHED' ? 'Published' : 'Draft'}</span>
}

export default AdminDashboard
