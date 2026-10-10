import { useQueries, useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { apiDownload, apiRequest } from '../api/client'
import type {
  CourseProgress,
  Enrollment,
} from '../features/student/studentApi'

interface CourseProgressResponse {
  success: boolean
  data: CourseProgress
}

interface CertificatesResponse {
  success: boolean
  data: Certificate[]
}

interface Certificate {
  id: number
  certificateNo: string
  issuedAt: string
  course: {
    id: number
    title: string
  }
}

function StudentDashboard() {
  const { user, logout } = useAuth()
  const [downloadingCertificateId, setDownloadingCertificateId] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState('')

  const certificatesQuery = useQuery({
    queryKey: ['student-certificates', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error('User ID is required')
      }

      const response = await apiRequest<CertificatesResponse>(
        '/certificates',
      )

      return response.data
    },
    enabled: Boolean(user?.id),
  })

  const handleCertificateDownload = async (certificate: Certificate) => {
    setDownloadingCertificateId(certificate.id)
    setDownloadError('')
    let objectUrl: string | undefined

    try {
      const pdf = await apiDownload(`/certificates/${certificate.id}/download`)
      objectUrl = URL.createObjectURL(pdf)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `NoteVerse-Certificate-${certificate.certificateNo}.pdf`
      document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download certificate.')
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000)
      }
      setDownloadingCertificateId(null)
    }
  }

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

  const getProgressQueryForCourse = (courseId: number) => {
    const index = enrollments?.findIndex(
      (enrollment) => enrollment.courseId === courseId,
    )

    if (index === undefined || index < 0) {
      return undefined
    }

    return progressQueries[index]
  }

  const isLoadingProgress = progressQueries.some(
    (query) => query.isLoading,
  )
  const isErrorProgress = progressQueries.some(
    (query) => query.isError,
  )
  const isLoadingCompletedLessons =
    isLoadingEnrollments || isLoadingProgress
  const isErrorCompletedLessons =
    isErrorEnrollments || isErrorProgress

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

          <Link
            to="/student/discover"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Browse Courses
          </Link>
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
                : isErrorEnrollments
                  ? '—'
                  : enrollments?.length ?? '—'}
            </p>
            {isErrorEnrollments && (
              <p className="mt-2 text-sm text-red-300">
                Unable to load course count.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Completed Lessons
            </p>

            <p className="mt-2 text-3xl font-bold">
              {isLoadingCompletedLessons
                ? '...'
                : isErrorCompletedLessons
                  ? '—'
                  : progressQueries.reduce(
                    (total, query) =>
                      total +
                      (query.data?.completedLessons ?? 0),
                    0,
                  )}
            </p>
            {isErrorCompletedLessons && (
              <p className="mt-2 text-sm text-red-300">
                Unable to load completed lesson count.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <p className="text-sm text-slate-400">
              Certificates
            </p>

            <p className="mt-2 text-3xl font-bold">
              {certificatesQuery.isLoading
                ? '...'
                : certificatesQuery.isError
                  ? '—'
                  : certificatesQuery.data?.length ?? '—'}
            </p>
            {certificatesQuery.isError && (
              <p className="mt-2 text-sm text-red-300">
                Unable to load certificate count.
              </p>
            )}
          </div>
        </div>

        {/* Certificates */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Your Certificates</h2>

          {certificatesQuery.isLoading && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
              Loading certificates...
            </div>
          )}

          {certificatesQuery.isError && (
            <div role="alert" className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-300">
              Unable to load your certificates. Please try again later.
            </div>
          )}

          {downloadError && (
            <div role="alert" className="mt-5 rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
              {downloadError}
            </div>
          )}

          {!certificatesQuery.isLoading && !certificatesQuery.isError && certificatesQuery.data?.length === 0 && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-6 text-slate-400">
              You have not earned any certificates yet.
            </div>
          )}

          {!certificatesQuery.isLoading && !certificatesQuery.isError && Boolean(certificatesQuery.data?.length) && (
            <div className="mt-5 space-y-4">
              {certificatesQuery.data?.map((certificate) => (
                <article key={certificate.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/5 p-6 sm:flex-row sm:items-center">
                  <div>
                    <h3 className="text-lg font-semibold">{certificate.course.title}</h3>
                    <p className="mt-1 text-sm text-slate-400">Certificate No: {certificate.certificateNo}</p>
                    <p className="mt-1 text-sm text-slate-500">Issued {new Date(certificate.issuedAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCertificateDownload(certificate)}
                    disabled={downloadingCertificateId === certificate.id}
                    className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-wait disabled:opacity-60"
                  >
                    {downloadingCertificateId === certificate.id ? 'Downloading...' : 'Download PDF'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

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
                <Link
                  to="/student/discover"
                  className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Browse Courses
                </Link>
              </div>
            )}

          {!isLoadingEnrollments &&
            !isErrorEnrollments &&
            enrollments &&
            enrollments.length > 0 && (
              <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {enrollments.map((enrollment) => {
                  const progressQuery = getProgressQueryForCourse(
                    enrollment.courseId,
                  )
                  const progress = progressQuery?.data

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
                            {progressQuery?.isLoading
                              ? '...'
                              : progressQuery?.isError
                                ? 'Unavailable'
                                : progress
                                  ? `${progress.progressPercentage}%`
                                  : '—'}
                          </span>
                        </div>

                        {progress && !progressQuery?.isError ? (
                          <>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                              <div
                                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                                style={{
                                  width: `${progress.progressPercentage}%`,
                                }}
                              />
                            </div>

                            <p className="mt-3 text-sm text-slate-500">
                              {progress.completedLessons} of{' '}
                              {progress.totalLessons} lessons completed
                            </p>
                          </>
                        ) : (
                          <p
                            className={`text-sm ${
                              progressQuery?.isError
                                ? 'text-red-300'
                                : 'text-slate-500'
                            }`}
                          >
                            {progressQuery?.isLoading
                              ? 'Loading progress...'
                              : progressQuery?.isError
                                ? 'Unable to load progress.'
                                : 'Progress unavailable.'}
                          </p>
                        )}

                        {/* Continue Learning */}
                        {Number.isInteger(enrollment.courseId) &&
                        enrollment.courseId > 0 ? (
                          <Link
                            to={`/student/courses/${enrollment.courseId}`}
                            className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                          >
                          Continue Learning
                          </Link>
                        ) : (
                        <p className="mt-5 text-sm text-red-300">
                          Invalid course information.
                        </p>
                      )}
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
