import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api/client'
import { useAuth } from '../auth/AuthContext'

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

function StudentCoursePage() {
  const { courseId } = useParams()
  const { user } = useAuth()

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
    enabled: Boolean(user) && courseIdNumber > 0,
  })

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">Loading course...</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Unable to load course</h1>
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

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-slate-800 bg-slate-950/90">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/student" className="text-xl font-bold">
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
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">
            Course
          </p>

          <h1 className="mt-2 text-3xl font-bold">{data.title}</h1>

          <p className="mt-4 text-slate-400">
            {data.description}
          </p>
        </div>

        <section className="mt-8">
          <h2 className="text-2xl font-bold">Course Content</h2>

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
                  <div className="border-b border-slate-800 px-6 py-4">
                    <h3 className="text-lg font-semibold">
                      Module {module.position}: {module.title}
                    </h3>
                  </div>

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
                            <p className="font-medium">{lesson.title}</p>

                            <p className="mt-1 text-sm text-slate-500">
                              Lesson {lesson.position}
                            </p>
                          </div>

                          <button
                            type="button"
                            className="rounded-lg border border-indigo-500/40 px-4 py-2 text-sm font-medium text-indigo-300 hover:bg-indigo-500/10"
                          >
                            Start Lesson
                          </button>
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