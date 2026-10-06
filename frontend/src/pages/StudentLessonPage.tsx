import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../api/client'

interface Lesson {
  id: number
  title: string
  content: string | null
  position: number
}

interface Module {
  id: number
  title: string
  position: number
  lessons: Lesson[]
}

interface Course {
  id: number
  title: string
  description: string
  status: string
  modules: Module[]
}

interface CourseResponse {
  success: boolean
  data: Course
}

interface ProgressResponse {
  success: boolean
  message: string
  data?: unknown
}

function StudentLessonPage() {
  const { courseId, lessonId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const courseIdNumber = Number(courseId)
  const lessonIdNumber = Number(lessonId)

  const courseQuery = useQuery({
    queryKey: [
      'student-course',
      user?.id,
      courseIdNumber,
    ],
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
      courseIdNumber > 0 &&
      lessonIdNumber > 0,
  })

  const course = courseQuery.data

  const lesson = course?.modules
    .flatMap((module) => module.lessons)
    .find((item) => item.id === lessonIdNumber)

  const lessonModule = course?.modules.find((module) =>
    module.lessons.some((item) => item.id === lessonIdNumber),
  )

  const completeLessonMutation = useMutation({
    mutationFn: async () => {
      if (!user) {
        throw new Error('User is not authenticated')
      }

      return apiRequest<ProgressResponse>('/progress', {
        method: 'POST',
        body: JSON.stringify({
          userId: user.id,
          lessonId: lessonIdNumber,
        }),
      })
    },
    onSuccess: () => {
      navigate(`/student/courses/${courseIdNumber}`)
    },
  })

  if (courseQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">
          Loading lesson...
        </p>
      </div>
    )
  }

  if (courseQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Unable to load lesson
          </h1>

          <p className="mt-2 text-slate-400">
            {courseQuery.error instanceof Error
              ? courseQuery.error.message
              : 'Something went wrong.'}
          </p>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="mt-6 rounded-lg bg-indigo-600 px-5 py-3 font-medium hover:bg-indigo-500"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  if (!course || !lesson || !lessonModule) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Lesson not found
          </h1>

          <p className="mt-2 text-slate-400">
            This lesson could not be found in this course.
          </p>

          <Link
            to={`/student/courses/${courseIdNumber}`}
            className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-3 font-medium hover:bg-indigo-500"
          >
            Back to Course
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            to="/student"
            className="text-xl font-bold"
          >
            Note<span className="text-indigo-400">Verse</span>
          </Link>

          <Link
            to={`/student/courses/${course.id}`}
            className="text-sm text-slate-300 hover:text-white"
          >
            ← Back to Course
          </Link>
        </div>
      </nav>

      {/* Lesson */}
      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Breadcrumb */}
        <div className="text-sm text-slate-500">
          {course.title}
          <span className="mx-2">/</span>
          {lessonModule.title}
        </div>

        {/* Lesson Header */}
        <div className="mt-6">
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
            Lesson {lesson.position}
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            {lesson.title}
          </h1>
        </div>

        {/* Lesson Content */}
        <article className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <div className="whitespace-pre-wrap text-base leading-8 text-slate-300">
            {lesson.content ||
              'No lesson content available.'}
          </div>
        </article>

        {/* Completion */}
        <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold">
              Finished this lesson?
            </h2>

            <p className="mt-1 text-sm text-slate-500">
              Mark the lesson as complete to update your
              course progress.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              completeLessonMutation.mutate()
            }
            disabled={completeLessonMutation.isPending}
            className="shrink-0 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completeLessonMutation.isPending
              ? 'Saving...'
              : 'Mark as Complete'}
          </button>
        </div>

        {/* Error */}
        {completeLessonMutation.isError && (
          <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
            {completeLessonMutation.error instanceof Error
              ? completeLessonMutation.error.message
              : 'Failed to mark lesson as complete.'}
          </div>
        )}
      </main>
    </div>
  )
}

export default StudentLessonPage