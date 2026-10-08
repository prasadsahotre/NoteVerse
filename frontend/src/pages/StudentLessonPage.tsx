import {
  useMutation,
  useQuery,
} from '@tanstack/react-query'

import {
  Link,
  useNavigate,
  useParams,
} from 'react-router-dom'

import { useAuth } from '../auth/AuthContext'
import { apiRequest } from '../api/client'

interface Quiz {
  id: number
  title: string
}

interface Lesson {
  id: number
  title: string
  content: string | null
  position: number
  quizzes: Quiz[]
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

interface ProgressResponse {
  success: boolean
  message: string
  data?: unknown
}

interface LessonResource {
  id: number
  title: string
  type: string
  lessonId: number
  createdAt: string
  updatedAt: string
}

interface ResourcesResponse {
  success: boolean
  data: LessonResource[]
}

interface ResourceDownloadResponse {
  success: boolean
  data: {
    id: number
    title: string
    type: string
    downloadUrl: string
    expiresIn: number
  }
}

function StudentLessonPage() {
  const { courseId, lessonId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const courseIdNumber = Number(courseId)
  const lessonIdNumber = Number(lessonId)

  const hasValidCourseId =
    Boolean(courseId) &&
    Number.isInteger(courseIdNumber) &&
    courseIdNumber > 0

  const hasValidLessonId =
    Boolean(lessonId) &&
    Number.isInteger(lessonIdNumber) &&
    lessonIdNumber > 0

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
      hasValidCourseId &&
      hasValidLessonId,
  })

  const resourcesQuery = useQuery({
    queryKey: ['lesson-resources', lessonIdNumber],

    queryFn: async () => {
      const response =
        await apiRequest<ResourcesResponse>(
          `/lesson-resources/lesson/${lessonIdNumber}`,
        )

      return response.data
    },

    enabled:
      hasValidLessonId &&
      hasValidCourseId,
  })

  /*
   * The API response structure is:
   *
   * data
   * ├── enrollment
   * ├── course
   * ├── progress
   * └── modules
   *
   * Therefore:
   * - course = courseQuery.data.course
   * - modules = courseQuery.data.modules
   */
  const courseData = courseQuery.data

  const course = courseData?.course
  const modules = courseData?.modules ?? []

  const lesson = modules
    .flatMap((module) => module.lessons)
    .find((item) => item.id === lessonIdNumber)

  const lessonModule = modules.find((module) =>
    module.lessons.some(
      (item) => item.id === lessonIdNumber,
    ),
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

  const downloadResourceMutation = useMutation({
    mutationFn: async (resourceId: number) => {
      const response =
        await apiRequest<ResourceDownloadResponse>(
          `/lesson-resources/${resourceId}/download`,
        )

      return response.data
    },

    onSuccess: (resource) => {
      window.open(
        resource.downloadUrl,
        '_blank',
        'noopener,noreferrer',
      )
    },
  })

  // Invalid route parameter
  if (!hasValidCourseId || !hasValidLessonId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Invalid lesson URL
          </h1>

          <p className="mt-2 text-slate-400">
            Course ID: {courseId ?? 'missing'} | Lesson ID:{' '}
            {lessonId ?? 'missing'}
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

        {/* Resources */}
        <section className="mt-8">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
                Lesson Resources
              </p>

              <h2 className="mt-2 text-xl font-semibold">
                Additional Materials
              </h2>
            </div>

            {/* Loading */}
            {resourcesQuery.isLoading && (
              <p className="mt-5 text-sm text-slate-500">
                Loading resources...
              </p>
            )}

            {/* Error */}
            {resourcesQuery.isError && (
              <p className="mt-5 text-sm text-red-300">
                Failed to load lesson resources.
              </p>
            )}

            {/* No Resources */}
            {!resourcesQuery.isLoading &&
              !resourcesQuery.isError &&
              resourcesQuery.data &&
              resourcesQuery.data.length === 0 && (
                <p className="mt-5 text-sm text-slate-500">
                  No additional resources are available for
                  this lesson.
                </p>
              )}

            {/* Resources List */}
            {!resourcesQuery.isLoading &&
              !resourcesQuery.isError &&
              resourcesQuery.data &&
              resourcesQuery.data.length > 0 && (
                <div className="mt-5 space-y-3">
                  {resourcesQuery.data.map((resource) => (
                    <div
                      key={resource.id}
                      className="flex flex-col gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/10 text-sm font-semibold text-indigo-300">
                          {resource.type}
                        </div>

                        <div>
                          <p className="font-medium text-white">
                            {resource.title}
                          </p>

                          <p className="mt-1 text-xs text-slate-500">
                            {resource.type} resource
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          downloadResourceMutation.mutate(
                            resource.id,
                          )
                        }
                        disabled={
                          downloadResourceMutation.isPending
                        }
                        className="shrink-0 rounded-lg border border-indigo-500/40 px-4 py-2 text-sm font-medium text-indigo-300 transition hover:bg-indigo-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {downloadResourceMutation.isPending
                          ? 'Preparing...'
                          : 'Download'}
                      </button>
                    </div>
                  ))}
                </div>
              )}

            {/* Download Error */}
            {downloadResourceMutation.isError && (
              <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
                {downloadResourceMutation.error instanceof
                Error
                  ? downloadResourceMutation.error.message
                  : 'Failed to prepare the resource download.'}
              </div>
            )}
          </div>
        </section>

        {/* Quiz */}
        {lesson.quizzes.length > 0 && (
          <section className="mt-8">
            <div className="rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-6">
              <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">
                Knowledge Check
              </p>

              <h2 className="mt-2 text-2xl font-bold">
                Test Your Knowledge
              </h2>

              <p className="mt-2 text-slate-400">
                Complete the quiz associated with this lesson to
                test your understanding.
              </p>

              <div className="mt-5 space-y-3">
                {lesson.quizzes.map((quiz) => (
                  <div
                    key={quiz.id}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900 p-4"
                  >
                    <div>
                      <p className="font-medium">
                        {quiz.title}
                      </p>

                      <p className="mt-1 text-sm text-slate-500">
                        Quiz
                      </p>
                    </div>

                    <Link
                      to={`/student/quizzes/${quiz.id}`}
                      className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
                    >
                      Take Quiz
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

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

        {/* Completion Error */}
        {completeLessonMutation.isError && (
          <div className="mt-4 rounded-lg border border-red-400/20 bg-red-400/10 p-4 text-sm text-red-300">
            {completeLessonMutation.error instanceof
            Error
              ? completeLessonMutation.error.message
              : 'Failed to mark lesson as complete.'}
          </div>
        )}
      </main>
    </div>
  )
}

export default StudentLessonPage