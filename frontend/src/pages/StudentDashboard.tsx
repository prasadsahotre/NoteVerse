import { useQueries } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../api/client'
import type {
  CourseProgress,
  Enrollment,
} from '../features/student/studentApi'

interface CourseProgressResponse {
  success: boolean
  data: CourseProgress
}

function StudentDashboard() {
  const { user, logout } = useAuth()

  const enrollmentsQuery = useQueries({
    queries: [
      {
        queryKey: ['my-enrollments', user?.id],
        queryFn: async () => {
          if (!user?.id) {
            throw new Error('User ID is required')
          }

          const response = await apiRequest<{
            success: boolean
            data: Enrollment[]
          }>(`/enrollments/user/${user.id}`)

          return response.data
        },
        enabled: Boolean(user?.id),
      },
    ],
  })

  const enrollments = enrollmentsQuery[0].data
  const isLoadingEnrollments = enrollmentsQuery[0].isLoading
  const isErrorEnrollments = enrollmentsQuery[0].isError

  const progressQueries = useQueries({
    queries:
      enrollments?.map((enrollment) => ({
        queryKey: [
          'course-progress',
          user?.id,
          enrollment.courseId,
        ],
        queryFn: async () => {
          if (!user?.id) {
            throw new Error('User ID is required')
          }

          const response = await apiRequest<CourseProgressResponse>(
            `/progress/user/${user.id}/course/${enrollment.courseId}`,
          )

          return response.data
        },
        enabled: Boolean(user?.id),
      })) ?? [],
  })

  const getProgressForCourse = (courseId: number) => {
    const index = enrollments?.findIndex(
      (enrollment) => enrollment.courseId === courseId,
    )

    if (index === undefined || index < 0) {
      return undefined
    }

    return progressQueries[index]?.data
  }

  const isLoadingProgress = progressQueries.some(
    (query) => query.isLoading,
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="text-2xl font-bold tracking-tight">
            Note<span className="text-indigo-400">Verse</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-sm text-slate-400 sm:block">
              Welcome,{' '}
              <span className="font-medium text-white">
                {user?.name}
              </span>
            </div>

            <button
              onClick={logout}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <main className="mx-auto max-w-7xl px-6 py-12">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
            Student Dashboard
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Welcome back, {user?.name}
          </h1>

          <p className="mt-3 text-slate-400">
            Continue learning and keep building your musical skills.
          </p>
        </div>

        {/* Stats */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Enrolled Courses
            </p>

            <p className="mt-2 text-3xl font-bold">
              {isLoadingEnrollments
                ? '...'
                : enrollments?.length ?? 0}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Completed Lessons
            </p>

            <p className="mt-2 text-3xl font-bold">
              {isLoadingProgress
                ? '...'
                : progressQueries.reduce(
                    (total, query) =>
                      total +
                      (query.data?.completedLessons ?? 0),
                    0,
                  )}
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Certificates
            </p>

            <p className="mt-2 text-3xl font-bold">
              —
            </p>
          </div>
        </div>

        {/* Courses */}
        <section className="mt-12">
          <div>
            <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
              My Learning
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              Your Courses
            </h2>
          </div>

          {isLoadingEnrollments && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
              Loading your courses...
            </div>
          )}

          {isErrorEnrollments && (
            <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-300">
              Failed to load your courses.
            </div>
          )}

          {!isLoadingEnrollments &&
            !isErrorEnrollments &&
            enrollments &&
            enrollments.length === 0 && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
                <h3 className="text-xl font-semibold">
                  No courses yet
                </h3>

                <p className="mt-2 text-slate-400">
                  Explore available courses and start learning.
                </p>
              </div>
            )}

          {!isLoadingEnrollments &&
            !isErrorEnrollments &&
            enrollments &&
            enrollments.length > 0 && (
              <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {enrollments.map((enrollment) => {
                  const progress = getProgressForCourse(
                    enrollment.courseId,
                  )

                  return (
                    <div
                      key={enrollment.id}
                      className="rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-indigo-400/30"
                    >
                      {/* Course Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs uppercase tracking-wider text-indigo-400">
                            Course
                          </p>

                          <h3 className="mt-2 text-xl font-semibold">
                            {enrollment.course.title}
                          </h3>
                        </div>

                        <span className="rounded-full bg-indigo-500/10 px-3 py-1 text-xs text-indigo-300">
                          {enrollment.course.status}
                        </span>
                      </div>

                      {/* Description */}
                      <p className="mt-4 line-clamp-3 text-sm leading-6 text-slate-400">
                        {enrollment.course.description}
                      </p>

                      {/* Progress */}
                      <div className="mt-6">
                        <div className="mb-2 flex justify-between">
                          <span className="text-sm text-slate-400">
                            Progress
                          </span>

                          <span className="text-sm font-semibold text-white">
                            {progress
                              ? `${progress.progressPercentage}%`
                              : '...'}
                          </span>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                            style={{
                              width: `${
                                progress?.progressPercentage ?? 0
                              }%`,
                            }}
                          />
                        </div>

                        <p className="mt-3 text-sm text-slate-500">
                          {progress
                            ? `${progress.completedLessons} of ${progress.totalLessons} lessons completed`
                            : 'Loading progress...'}
                        </p>

                        {/* Continue Learning */}
                        <Link
                          to={`/student/courses/${enrollment.courseId}`}
                          className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                        >
                          Continue Learning
                        </Link>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
        </section>
      </main>
    </div>
  )
}

export default StudentDashboard