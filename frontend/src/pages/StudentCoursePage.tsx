import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client'
import { useAuth } from '../auth/useAuth'

interface Lesson {
  id: number
  title: string
  content: string | null
  position: number
  completed: boolean
}

interface Module {
  id: number
  title: string
  position: number
  lessons: Lesson[]
}

interface Course {
  title: string
  description: string
  status: string
  modules: Module[]
}

interface CourseResponse {
  success: boolean
  data: {
    enrollment: {
      id: number
      userId: number
      courseId: number
      createdAt: string
    }
    course: Course
    progress: {
      totalLessons: number
      completedLessons: number
      progressPercentage: number
    }
    modules: Module[]
  }
}

interface CertificateIssueResponse {
  success: boolean
  message: string
  data: { id: number }
}

function StudentCoursePage() {
  const { courseId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [certificateFeedback, setCertificateFeedback] = useState('')

  const courseIdNumber = Number(courseId)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['student-course', user?.id, courseIdNumber],
    queryFn: async () => {
      if (!user) {
        throw new Error('User is not authenticated')
      }

      const response = await apiRequest<CourseResponse>(
        `/enrollments/user/${user.id}/course/${courseIdNumber}`,
      )

      return response.data
    },
    enabled:
      Boolean(user) &&
      Number.isInteger(courseIdNumber) &&
      courseIdNumber > 0,
  })

  const certificateMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest<CertificateIssueResponse>(
        '/certificates',
        {
          method: 'POST',
          body: JSON.stringify({ courseId: courseIdNumber }),
        },
      )
      return response.data
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['student-certificates', user?.id],
      })
      setCertificateFeedback('Certificate issued successfully. You can download it from your dashboard.')
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : 'Unable to issue certificate.'
      if (message === 'Certificate already issued for this course') {
        void queryClient.invalidateQueries({
          queryKey: ['student-certificates', user?.id],
        })
        setCertificateFeedback('A certificate has already been issued for this course. You can download it from your dashboard.')
      } else {
        setCertificateFeedback(message)
      }
    },
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">
          Loading course...
        </p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Unable to load course
          </h1>

          <p className="mt-2 text-slate-400">
            {error instanceof Error
              ? error.message
              : 'Something went wrong.'}
          </p>

          <Link
            to="/student"
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-3 font-medium hover:bg-indigo-500"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  if (!data) {
    return null
  }

  const handleStartLesson = (lessonId: number) => {
    if (!Number.isInteger(lessonId) || lessonId <= 0) {
      return
    }

    navigate(
      `/student/courses/${courseIdNumber}/lessons/${lessonId}`,
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link
            to="/student"
            className="text-xl font-bold"
          >
            Note<span className="text-indigo-400">Verse</span>
          </Link>

          <Link
            to="/student"
            className="text-sm text-slate-300 hover:text-white"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {/* Course Header */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">
            Course
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            {data.course.title}
          </h1>

          <p className="mt-4 text-slate-400">
            {data.course.description}
          </p>

          <div className="mt-6">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-300">Course Progress</span>
              <span className="text-slate-400">
                {data.progress.completedLessons} of {data.progress.totalLessons} lessons completed ({data.progress.progressPercentage}%)
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800"
              role="progressbar"
              aria-label="Course progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={data.progress.progressPercentage}
            >
              <div
                className="h-full rounded-full bg-indigo-500"
                style={{ width: `${data.progress.progressPercentage}%` }}
              />
            </div>
            {data.progress.totalLessons > 0 &&
              data.progress.completedLessons >= data.progress.totalLessons && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => {
                      setCertificateFeedback('')
                      certificateMutation.mutate()
                    }}
                    disabled={certificateMutation.isPending || certificateMutation.isSuccess}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {certificateMutation.isPending
                      ? 'Issuing certificate...'
                      : certificateMutation.isSuccess
                        ? 'Certificate issued'
                        : 'Get Certificate'}
                  </button>
                  {certificateFeedback && (
                    <p
                      role="status"
                      className={`mt-3 text-sm ${certificateMutation.isError ? 'text-amber-300' : 'text-green-300'}`}
                    >
                      {certificateFeedback}
                    </p>
                  )}
                </div>
              )}
          </div>
        </div>

        {/* Course Content */}
        <section className="mt-8">
          <h2 className="text-2xl font-bold">
            Course Content
          </h2>

          <div className="mt-5 space-y-5">
            {data.modules.length === 0 ? (
              <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 text-slate-400">
                No modules have been added to this course yet.
              </div>
            ) : (
              data.modules.map((module) => (
                <div
                  key={module.id}
                  className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"
                >
                  {/* Module Header */}
                  <div className="border-b border-slate-800 px-6 py-4">
                    <h3 className="text-lg font-semibold">
                      Module {module.position}: {module.title}
                    </h3>
                  </div>

                  {/* Lessons */}
                  <div className="divide-y divide-slate-800">
                    {module.lessons.length === 0 ? (
                      <p className="px-6 py-4 text-sm text-slate-500">
                        No lessons in this module.
                      </p>
                    ) : (
                      module.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="flex items-center justify-between px-6 py-4"
                        >
                          <div>
                            <p className="font-medium">
                              {lesson.title}
                            </p>

                            <p className="mt-1 text-sm text-slate-500">
                              Lesson {lesson.position}
                            </p>
                            <p className={`mt-1 text-sm ${lesson.completed ? 'text-green-400' : 'text-slate-500'}`}>
                              {lesson.completed ? 'Completed' : 'Not completed'}
                            </p>
                          </div>

                          {Number.isInteger(lesson.id) &&
                          lesson.id > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleStartLesson(lesson.id)
                              }
                              className="shrink-0 rounded-lg border border-indigo-500/40 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10"
                            >
                              Start Lesson
                            </button>
                          ) : (
                            <span className="text-sm text-red-300">
                              Invalid lesson
                            </span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default StudentCoursePage
