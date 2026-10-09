import type { ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client'
import { useAuth } from '../auth/useAuth'
import { useMyEnrollments } from '../features/student/studentApi'

interface CoursePreview {
  id: number
  title: string
  description: string | null
  modules: {
    id: number
    title: string
    position: number
    lessons: {
      id: number
      title: string
      position: number
    }[]
  }[]
}

interface CoursePreviewResponse {
  success: boolean
  data: CoursePreview
}

interface EnrollmentResponse {
  success: boolean
  message: string
  data: {
    id: number
    userId: number
    courseId: number
    createdAt: string
  }
}

function StudentCoursePreviewPage() {
  const { courseId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const courseIdNumber = Number(courseId)
  const isValidCourseId =
    Number.isInteger(courseIdNumber) && courseIdNumber > 0

  const courseQuery = useQuery({
    queryKey: ['course-preview', courseIdNumber],
    queryFn: async () => {
      const response = await apiRequest<CoursePreviewResponse>(
        `/courses/${courseIdNumber}`,
      )

      return response.data
    },
    enabled: isValidCourseId,
  })

  const enrollmentsQuery = useMyEnrollments(user?.id)

  const enrollmentMutation = useMutation({
    mutationFn: async () => {
      return apiRequest<EnrollmentResponse>('/enrollments', {
        method: 'POST',
        body: JSON.stringify({ courseId: courseIdNumber }),
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['my-enrollments', user?.id],
      })
    },
  })

  const isEnrolled = Boolean(
    enrollmentsQuery.data?.some(
      (enrollment) => enrollment.courseId === courseIdNumber,
    ),
  )

  if (!isValidCourseId) {
    return (
      <MessagePage
        title="Invalid course"
        message="The course link is not valid."
        action={
          <Link to="/student/discover" className="text-indigo-300 hover:text-indigo-200">
            Browse courses
          </Link>
        }
      />
    )
  }

  if (courseQuery.isLoading) {
    return (
      <MessagePage title="Loading course" message="Loading course details..." />
    )
  }

  if (courseQuery.isError || !courseQuery.data) {
    return (
      <MessagePage
        title="Unable to load course"
        message={
          courseQuery.error instanceof Error
            ? courseQuery.error.message
            : 'Something went wrong.'
        }
        action={
          <Link to="/student/discover" className="text-indigo-300 hover:text-indigo-200">
            Back to courses
          </Link>
        }
      />
    )
  }

  const course = courseQuery.data
  const totalLessons = course.modules.reduce(
    (total, module) => total + module.lessons.length,
    0,
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-white/10">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/student" className="text-2xl font-bold tracking-tight">
            Note<span className="text-indigo-400">Verse</span>
          </Link>
          <Link
            to="/student/discover"
            className="text-sm text-slate-300 hover:text-white"
          >
            Back to Courses
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-10">
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">
            Published Course
          </p>
          <h1 className="mt-2 text-3xl font-bold">{course.title}</h1>
          <p className="mt-4 leading-7 text-slate-400">
            {course.description || 'No course description yet.'}
          </p>
          <p className="mt-5 text-sm text-slate-500">
            {course.modules.length}{' '}
            {course.modules.length === 1 ? 'module' : 'modules'} ·{' '}
            {totalLessons} {totalLessons === 1 ? 'lesson' : 'lessons'}
          </p>

          <div className="mt-6">
            {enrollmentsQuery.isLoading && !enrollmentMutation.isSuccess ? (
              <button
                type="button"
                disabled
                className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold opacity-60"
              >
                Checking enrollment...
              </button>
            ) : isEnrolled || enrollmentMutation.isSuccess ? (
              <div>
                {enrollmentMutation.isSuccess && (
                  <p className="mb-3 text-sm text-green-300">
                    Enrollment successful.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/student/courses/${courseIdNumber}`)
                  }
                  className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Continue Learning
                </button>
              </div>
            ) : enrollmentsQuery.isError ? (
              <div className="text-sm text-red-300">
                <p>Unable to check your enrollment status.</p>
                <button
                  type="button"
                  onClick={() => void enrollmentsQuery.refetch()}
                  className="mt-2 underline hover:text-red-200"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div>
                <button
                  type="button"
                  onClick={() => enrollmentMutation.mutate()}
                  disabled={enrollmentMutation.isPending}
                  className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {enrollmentMutation.isPending
                    ? 'Enrolling...'
                    : 'Enroll in Course'}
                </button>
                {enrollmentMutation.isError && (
                  <p className="mt-3 text-sm text-red-300">
                    {enrollmentMutation.error instanceof Error
                      ? enrollmentMutation.error.message
                      : 'Enrollment failed. Please try again.'}
                  </p>
                )}
              </div>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-2xl font-bold">Course Content</h2>
          {course.modules.length === 0 ? (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
              Course content will be added soon.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {course.modules.map((module) => (
                <div
                  key={module.id}
                  className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
                >
                  <div className="border-b border-slate-800 px-6 py-4">
                    <h3 className="font-semibold">
                      Module {module.position}: {module.title}
                    </h3>
                  </div>
                  {module.lessons.length === 0 ? (
                    <p className="px-6 py-4 text-sm text-slate-500">
                      No lessons in this module yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-slate-800">
                      {module.lessons.map((lesson) => (
                        <li
                          key={lesson.id}
                          className="px-6 py-4 text-sm text-slate-300"
                        >
                          Lesson {lesson.position}: {lesson.title}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}

function MessagePage({
  title,
  message,
  action,
}: {
  title: string
  message: string
  action?: ReactNode
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-400">{message}</p>
        {action && <div className="mt-5">{action}</div>}
      </div>
    </div>
  )
}

export default StudentCoursePreviewPage
