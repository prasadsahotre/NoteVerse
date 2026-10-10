import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useAuth } from '../auth/useAuth'
import { apiRequest } from '../api/client'
import { Link, useNavigate } from 'react-router-dom'

interface EducatorCourseAnalytics {
  courseId: number
  title: string
  status: 'DRAFT' | 'PUBLISHED'
  enrollments: number
  completedStudents: number
  completionRate: number
  quizAttempts: number
  averageQuizScore: number
  averageRating: number
  reviewCount: number
}

interface RecentEnrollment {
  studentId: number
  studentName: string
  courseId: number
  courseTitle: string
  enrolledAt: string
}

interface EducatorAnalyticsResponse {
  success: boolean
  data: {
    totalCourses: number
    publishedCourses: number
    totalEnrollments: number
    totalStudents: number
    overallCompletionRate: number
    courses: EducatorCourseAnalytics[]
    recentEnrollments: RecentEnrollment[]
  }
}

interface EducatorCourse {
  id: number
  title: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED'
  createdAt: string
  updatedAt: string
}

interface CoursesResponse {
  success: boolean
  data: EducatorCourse[]
}

interface CourseMutationResponse {
  success: boolean
  message: string
  data: EducatorCourse
}

function EducatorDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editingCourseId, setEditingCourseId] = useState<number | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [formError, setFormError] = useState('')
  const [feedback, setFeedback] = useState('')
  const isApprovedEducator = Boolean(
    user?.id && user.educatorApprovalStatus === 'APPROVED',
  )

  const analyticsQuery = useQuery({
    queryKey: ['educator-analytics', user?.id],
    queryFn: async () => {
      const response = await apiRequest<EducatorAnalyticsResponse>(
        '/analytics/educator',
      )
      return response.data
    },
    enabled: Boolean(
      user?.id && user.educatorApprovalStatus === 'APPROVED',
    ),
  })

  const coursesQuery = useQuery({
    queryKey: ['educator-courses', user?.id],
    queryFn: async () => {
      const response = await apiRequest<CoursesResponse>('/courses/mine')
      return response.data
    },
    enabled: isApprovedEducator,
  })

  const refreshCourseData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['educator-courses', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['educator-analytics', user?.id] }),
    ])
  }

  const createCourseMutation = useMutation({
    mutationFn: (values: { title: string; description: string }) =>
      apiRequest<CourseMutationResponse>('/courses', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Course created successfully.')
      setTitle('')
      setDescription('')
      setFormError('')
      await refreshCourseData()
    },
  })

  const updateCourseMutation = useMutation({
    mutationFn: ({ id, ...values }: { id: number; title: string; description: string }) =>
      apiRequest<CourseMutationResponse>(`/courses/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Course updated successfully.')
      setEditingCourseId(null)
      setFormError('')
      await refreshCourseData()
    },
  })

  const publishCourseMutation = useMutation({
    mutationFn: (courseId: number) =>
      apiRequest<CourseMutationResponse>(`/courses/${courseId}/publish`, {
        method: 'PATCH',
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Course published successfully.')
      await refreshCourseData()
    },
  })

  const unpublishCourseMutation = useMutation({
    mutationFn: (courseId: number) =>
      apiRequest<CourseMutationResponse>(`/courses/${courseId}/unpublish`, {
        method: 'PATCH',
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Course unpublished successfully.')
      await refreshCourseData()
    },
  })

  const deleteCourseMutation = useMutation({
    mutationFn: (courseId: number) =>
      apiRequest<{ success: boolean; message: string }>(`/courses/${courseId}`, {
        method: 'DELETE',
      }),
    onSuccess: async (response, courseId) => {
      setFeedback(response.message || 'Course deleted successfully.')
      if (editingCourseId === courseId) cancelCourseEdit()
      await refreshCourseData()
    },
  })

  const handleCourseSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    setFeedback('')
    createCourseMutation.reset()
    updateCourseMutation.reset()

    const trimmedTitle = title.trim()
    if (!trimmedTitle) {
      setFormError('Enter a course title to continue.')
      return
    }

    const values = { title: trimmedTitle, description: description.trim() }
    if (editingCourseId !== null) {
      updateCourseMutation.mutate({ id: editingCourseId, ...values })
    } else {
      createCourseMutation.mutate(values)
    }
  }

  const startEditingCourse = (course: EducatorCourse) => {
    createCourseMutation.reset()
    updateCourseMutation.reset()
    setEditingCourseId(course.id)
    setTitle(course.title)
    setDescription(course.description ?? '')
    setFormError('')
    setFeedback('')
  }

  const cancelCourseEdit = () => {
    setEditingCourseId(null)
    setTitle('')
    setDescription('')
    setFormError('')
  }

  const publishCourse = (course: EducatorCourse) => {
    const confirmed = window.confirm(
      `Publish “${course.title}”? It will become visible in course discovery.`,
    )
    if (!confirmed) return
    setFeedback('')
    publishCourseMutation.reset()
    publishCourseMutation.mutate(course.id)
  }

  const unpublishCourse = (course: EducatorCourse) => {
    const confirmed = window.confirm(
      `Unpublish “${course.title}”? It will be removed from course discovery. Students already enrolled can continue learning.`,
    )
    if (!confirmed) return
    setFeedback('')
    unpublishCourseMutation.reset()
    unpublishCourseMutation.mutate(course.id)
  }

  const deleteCourse = (course: EducatorCourse) => {
    const confirmed = window.confirm(
      `Delete “${course.title}”? This permanently removes the course. Deletion is allowed only when it has no modules, enrollments, reviews, certificates, or reports. Courses with related records must be unpublished instead.`,
    )
    if (!confirmed) return
    setFeedback('')
    deleteCourseMutation.reset()
    deleteCourseMutation.mutate(course.id)
  }

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
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950 px-4 py-8 text-white sm:px-6 lg:py-12">
      <main className="mx-auto max-w-7xl">
        <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-indigo-400/20 bg-indigo-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-indigo-300">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" /> Educator insights
            </div>
            <h1 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">Analytics Dashboard</h1>
            <p className="mt-2 text-sm text-slate-400 sm:text-base">
              A clear view of course engagement and student progress.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="self-start rounded-xl border border-slate-700 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:border-slate-600 hover:bg-slate-800 sm:self-auto"
          >
            Logout
          </button>
        </header>

        <section aria-labelledby="my-courses-heading" className="mt-10">
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Course workspace</p>
            <h2 id="my-courses-heading" className="mt-2 text-2xl font-bold tracking-tight">My Courses</h2>
            <p className="mt-1 text-sm text-slate-400">Create and update your course details, then publish a draft when it is ready.</p>
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.5fr)]">
            <form onSubmit={handleCourseSubmit} className="h-fit rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
              <h3 className="text-lg font-semibold text-white">
                {editingCourseId === null ? 'Create a course' : 'Edit course'}
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                {editingCourseId === null ? 'New courses start as drafts.' : 'Update the course title and description.'}
              </p>

              <label htmlFor="course-title" className="mt-5 block text-sm font-medium text-slate-200">Course title</label>
              <input
                id="course-title"
                name="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
                className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                placeholder="e.g. Foundations of Guitar"
              />

              <label htmlFor="course-description" className="mt-4 block text-sm font-medium text-slate-200">Description <span className="font-normal text-slate-500">(optional)</span></label>
              <textarea
                id="course-description"
                name="description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20"
                placeholder="Describe what students will learn."
              />

              {formError && <p role="alert" className="mt-3 text-sm text-red-300">{formError}</p>}
              {(createCourseMutation.isError || updateCourseMutation.isError) && (
                <p role="alert" className="mt-3 text-sm text-red-300">
                  {(createCourseMutation.error ?? updateCourseMutation.error) instanceof Error
                    ? (createCourseMutation.error ?? updateCourseMutation.error)?.message
                    : 'Unable to save this course. Please try again.'}
                </p>
              )}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={createCourseMutation.isPending || updateCourseMutation.isPending}
                  className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {createCourseMutation.isPending || updateCourseMutation.isPending
                    ? 'Saving…'
                    : editingCourseId === null ? 'Create draft' : 'Save changes'}
                </button>
                {editingCourseId !== null && (
                  <button type="button" onClick={cancelCourseEdit} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800">
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div aria-live="polite" className="min-w-0">
              {feedback && <p role="status" className="mb-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">{feedback}</p>}
              {publishCourseMutation.isError && (
                <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-300">
                  {publishCourseMutation.error instanceof Error ? publishCourseMutation.error.message : 'Unable to publish this course.'}
                </p>
              )}
              {unpublishCourseMutation.isError && (
                <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-300">
                  {unpublishCourseMutation.error instanceof Error ? unpublishCourseMutation.error.message : 'Unable to unpublish this course.'}
                </p>
              )}
              {deleteCourseMutation.isError && (
                <p role="alert" className="mb-4 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-300">
                  {deleteCourseMutation.error instanceof Error ? deleteCourseMutation.error.message : 'Unable to delete this course.'}
                </p>
              )}

              {coursesQuery.isLoading && <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-slate-400">Loading your courses…</div>}
              {coursesQuery.isError && (
                <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
                  <p>{coursesQuery.error instanceof Error ? coursesQuery.error.message : 'Unable to load your courses.'}</p>
                  <button type="button" onClick={() => void coursesQuery.refetch()} className="mt-4 rounded-xl border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10">Try again</button>
                </div>
              )}
              {coursesQuery.data && coursesQuery.data.length === 0 && (
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                  <p className="font-medium text-slate-200">Your course workspace is ready.</p>
                  <p className="mt-2 text-sm text-slate-400">Create your first draft using the form.</p>
                </div>
              )}
              {coursesQuery.data && coursesQuery.data.length > 0 && (
                <div className="space-y-3">
                  {coursesQuery.data.map((course) => (
                    <article key={course.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                      {editingCourseId === course.id ? (
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-300">Editing this course</p>
                      ) : null}
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h3 title={course.title} className="break-words text-lg font-semibold text-white">{course.title}</h3>
                          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{course.description || 'No description provided.'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${course.status === 'PUBLISHED' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20' : 'bg-slate-700/60 text-slate-300 ring-1 ring-white/10'}`}>
                          {course.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                        </span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-1 border-t border-white/[0.06] pt-3 text-xs text-slate-400">
                        <span>Created <time dateTime={course.createdAt}>{new Date(course.createdAt).toLocaleDateString()}</time></span>
                        <span>Updated <time dateTime={course.updatedAt}>{new Date(course.updatedAt).toLocaleDateString()}</time></span>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <Link
                          to={`/educator/courses/${course.id}/curriculum`}
                          className="rounded-xl bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400"
                        >
                          Manage curriculum
                        </Link>
                        <button type="button" onClick={() => startEditingCourse(course)} className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800">Edit details</button>
                        {course.status === 'DRAFT' && (
                          <button
                            type="button"
                            onClick={() => publishCourse(course)}
                            disabled={publishCourseMutation.isPending}
                            className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {publishCourseMutation.isPending ? 'Publishing…' : 'Publish course'}
                          </button>
                        )}
                        {course.status === 'PUBLISHED' && (
                          <button
                            type="button"
                            onClick={() => unpublishCourse(course)}
                            disabled={unpublishCourseMutation.isPending}
                            className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-2 text-sm font-semibold text-amber-200 transition hover:bg-amber-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {unpublishCourseMutation.isPending ? 'Unpublishing…' : 'Unpublish course'}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteCourse(course)}
                          disabled={deleteCourseMutation.isPending}
                          className="rounded-xl border border-red-400/30 bg-red-400/[0.07] px-4 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deleteCourseMutation.isPending ? 'Deleting…' : 'Delete course'}
                        </button>
                      </div>
                      <p className="mt-3 text-xs leading-5 text-slate-500">
                        Deletion is available only for courses with no modules or related student/platform records. Unpublish a course to keep its learning history.
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {analyticsQuery.isLoading && (
          <div className="mt-10 rounded-3xl border border-white/10 bg-slate-900/70 p-10 text-center text-slate-400 shadow-xl shadow-black/10">
            Loading educator analytics...
          </div>
        )}

        {analyticsQuery.isError && (
          <div role="alert" className="mt-10 rounded-3xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-300">
            <p>
              {analyticsQuery.error instanceof Error
                ? analyticsQuery.error.message
                : 'Unable to load educator analytics.'}
            </p>
            <button
              type="button"
              onClick={() => void analyticsQuery.refetch()}
              className="mt-4 rounded-xl border border-red-300/30 px-4 py-2.5 text-sm font-medium transition hover:bg-red-400/10"
            >
              Try again
            </button>
          </div>
        )}

        {analyticsQuery.data && (
          <>
            <section aria-label="Analytics summary" className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard label="Total courses" value={analyticsQuery.data.totalCourses} icon="courses" accent="indigo" />
              <SummaryCard label="Published courses" value={analyticsQuery.data.publishedCourses} icon="published" accent="cyan" />
              <SummaryCard label="Enrollments" value={analyticsQuery.data.totalEnrollments} icon="enrollments" accent="violet" />
              <SummaryCard label="Unique students" value={analyticsQuery.data.totalStudents} icon="students" accent="emerald" />
              <SummaryCard label="Overall completion" value={`${analyticsQuery.data.overallCompletionRate}%`} icon="completion" accent="amber" />
            </section>

            <section className="mt-12">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">At a glance</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">Course performance</h2>
              </div>
              {analyticsQuery.data.courses.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-slate-400">
                  You have not created any courses yet.
                </p>
              ) : (
                <div className="grid gap-5 lg:grid-cols-2">
                  <CourseBarChart title="Enrollments by course" courses={analyticsQuery.data.courses} metric="enrollments" color="bg-indigo-400" />
                  <CourseBarChart title="Completion rate by course" courses={analyticsQuery.data.courses} metric="completionRate" color="bg-cyan-400" />
                  <CourseBarChart title="Average quiz score" courses={analyticsQuery.data.courses.filter((course) => course.quizAttempts > 0)} metric="averageQuizScore" color="bg-violet-400" emptyMessage="Quiz scores will appear after students submit quizzes." />

                  <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
                    <h3 className="font-semibold text-white">Course details</h3>
                    <p className="mt-1 text-sm text-slate-500">Progress, learning activity, and learner feedback</p>
                    <div className="mt-5 space-y-3">
                      {analyticsQuery.data.courses.map((course) => (
                        <div key={course.courseId} className="rounded-xl border border-slate-700/70 bg-slate-800/60 p-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <h4 title={course.title} className="min-w-0 flex-1 truncate font-medium text-slate-100">{course.title}</h4>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${course.status === 'PUBLISHED' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20' : 'bg-slate-700/60 text-slate-300 ring-1 ring-white/10'}`}>
                              {course.status === 'PUBLISHED' ? 'Published' : 'Draft'}
                            </span>
                          </div>
                          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                            <span>Completion</span>
                            <span className="font-semibold text-slate-200">{course.completionRate}% <span className="font-normal text-slate-500">· {course.completedStudents} students</span></span>
                          </div>
                          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, course.completionRate))}%` }} />
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-xs">
                            <div><p className="text-slate-500">Enrolled</p><p className="mt-1 font-semibold text-slate-200">{course.enrollments}</p></div>
                            <div><p className="text-slate-500">Quiz attempts</p><p className="mt-1 font-semibold text-slate-200">{course.quizAttempts}</p></div>
                            <div><p className="text-slate-500">Rating</p><p className="mt-1 font-semibold text-slate-200">{course.reviewCount > 0 ? `${course.averageRating} / 5` : '—'}</p></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </div>
              )}
            </section>

            <section className="mt-12">
              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Your community</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight">Recent enrollments</h2>
              </div>
              {analyticsQuery.data.recentEnrollments.length === 0 ? (
                <p className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 text-slate-400">
                  No students have enrolled in your courses yet.
                </p>
              ) : (
                  <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(130px,0.7fr)] gap-4 border-b border-slate-800 bg-slate-800/70 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-300 sm:grid">
                    <span>Student</span><span>Course</span><span>Enrolled</span>
                  </div>
                  {analyticsQuery.data.recentEnrollments.map((enrollment) => (
                    <article key={`${enrollment.studentId}-${enrollment.courseId}`} className="grid gap-3 border-b border-slate-800 px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1.5fr)_minmax(130px,0.7fr)] sm:items-center sm:gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-indigo-400/10 text-sm font-semibold text-indigo-300">{enrollment.studentName.charAt(0).toUpperCase()}</span>
                        <div className="min-w-0">
                          <p title={enrollment.studentName} className="truncate font-medium text-slate-100">{enrollment.studentName}</p>
                          <p className="text-xs text-slate-500">Student</p>
                        </div>
                      </div>
                      <div className="min-w-0 pl-12 sm:pl-0">
                        <p title={enrollment.courseTitle} className="truncate text-sm text-slate-300">{enrollment.courseTitle}</p>
                        <p className="text-xs text-slate-500">Enrolled in</p>
                      </div>
                      <time className="pl-12 text-xs text-slate-400 sm:pl-0 sm:text-sm" dateTime={enrollment.enrolledAt}>
                        {new Date(enrollment.enrolledAt).toLocaleDateString()}
                      </time>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: number | string
  icon: 'courses' | 'published' | 'enrollments' | 'students' | 'completion'
  accent: 'indigo' | 'cyan' | 'violet' | 'emerald' | 'amber'
}) {
  const accentStyles = {
    indigo: 'border-indigo-400/20 bg-indigo-400/10 text-indigo-300',
    cyan: 'border-cyan-400/20 bg-cyan-400/10 text-cyan-300',
    violet: 'border-violet-400/20 bg-violet-400/10 text-violet-300',
    emerald: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
    amber: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  }

  return (
    <article className="rounded-2xl border border-slate-700 bg-slate-900 bg-gradient-to-br from-white/[0.07] to-white/[0.025] p-5 shadow-lg shadow-black/30 transition hover:-translate-y-0.5 hover:border-slate-600 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-400">{label}</p>
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl border ${accentStyles[accent]}`}>
          <MetricIcon name={icon} />
        </span>
      </div>
      <p className="mt-5 text-3xl font-bold tracking-tight text-white sm:text-4xl">{value}</p>
      <div className="mt-4 h-px bg-gradient-to-r from-white/10 to-transparent" />
    </article>
  )
}

function CourseBarChart({
  title,
  courses,
  metric,
  color,
  emptyMessage = 'No course data available yet.',
}: {
  title: string
  courses: EducatorCourseAnalytics[]
  metric: 'enrollments' | 'completionRate' | 'averageQuizScore'
  color: string
  emptyMessage?: string
}) {
  const maximum = metric === 'enrollments'
    ? Math.max(1, ...courses.map((course) => course[metric]))
    : 100

  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-6">
      <h3 className="font-semibold text-white">{title}</h3>
      {courses.length === 0 ? (
        <p className="mt-5 text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <div className="mt-5 space-y-4">
          {courses.map((course) => {
            const value = course[metric]
            const width = value === 0 ? 0 : Math.max(3, Math.min(100, (value / maximum) * 100))
            const displayValue = metric === 'enrollments' ? value.toLocaleString() : `${value}%`

            return (
              <div key={course.courseId}>
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span title={course.title} className="min-w-0 truncate text-slate-300">{course.title}</span>
                  <span className="shrink-0 font-semibold tabular-nums text-slate-100">{displayValue}</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-slate-800"
                  role="img"
                  aria-label={`${course.title}: ${displayValue}`}
                >
                  <div className={`h-full rounded-full ${color}`} style={{ width: `${width}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </article>
  )
}

type DashboardIcon = 'courses' | 'published' | 'enrollments' | 'students' | 'completion'

function MetricIcon({ name }: { name: DashboardIcon }) {
  const paths: Record<DashboardIcon, ReactNode> = {
    courses: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
    published: <><path d="m5 12 4 4L19 6" /><circle cx="12" cy="12" r="9" /></>,
    enrollments: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6m3-3h-6" /></>,
    students: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5.5a3 3 0 0 1 0 5.8M18 14a5 5 0 0 1 3 4.6v1" /></>,
    completion: <><path d="M4 19V5m0 14h17" /><path d="m7 15 4-4 3 2 6-7" /></>,
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      {paths[name]}
    </svg>
  )
}

export default EducatorDashboard
