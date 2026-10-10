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

interface MyCourseReviewResponse {
  success: boolean
  data: {
    id: number
    userId: number
    courseId: number
    rating: number
    review: string | null
    createdAt: string
    updatedAt: string
  } | null
}

interface ReviewInput {
  rating: number
  review: string
}

function StudentCoursePage() {
  const { courseId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [certificateFeedback, setCertificateFeedback] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [editingReviewId, setEditingReviewId] = useState<number | null>(null)

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

  const reviewsQuery = useQuery({
    queryKey: ['course-review-mine', user?.id, courseIdNumber],
    queryFn: async () => {
      const response = await apiRequest<MyCourseReviewResponse>(
        `/course-reviews/course/${courseIdNumber}/mine`,
      )
      return response.data
    },
    enabled: Boolean(user) && Number.isInteger(courseIdNumber) && courseIdNumber > 0,
  })

  const reviewMutation = useMutation({
    mutationFn: async (input: ReviewInput & { reviewId?: number }) => {
      if (input.reviewId) {
        return apiRequest<{ success: boolean; message: string }>(
          `/course-reviews/${input.reviewId}`,
          {
            method: 'PATCH',
            body: JSON.stringify({ rating: input.rating, review: input.review.trim() || null }),
          },
        )
      }
      return apiRequest<{ success: boolean; message: string }>(
        '/course-reviews',
        {
          method: 'POST',
          body: JSON.stringify({
            courseId: courseIdNumber,
            rating: input.rating,
            review: input.review.trim() || null,
          }),
        },
      )
    },
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['course-review-mine', user?.id, courseIdNumber] }),
        queryClient.invalidateQueries({ queryKey: ['course-reviews', courseIdNumber] }),
      ])
      if (variables.reviewId) setEditingReviewId(null)
      setReviewFeedback(variables.reviewId ? 'Your review was updated.' : 'Your review was submitted.')
    },
    onError: (mutationError) => {
      setReviewFeedback(mutationError instanceof Error ? mutationError.message : 'Unable to save your review.')
    },
  })

  const deleteReviewMutation = useMutation({
    mutationFn: async (reviewId: number) =>
      apiRequest<{ success: boolean; message: string }>(`/course-reviews/${reviewId}`, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['course-review-mine', user?.id, courseIdNumber] }),
        queryClient.invalidateQueries({ queryKey: ['course-reviews', courseIdNumber] }),
      ])
      setReviewFeedback('Your review was deleted.')
    },
    onError: (mutationError) => {
      setReviewFeedback(mutationError instanceof Error ? mutationError.message : 'Unable to delete your review.')
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

  const ownReview = reviewsQuery.data

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

        <section aria-labelledby="your-review-heading" className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-5 sm:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">Your feedback</p>
              <h2 id="your-review-heading" className="mt-1 text-xl font-semibold">Course review</h2>
            </div>
          </div>
          {reviewsQuery.isLoading && <p role="status" className="mt-4 text-sm text-slate-400">Loading your review…</p>}
          {reviewsQuery.isError && (
            <div className="mt-4 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">
              <p>{reviewsQuery.error instanceof Error ? reviewsQuery.error.message : 'Unable to load reviews.'}</p>
              <button type="button" onClick={() => void reviewsQuery.refetch()} className="mt-3 rounded-lg border border-red-200/30 px-3 py-2 font-medium hover:bg-red-300/10">Try again</button>
            </div>
          )}
          {!reviewsQuery.isLoading && !reviewsQuery.isError && reviewsQuery.isSuccess && (
            <>
              {ownReview && (
                editingReviewId === ownReview.id ? (
                  <div>
                    <ReviewEditor
                      key={`${ownReview.id}-${ownReview.updatedAt}`}
                      initialRating={ownReview.rating}
                      initialReview={ownReview.review ?? ''}
                      isPending={reviewMutation.isPending || deleteReviewMutation.isPending}
                      submitLabel="Save changes"
                      onSubmit={(input) => {
                        setReviewFeedback('')
                        reviewMutation.mutate({ ...input, reviewId: ownReview.id })
                      }}
                    />
                    <div className="mt-3 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={reviewMutation.isPending || deleteReviewMutation.isPending}
                        onClick={() => setEditingReviewId(null)}
                        className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <DeleteReviewButton
                        isPending={reviewMutation.isPending || deleteReviewMutation.isPending}
                        isDeleting={deleteReviewMutation.isPending}
                        onDelete={() => {
                          if (window.confirm('Delete your review for this course? This cannot be undone.')) {
                            setReviewFeedback('')
                            deleteReviewMutation.mutate(ownReview.id)
                          }
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold text-amber-300" aria-label={`${ownReview.rating} out of 5 stars`}>
                        {ownReview.rating} / 5
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={reviewMutation.isPending || deleteReviewMutation.isPending}
                          onClick={() => setEditingReviewId(ownReview.id)}
                          className="rounded-lg border border-indigo-400/40 px-3 py-2 text-sm font-medium text-indigo-200 transition hover:bg-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Edit review
                        </button>
                        <DeleteReviewButton
                          isPending={reviewMutation.isPending || deleteReviewMutation.isPending}
                          isDeleting={deleteReviewMutation.isPending}
                          onDelete={() => {
                            if (window.confirm('Delete your review for this course? This cannot be undone.')) {
                              setReviewFeedback('')
                              deleteReviewMutation.mutate(ownReview.id)
                            }
                          }}
                        />
                      </div>
                    </div>
                    {ownReview.review && (
                      <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{ownReview.review}</p>
                    )}
                    <time dateTime={ownReview.createdAt} className="mt-3 block text-xs text-slate-500">
                      Reviewed {new Date(ownReview.createdAt).toLocaleDateString()}
                    </time>
                  </div>
                )
              )}
              {!ownReview && (
                <ReviewEditor
                  key="new-review"
                  initialRating=""
                  initialReview=""
                  isPending={reviewMutation.isPending || deleteReviewMutation.isPending}
                  submitLabel="Submit review"
                  onSubmit={(input) => {
                    setReviewFeedback('')
                    reviewMutation.mutate(input)
                  }}
                />
              )}
              {reviewFeedback && (
                <p role={reviewMutation.isError || deleteReviewMutation.isError ? 'alert' : 'status'} className={`mt-3 text-sm ${reviewMutation.isError || deleteReviewMutation.isError ? 'text-red-300' : 'text-green-300'}`}>
                  {reviewFeedback}
                </p>
              )}
            </>
          )}
        </section>

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

function DeleteReviewButton({
  isPending,
  isDeleting,
  onDelete,
}: {
  isPending: boolean
  isDeleting: boolean
  onDelete: () => void
}) {
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={onDelete}
      className="rounded-lg border border-red-400/30 px-3 py-2 text-sm font-medium text-red-200 transition hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isDeleting ? 'Deleting…' : 'Delete review'}
    </button>
  )
}

function ReviewEditor({
  initialRating,
  initialReview,
  isPending,
  submitLabel,
  onSubmit,
}: {
  initialRating: number | ''
  initialReview: string
  isPending: boolean
  submitLabel: string
  onSubmit: (input: ReviewInput) => void
}) {
  const [rating, setRating] = useState<number | ''>(initialRating)
  const [review, setReview] = useState(initialReview)
  const [validationError, setValidationError] = useState('')

  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (typeof rating !== 'number' || !Number.isInteger(rating) || rating < 1 || rating > 5) {
          setValidationError('Choose a rating from 1 to 5.')
          return
        }
        setValidationError('')
        onSubmit({ rating, review })
      }}
    >
      <div>
        <label htmlFor="course-review-rating" className="mb-2 block text-sm font-medium text-slate-200">Your rating</label>
        <select
          id="course-review-rating"
          value={rating}
          onChange={(event) => setRating(event.target.value ? Number(event.target.value) : '')}
          disabled={isPending}
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-white outline-none focus:border-indigo-400 sm:max-w-xs"
        >
          <option value="">Select a rating</option>
          {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value} / 5</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="course-review-text" className="mb-2 block text-sm font-medium text-slate-200">Written review <span className="font-normal text-slate-500">(optional)</span></label>
        <textarea
          id="course-review-text"
          rows={4}
          value={review}
          onChange={(event) => setReview(event.target.value)}
          disabled={isPending}
          placeholder="Share what you found helpful about this course."
          className="w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 outline-none focus:border-indigo-400"
        />
      </div>
      {validationError && <p role="alert" className="text-sm text-red-300">{validationError}</p>}
      <button type="submit" disabled={isPending} className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
        {isPending ? 'Saving review…' : submitLabel}
      </button>
    </form>
  )
}

export default StudentCoursePage
