import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api/client'

type CourseSort = 'newest' | 'oldest' | 'popular'

interface DiscoveredCourse {
  id: number
  title: string
  description: string | null
  educator: {
    id: number
    name: string
  }
  _count: {
    enrollments: number
  }
}

interface CourseDiscoveryResponse {
  success: boolean
  data: DiscoveredCourse[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const PAGE_SIZE = 10

function StudentCourseDiscoveryPage() {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<CourseSort>('newest')
  const [page, setPage] = useState(1)

  const coursesQuery = useQuery({
    queryKey: ['published-courses', search, sort, page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        sort,
      })

      if (search.trim()) {
        params.set('q', search.trim())
      }

      return apiRequest<CourseDiscoveryResponse>(
        `/courses?${params.toString()}`,
      )
    },
  })

  const courses = coursesQuery.data?.data ?? []
  const pagination = coursesQuery.data?.pagination

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <nav className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link to="/student" className="text-2xl font-bold tracking-tight">
            Note<span className="text-indigo-400">Verse</span>
          </Link>
          <Link
            to="/student"
            className="text-sm text-slate-300 hover:text-white"
          >
            Back to Dashboard
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-6 py-12">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
            Course Discovery
          </p>
          <h1 className="mt-2 text-4xl font-bold">Find your next course</h1>
          <p className="mt-3 text-slate-400">
            Explore published courses and continue building your skills.
          </p>
        </div>

        <div className="mt-8 flex flex-col gap-4 sm:flex-row">
          <label className="flex-1">
            <span className="sr-only">Search courses</span>
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Search courses"
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-indigo-400"
            />
          </label>

          <label className="sm:w-56">
            <span className="sr-only">Sort courses</span>
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value as CourseSort)
                setPage(1)
              }}
              className="w-full rounded-lg border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-indigo-400"
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="popular">Most popular</option>
            </select>
          </label>
        </div>

        {coursesQuery.isLoading && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-slate-400">
            Loading courses...
          </div>
        )}

        {coursesQuery.isError && (
          <div className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/10 p-6 text-red-300">
            <p>
              {coursesQuery.error instanceof Error
                ? coursesQuery.error.message
                : 'Failed to load courses.'}
            </p>
            <button
              type="button"
              onClick={() => void coursesQuery.refetch()}
              className="mt-4 rounded-lg border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10"
            >
              Try again
            </button>
          </div>
        )}

        {!coursesQuery.isLoading &&
          !coursesQuery.isError &&
          courses.length === 0 && (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <h2 className="text-xl font-semibold">
                {search.trim()
                  ? 'No courses match your search'
                  : 'No published courses yet'}
              </h2>
              <p className="mt-2 text-slate-400">
                {search.trim()
                  ? 'Try a different search term.'
                  : 'Check back later for courses from our educators.'}
              </p>
            </div>
          )}

        {!coursesQuery.isLoading &&
          !coursesQuery.isError &&
          courses.length > 0 && (
            <>
              <div className="mt-8 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {courses.map((course) => (
                  <article
                    key={course.id}
                    className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6"
                  >
                    <div className="flex-1">
                      <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">
                        Published Course
                      </p>
                      <h2 className="mt-2 text-xl font-semibold">
                        {course.title}
                      </h2>
                      <p className="mt-3 line-clamp-3 text-sm leading-6 text-slate-400">
                        {course.description || 'No course description yet.'}
                      </p>
                      <p className="mt-4 text-sm text-slate-500">
                        By {course.educator.name} ·{' '}
                        {course._count.enrollments}{' '}
                        {course._count.enrollments === 1
                          ? 'student'
                          : 'students'}
                      </p>
                    </div>
                    <Link
                      to={`/student/discover/${course.id}`}
                      className="mt-6 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-indigo-500"
                    >
                      View Course
                    </Link>
                  </article>
                ))}
              </div>

              {pagination && pagination.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setPage((current) => current - 1)}
                    disabled={page <= 1 || coursesQuery.isFetching}
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <p className="text-sm text-slate-400">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <button
                    type="button"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={
                      page >= pagination.totalPages ||
                      coursesQuery.isFetching
                    }
                    className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
      </main>
    </div>
  )
}

export default StudentCourseDiscoveryPage
