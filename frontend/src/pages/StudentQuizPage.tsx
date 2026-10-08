import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { apiRequest } from '../api/client'
import { useAuth } from '../auth/AuthContext'

interface QuizOption {
  id: number
  text: string
}

interface QuizQuestion {
  id: number
  question: string
  quizId: number
  options: QuizOption[]
}

interface Quiz {
  id: number
  title: string
  lessonId: number
  lesson: {
    id: number
    title: string
    module: {
      courseId: number
    }
  }
  questions: QuizQuestion[]
}

interface QuizResponse {
  success: boolean
  data: Quiz
}

interface SubmitAnswer {
  questionId: number
  optionId: number
}

interface SubmitQuizResponse {
  success: boolean
  message: string
  data: {
    attemptId: number
    quizId: number
    totalQuestions: number
    correctAnswers: number
    score: number
    attemptedAt: string
  }
}

function StudentQuizPage() {
  const { quizId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  const quizIdNumber = Number(quizId)

  const [selectedAnswers, setSelectedAnswers] = useState<
    Record<number, number>
  >({})

  const [submitted, setSubmitted] = useState(false)

  const quizQuery = useQuery({
    queryKey: ['student-quiz', user?.id, quizIdNumber],
    queryFn: async () => {
      const response = await apiRequest<QuizResponse>(
        `/quizzes/${quizIdNumber}`,
      )

      return response.data
    },
    enabled:
      Boolean(user) &&
      Number.isInteger(quizIdNumber) &&
      quizIdNumber > 0,
  })

  const submitMutation = useMutation({
    mutationFn: async (answers: SubmitAnswer[]) => {
      return apiRequest<SubmitQuizResponse>(
        `/quizzes/${quizIdNumber}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ answers }),
        },
      )
    },
    onSuccess: () => {
      setSubmitted(true)
    },
  })

  if (quizQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-white">
        <p className="text-slate-400">
          Loading quiz...
        </p>
      </div>
    )
  }

  if (quizQuery.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold">
            Unable to load quiz
          </h1>

          <p className="mt-2 text-slate-400">
            {quizQuery.error instanceof Error
              ? quizQuery.error.message
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

  const quiz = quizQuery.data

  if (!quiz) {
    return null
  }

  const handleOptionChange = (
    questionId: number,
    optionId: number,
  ) => {
    setSelectedAnswers((current) => ({
      ...current,
      [questionId]: optionId,
    }))
  }

  const handleSubmit = () => {
    if (submitMutation.isPending || submitted) {
      return
    }

    const answers: SubmitAnswer[] = quiz.questions
      .filter(
        (question) =>
          selectedAnswers[question.id] !== undefined,
      )
      .map((question) => ({
        questionId: question.id,
        optionId: selectedAnswers[question.id],
      }))

    if (answers.length !== quiz.questions.length) {
      return
    }

    submitMutation.mutate(answers)
  }

  const answeredCount = quiz.questions.filter(
    (question) =>
      selectedAnswers[question.id] !== undefined,
  ).length

  const allQuestionsAnswered =
    answeredCount === quiz.questions.length

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
            to={`/student/courses/${quiz.lesson.module.courseId}/lessons/${quiz.lessonId}`}
            className="text-sm text-slate-300 hover:text-white"
          >
            ← Back to Lesson
          </Link>
        </div>
      </nav>

      <main className="mx-auto max-w-4xl px-6 py-10">
        {/* Quiz Header */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">
          <p className="text-sm font-medium uppercase tracking-wide text-indigo-400">
            Quiz
          </p>

          <h1 className="mt-2 text-3xl font-bold">
            {quiz.title}
          </h1>

          <p className="mt-3 text-slate-400">
            Lesson: {quiz.lesson.title}
          </p>

          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="text-slate-400">
              Questions: {quiz.questions.length}
            </span>

            <span className="text-slate-400">
              Answered: {answeredCount}/{quiz.questions.length}
            </span>
          </div>
        </div>

        {/* Submitted Result */}
        {submitted && submitMutation.data && (
          <div className="mt-6 rounded-2xl border border-green-400/20 bg-green-400/10 p-6">
            <p className="text-sm font-medium uppercase tracking-wide text-green-400">
              Quiz Completed
            </p>

            <h2 className="mt-2 text-3xl font-bold">
              Score: {submitMutation.data.data.score}%
            </h2>

            <p className="mt-2 text-slate-300">
              You answered{' '}
              {submitMutation.data.data.correctAnswers} out of{' '}
              {submitMutation.data.data.totalQuestions} questions
              correctly.
            </p>

            <Link
              to={`/student/courses/${quiz.lesson.module.courseId}/lessons/${quiz.lessonId}`}
              className="mt-5 inline-block rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold hover:bg-indigo-500"
            >
              Back to Lesson
            </Link>
          </div>
        )}

        {/* Questions */}
        {!submitted && (
          <section className="mt-8 space-y-6">
            {quiz.questions.map((question, index) => (
              <div
                key={question.id}
                className="rounded-2xl border border-slate-800 bg-slate-900 p-6"
              >
                <div className="flex gap-3">
                  <span className="text-sm font-semibold text-indigo-400">
                    Q{index + 1}
                  </span>

                  <h2 className="text-lg font-semibold">
                    {question.question}
                  </h2>
                </div>

                <div className="mt-5 space-y-3">
                  {question.options.map((option) => (
                    <label
                      key={option.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition ${
                        selectedAnswers[question.id] ===
                        option.id
                          ? 'border-indigo-500 bg-indigo-500/10'
                          : 'border-slate-800 hover:border-slate-700 hover:bg-white/5'
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${question.id}`}
                        value={option.id}
                        checked={
                          selectedAnswers[question.id] ===
                          option.id
                        }
                        onChange={() =>
                          handleOptionChange(
                            question.id,
                            option.id,
                          )
                        }
                        className="h-4 w-4 accent-indigo-500"
                      />

                      <span className="text-slate-200">
                        {option.text}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            {/* Submit Error */}
            {submitMutation.isError && (
              <div className="rounded-xl border border-red-400/20 bg-red-400/10 p-4 text-red-300">
                {submitMutation.error instanceof Error
                  ? submitMutation.error.message
                  : 'Failed to submit quiz.'}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex flex-col items-end gap-3">
              {!allQuestionsAnswered && (
                <p className="text-sm text-slate-500">
                  Answer all questions before submitting.
                </p>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={
                  !allQuestionsAnswered ||
                  submitMutation.isPending
                }
                className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitMutation.isPending
                  ? 'Submitting...'
                  : 'Submit Quiz'}
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default StudentQuizPage