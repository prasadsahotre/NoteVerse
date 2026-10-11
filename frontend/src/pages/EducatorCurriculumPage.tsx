import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { apiRequest } from '../api/client'

interface CurriculumLesson {
  id: number
  title: string
  content: string | null
  position: number
  moduleId: number
  youtubeVideoId: string | null
}

interface LessonQuestion {
  id: number
  lessonId: number
  question: string
  answer: string | null
  answeredAt: string | null
  createdAt: string
  user: { id: number; name: string }
}

interface LessonQuestionsResponse {
  success: boolean
  data: LessonQuestion[]
}

interface CurriculumModule {
  id: number
  title: string
  position: number
  courseId: number
  lessons: CurriculumLesson[]
}

interface CourseCurriculum {
  id: number
  title: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED'
  modules: CurriculumModule[]
}

interface CurriculumResponse {
  success: boolean
  message?: string
  data: CourseCurriculum
}

interface MutationResponse {
  success: boolean
  message: string
}

interface ModuleFormState {
  moduleId: number | null
}

interface LessonFormState {
  moduleId: number
  lessonId: number | null
}

function EducatorCurriculumPage() {
  const { user } = useAuth()
  const { courseId } = useParams()
  const queryClient = useQueryClient()
  const courseIdNumber = Number(courseId)
  const validCourseId = Number.isInteger(courseIdNumber) && courseIdNumber > 0

  const [moduleForm, setModuleForm] = useState<ModuleFormState | null>(null)
  const [moduleTitle, setModuleTitle] = useState('')
  const [modulePosition, setModulePosition] = useState('1')
  const [lessonForm, setLessonForm] = useState<LessonFormState | null>(null)
  const [lessonTitle, setLessonTitle] = useState('')
  const [lessonContent, setLessonContent] = useState('')
  const [lessonYoutubeUrl, setLessonYoutubeUrl] = useState('')
  const [lessonPosition, setLessonPosition] = useState('1')
  const [validationError, setValidationError] = useState('')
  const [feedback, setFeedback] = useState('')
  const [answerDrafts, setAnswerDrafts] = useState<Record<number, string>>({})
  const [answerValidationErrors, setAnswerValidationErrors] = useState<Record<number, string>>({})
  const [answerFeedback, setAnswerFeedback] = useState<{ questionId: number; message: string } | null>(null)

  const isApprovedEducator = user?.educatorApprovalStatus === 'APPROVED'

  const curriculumQuery = useQuery({
    queryKey: ['educator-curriculum', user?.id, courseIdNumber],
    queryFn: async () => {
      const response = await apiRequest<CurriculumResponse>(
        `/courses/${courseIdNumber}/curriculum`,
      )
      return response.data
    },
    enabled: Boolean(isApprovedEducator && validCourseId),
  })

  const lessonsForQuestions = curriculumQuery.data?.modules.flatMap((module) => module.lessons) ?? []
  const lessonQuestionQueries = useQueries({
    queries: lessonsForQuestions.map((lesson) => ({
      queryKey: ['lesson-questions', user?.id, lesson.id],
      queryFn: async () => {
        const response = await apiRequest<LessonQuestionsResponse>(
          `/lesson-questions/lesson/${lesson.id}`,
        )
        return response.data
      },
      enabled: Boolean(isApprovedEducator && curriculumQuery.isSuccess),
    })),
  })

  const refreshCurriculum = async () => {
    await queryClient.invalidateQueries({
      queryKey: ['educator-curriculum', user?.id, courseIdNumber],
    })
    await queryClient.invalidateQueries({
      queryKey: ['educator-courses', user?.id],
    })
    await queryClient.invalidateQueries({
      queryKey: ['educator-analytics', user?.id],
    })
  }

  const createModuleMutation = useMutation({
    mutationFn: (values: { title: string; position: number }) =>
      apiRequest<MutationResponse>('/modules', {
        method: 'POST',
        body: JSON.stringify({ ...values, courseId: courseIdNumber }),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Module created successfully.')
      setModuleForm(null)
      await refreshCurriculum()
    },
  })

  const updateModuleMutation = useMutation({
    mutationFn: ({ id, ...values }: { id: number; title: string; position: number }) =>
      apiRequest<MutationResponse>(`/modules/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Module updated successfully.')
      setModuleForm(null)
      await refreshCurriculum()
    },
  })

  const deleteModuleMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest<MutationResponse>(`/modules/${id}`, { method: 'DELETE' }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Module deleted successfully.')
      await refreshCurriculum()
    },
  })

  const createLessonMutation = useMutation({
    mutationFn: (values: { title: string; content: string | null; position: number; moduleId: number; youtubeUrl: string | null }) =>
      apiRequest<MutationResponse>('/lessons', {
        method: 'POST',
        body: JSON.stringify(values),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Lesson created successfully.')
      setLessonForm(null)
      await refreshCurriculum()
    },
  })

  const updateLessonMutation = useMutation({
    mutationFn: ({ id, ...values }: { id: number; title: string; content: string | null; position: number; youtubeUrl: string | null }) =>
      apiRequest<MutationResponse>(`/lessons/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(values),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Lesson updated successfully.')
      setLessonForm(null)
      await refreshCurriculum()
    },
  })

  const deleteLessonMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest<MutationResponse>(`/lessons/${id}`, { method: 'DELETE' }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Lesson deleted successfully.')
      await refreshCurriculum()
    },
  })

  const answerQuestionMutation = useMutation({
    mutationFn: ({ questionId, answer }: { lessonId: number; questionId: number; answer: string }) =>
      apiRequest<MutationResponse>(`/lesson-questions/${questionId}/answer`, {
        method: 'PATCH',
        body: JSON.stringify({ answer }),
      }),
    onSuccess: async (response, variables) => {
      setAnswerFeedback({
        questionId: variables.questionId,
        message: response.message || 'Answer saved successfully.',
      })
      setAnswerValidationErrors((current) => ({ ...current, [variables.questionId]: '' }))
      await queryClient.invalidateQueries({
        queryKey: ['lesson-questions', user?.id, variables.lessonId],
      })
    },
  })

  const getQuestionsQueryForLesson = (lessonId: number) => {
    const index = lessonsForQuestions.findIndex((lesson) => lesson.id === lessonId)
    return index < 0 ? undefined : lessonQuestionQueries[index]
  }

  const mutationError = [
    createModuleMutation.error,
    updateModuleMutation.error,
    deleteModuleMutation.error,
    createLessonMutation.error,
    updateLessonMutation.error,
    deleteLessonMutation.error,
  ].find(Boolean)

  const isSaving =
    createModuleMutation.isPending ||
    updateModuleMutation.isPending ||
    deleteModuleMutation.isPending ||
    createLessonMutation.isPending ||
    updateLessonMutation.isPending ||
    deleteLessonMutation.isPending

  const resetMutationErrors = () => {
    createModuleMutation.reset()
    updateModuleMutation.reset()
    deleteModuleMutation.reset()
    createLessonMutation.reset()
    updateLessonMutation.reset()
    deleteLessonMutation.reset()
  }

  const openCreateModule = () => {
    resetMutationErrors()
    const nextPosition = Math.max(0, ...(curriculumQuery.data?.modules.map((item) => item.position) ?? [])) + 1
    setModuleTitle('')
    setModulePosition(String(nextPosition))
    setModuleForm({ moduleId: null })
    setLessonForm(null)
    setValidationError('')
    setFeedback('')
  }

  const openEditModule = (module: CurriculumModule) => {
    resetMutationErrors()
    setModuleTitle(module.title)
    setModulePosition(String(module.position))
    setModuleForm({ moduleId: module.id })
    setLessonForm(null)
    setValidationError('')
    setFeedback('')
  }

  const openCreateLesson = (module: CurriculumModule) => {
    resetMutationErrors()
    const nextPosition = Math.max(0, ...module.lessons.map((item) => item.position)) + 1
    setLessonTitle('')
    setLessonContent('')
    setLessonYoutubeUrl('')
    setLessonPosition(String(nextPosition))
    setLessonForm({ moduleId: module.id, lessonId: null })
    setModuleForm(null)
    setValidationError('')
    setFeedback('')
  }

  const openEditLesson = (moduleId: number, lesson: CurriculumLesson) => {
    resetMutationErrors()
    setLessonTitle(lesson.title)
    setLessonContent(lesson.content ?? '')
    setLessonYoutubeUrl(lesson.youtubeVideoId ? `https://www.youtube.com/watch?v=${lesson.youtubeVideoId}` : '')
    setLessonPosition(String(lesson.position))
    setLessonForm({ moduleId, lessonId: lesson.id })
    setModuleForm(null)
    setValidationError('')
    setFeedback('')
  }

  const submitModule = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError('')
    setFeedback('')
    const trimmedTitle = moduleTitle.trim()
    const numericPosition = Number(modulePosition)
    if (!trimmedTitle) return setValidationError('Enter a module title.')
    if (!Number.isInteger(numericPosition) || numericPosition < 1) {
      return setValidationError('Position must be a positive whole number.')
    }
    if (moduleForm?.moduleId === null) {
      createModuleMutation.mutate({ title: trimmedTitle, position: numericPosition })
    } else if (moduleForm) {
      updateModuleMutation.mutate({ id: moduleForm.moduleId, title: trimmedTitle, position: numericPosition })
    }
  }

  const submitLesson = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setValidationError('')
    setFeedback('')
    const trimmedTitle = lessonTitle.trim()
    const numericPosition = Number(lessonPosition)
    if (!trimmedTitle) return setValidationError('Enter a lesson title.')
    if (!Number.isInteger(numericPosition) || numericPosition < 1) {
      return setValidationError('Position must be a positive whole number.')
    }
    if (!lessonForm) return
    const content = lessonContent.trim() || null
    const youtubeUrl = lessonYoutubeUrl.trim() || null
    if (lessonForm.lessonId === null) {
      createLessonMutation.mutate({
        title: trimmedTitle,
        content,
        position: numericPosition,
        moduleId: lessonForm.moduleId,
        youtubeUrl,
      })
    } else {
      updateLessonMutation.mutate({
        id: lessonForm.lessonId,
        title: trimmedTitle,
        content,
        position: numericPosition,
        youtubeUrl,
      })
    }
  }

  const removeModule = (module: CurriculumModule) => {
    if (!window.confirm(`Delete module “${module.title}”? This cannot be undone.`)) return
    resetMutationErrors()
    setFeedback('')
    deleteModuleMutation.mutate(module.id)
  }

  const removeLesson = (lesson: CurriculumLesson) => {
    if (!window.confirm(`Delete lesson “${lesson.title}”? Any related learning records or resources will prevent deletion.`)) return
    resetMutationErrors()
    setFeedback('')
    deleteLessonMutation.mutate(lesson.id)
  }

  if (!isApprovedEducator) return <Navigate to="/educator" replace />

  const backLink = (
    <Link to="/educator" className="inline-flex items-center gap-2 text-sm font-medium text-indigo-300 transition hover:text-indigo-200">
      <span aria-hidden="true">←</span> Back to course workspace
    </Link>
  )

  return (
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-950/40 via-slate-950 to-slate-950 px-4 py-8 text-white sm:px-6 lg:py-12">
      <main className="mx-auto max-w-5xl">
        <header className="mb-8 space-y-4">
          {backLink}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-indigo-300">Educator workspace</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Curriculum Builder</h1>
              {curriculumQuery.data && <p className="mt-2 text-slate-300">{curriculumQuery.data.title}</p>}
            </div>
            {curriculumQuery.data && (
              <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${curriculumQuery.data.status === 'PUBLISHED' ? 'bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20' : 'bg-slate-700/60 text-slate-300 ring-1 ring-white/10'}`}>
                {curriculumQuery.data.status === 'PUBLISHED' ? 'Published' : 'Draft'}
              </span>
            )}
          </div>
        </header>

        {!validCourseId && (
          <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
            Invalid course ID. {backLink}
          </div>
        )}
        {validCourseId && curriculumQuery.isLoading && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-10 text-center text-slate-400">Loading curriculum…</div>
        )}
        {validCourseId && curriculumQuery.isError && (
          <div role="alert" className="rounded-2xl border border-red-400/20 bg-red-400/[0.07] p-6 text-red-200">
            <p>{curriculumQuery.error instanceof Error ? curriculumQuery.error.message : 'Unable to load this curriculum.'}</p>
            <button type="button" onClick={() => void curriculumQuery.refetch()} className="mt-4 rounded-xl border border-red-300/30 px-4 py-2 text-sm font-medium hover:bg-red-400/10">Try again</button>
          </div>
        )}

        {curriculumQuery.data && (
          <>
            {feedback && <p role="status" className="mb-5 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">{feedback}</p>}
            {mutationError && (
              <p role="alert" className="mb-5 rounded-xl border border-red-400/20 bg-red-400/[0.07] px-4 py-3 text-sm text-red-200">
                {mutationError instanceof Error ? mutationError.message : 'The requested change could not be completed.'}
              </p>
            )}

            <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">Modules and lessons</h2>
                <p className="mt-1 text-sm text-slate-400">Items are shown in position order. Edit a position to change the sequence.</p>
              </div>
              <button type="button" onClick={openCreateModule} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400">Add module</button>
            </div>

            {moduleForm?.moduleId === null && (
              <form onSubmit={submitModule} className="mb-5 rounded-2xl border border-indigo-400/20 bg-slate-900 p-5 sm:p-6">
                <h3 className="font-semibold text-white">Create module</h3>
                <ModuleFields title={moduleTitle} setTitle={setModuleTitle} position={modulePosition} setPosition={setModulePosition} />
                <FormActions onCancel={() => setModuleForm(null)} pending={createModuleMutation.isPending} submitLabel="Create module" />
                {validationError && <p role="alert" className="mt-3 text-sm text-red-300">{validationError}</p>}
              </form>
            )}

            {curriculumQuery.data.modules.length === 0 && !moduleForm && (
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center">
                <p className="font-medium text-slate-200">No modules yet</p>
                <p className="mt-2 text-sm text-slate-400">Add a module to begin structuring this course.</p>
              </div>
            )}

            <div className="space-y-4">
              {curriculumQuery.data.modules.map((module) => (
                <section key={module.id} aria-labelledby={`module-${module.id}`} className="rounded-2xl border border-slate-800 bg-slate-900 p-4 sm:p-6">
                  {moduleForm?.moduleId === module.id ? (
                    <form onSubmit={submitModule}>
                      <h3 className="font-semibold text-white">Edit module</h3>
                      <ModuleFields title={moduleTitle} setTitle={setModuleTitle} position={modulePosition} setPosition={setModulePosition} />
                      <FormActions onCancel={() => setModuleForm(null)} pending={updateModuleMutation.isPending} submitLabel="Save module" />
                      {validationError && <p role="alert" className="mt-3 text-sm text-red-300">{validationError}</p>}
                    </form>
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-400/10 text-sm font-bold text-indigo-300">{module.position}</span>
                          <div className="min-w-0">
                            <h3 id={`module-${module.id}`} className="break-words text-lg font-semibold text-white">{module.title}</h3>
                            <p className="mt-1 text-xs text-slate-500">{module.lessons.length} {module.lessons.length === 1 ? 'lesson' : 'lessons'}</p>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => openCreateLesson(module)} className="rounded-lg border border-indigo-400/30 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/10">Add lesson</button>
                          <button type="button" onClick={() => openEditModule(module)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Edit module</button>
                          <button type="button" onClick={() => removeModule(module)} disabled={isSaving || module.lessons.length > 0} title={module.lessons.length > 0 ? 'Delete its lessons first; protected lessons cannot be deleted.' : undefined} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">Delete module</button>
                        </div>
                      </div>
                      {module.lessons.length > 0 && (
                        <p className="mt-3 text-xs text-slate-500">
                          Delete is unavailable while this module contains lessons. Lessons with learning records or resources are protected.
                        </p>
                      )}

                      {module.lessons.length > 0 ? (
                        <ol className="mt-5 space-y-3 border-l border-slate-700 pl-4 sm:ml-4 sm:pl-6">
                          {module.lessons.map((lesson) => (
                            <li key={lesson.id} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                              {lessonForm?.lessonId === lesson.id ? (
                                <form onSubmit={submitLesson}>
                                  <h4 className="font-semibold text-white">Edit lesson</h4>
                                  <LessonFields title={lessonTitle} setTitle={setLessonTitle} content={lessonContent} setContent={setLessonContent} youtubeUrl={lessonYoutubeUrl} setYoutubeUrl={setLessonYoutubeUrl} position={lessonPosition} setPosition={setLessonPosition} />
                                  <FormActions onCancel={() => setLessonForm(null)} pending={updateLessonMutation.isPending} submitLabel="Save lesson" />
                                  {validationError && <p role="alert" className="mt-3 text-sm text-red-300">{validationError}</p>}
                                </form>
                              ) : (
                                <>
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                      <span className="mt-0.5 text-xs font-bold tabular-nums text-slate-500">{module.position}.{lesson.position}</span>
                                      <div className="min-w-0">
                                        <h4 className="break-words font-medium text-slate-100">{lesson.title}</h4>
                                        <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-slate-400">{lesson.content || 'No lesson content yet.'}</p>
                                      </div>
                                    </div>
                                    <div className="flex shrink-0 gap-2">
                                      <button type="button" onClick={() => openEditLesson(module.id, lesson)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Edit</button>
                                      <button type="button" onClick={() => removeLesson(lesson)} disabled={isSaving} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
                                    </div>
                                  </div>
                                </>
                              )}

                              {(() => {
                                const questionsQuery = getQuestionsQueryForLesson(lesson.id)
                                return (
                                  <section aria-label={`Questions for ${lesson.title}`} className="mt-5 border-t border-slate-800 pt-4">
                                    <h5 className="text-sm font-semibold text-indigo-200">Student questions</h5>
                                    {questionsQuery?.isLoading && <p role="status" className="mt-3 text-sm text-slate-500">Loading lesson questions...</p>}
                                    {questionsQuery?.isError && (
                                      <div role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">
                                        <p>{questionsQuery.error instanceof Error ? questionsQuery.error.message : 'Unable to load questions.'}</p>
                                        <button type="button" onClick={() => void questionsQuery.refetch()} className="mt-2 underline hover:text-red-100">Try again</button>
                                      </div>
                                    )}
                                    {questionsQuery?.data?.length === 0 && (
                                      <p className="mt-3 text-sm text-slate-500">No student questions for this lesson yet.</p>
                                    )}
                                    {questionsQuery?.data && questionsQuery.data.length > 0 && (
                                      <ol className="mt-3 space-y-3">
                                        {questionsQuery.data.map((question) => (
                                          <li key={question.id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-4">
                                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                                              <span className="font-medium text-slate-300">{question.user.name}</span>
                                              <time dateTime={question.createdAt}>{new Date(question.createdAt).toLocaleDateString()}</time>
                                            </div>
                                            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">{question.question}</p>
                                            <form
                                              className="mt-4"
                                              onSubmit={(event) => {
                                                event.preventDefault()
                                                const answer = (answerDrafts[question.id] ?? question.answer ?? '').trim()
                                                setAnswerFeedback(null)
                                                if (!answer) {
                                                  setAnswerValidationErrors((current) => ({ ...current, [question.id]: 'Enter an answer before saving.' }))
                                                  return
                                                }
                                                setAnswerValidationErrors((current) => ({ ...current, [question.id]: '' }))
                                                answerQuestionMutation.mutate({ lessonId: lesson.id, questionId: question.id, answer })
                                              }}
                                            >
                                              <label htmlFor={`lesson-question-answer-${question.id}`} className="block text-xs font-medium text-slate-300">Educator answer</label>
                                              <textarea
                                                id={`lesson-question-answer-${question.id}`}
                                                rows={3}
                                                value={answerDrafts[question.id] ?? question.answer ?? ''}
                                                onChange={(event) => setAnswerDrafts((current) => ({ ...current, [question.id]: event.target.value }))}
                                                disabled={answerQuestionMutation.isPending}
                                                className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 disabled:opacity-60"
                                              />
                                              {answerValidationErrors[question.id] && <p role="alert" className="mt-2 text-xs text-red-300">{answerValidationErrors[question.id]}</p>}
                                              {answerQuestionMutation.isError && answerQuestionMutation.variables?.questionId === question.id && (
                                                <p role="alert" className="mt-2 text-xs text-red-300">{answerQuestionMutation.error instanceof Error ? answerQuestionMutation.error.message : 'Unable to save the answer.'}</p>
                                              )}
                                              {answerFeedback?.questionId === question.id && <p role="status" className="mt-2 text-xs text-emerald-300">{answerFeedback.message}</p>}
                                              <button type="submit" disabled={answerQuestionMutation.isPending} className="mt-3 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-60">
                                                {answerQuestionMutation.isPending && answerQuestionMutation.variables?.questionId === question.id
                                                  ? 'Saving answer...'
                                                  : question.answer ? 'Update answer' : 'Answer question'}
                                              </button>
                                            </form>
                                          </li>
                                        ))}
                                      </ol>
                                    )}
                                  </section>
                                )
                              })()}

                              <QuizManager lessonId={lesson.id} lessonTitle={lesson.title} />
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-5 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">No lessons in this module yet.</p>
                      )}

                      {lessonForm?.moduleId === module.id && lessonForm.lessonId === null && (
                        <form onSubmit={submitLesson} className="mt-4 rounded-xl border border-indigo-400/20 bg-slate-950/70 p-4 sm:p-5">
                          <h4 className="font-semibold text-white">Create lesson</h4>
                          <LessonFields title={lessonTitle} setTitle={setLessonTitle} content={lessonContent} setContent={setLessonContent} youtubeUrl={lessonYoutubeUrl} setYoutubeUrl={setLessonYoutubeUrl} position={lessonPosition} setPosition={setLessonPosition} />
                          <FormActions onCancel={() => setLessonForm(null)} pending={createLessonMutation.isPending} submitLabel="Create lesson" />
                          {validationError && <p role="alert" className="mt-3 text-sm text-red-300">{validationError}</p>}
                        </form>
                      )}
                    </>
                  )}
                </section>
              ))}
            </div>

            {isSaving && <p role="status" className="mt-5 text-sm text-slate-400">Saving curriculum changes…</p>}
          </>
        )}
      </main>
    </div>
  )
}

function ModuleFields({
  title,
  setTitle,
  position,
  setPosition,
}: {
  title: string
  setTitle: (value: string) => void
  position: string
  setPosition: (value: string) => void
}) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
      <div>
        <label htmlFor="module-title" className="block text-sm font-medium text-slate-200">Module title</label>
        <input id="module-title" value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
      </div>
      <div>
        <label htmlFor="module-position" className="block text-sm font-medium text-slate-200">Position</label>
        <input id="module-position" type="number" min={1} step={1} value={position} onChange={(event) => setPosition(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
      </div>
    </div>
  )
}

function LessonFields({
  title,
  setTitle,
  content,
  setContent,
  youtubeUrl,
  setYoutubeUrl,
  position,
  setPosition,
}: {
  title: string
  setTitle: (value: string) => void
  content: string
  setContent: (value: string) => void
  youtubeUrl: string
  setYoutubeUrl: (value: string) => void
  position: string
  setPosition: (value: string) => void
}) {
  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
      <div>
        <label htmlFor="lesson-title" className="block text-sm font-medium text-slate-200">Lesson title</label>
        <input id="lesson-title" value={title} onChange={(event) => setTitle(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
      </div>
      <div>
        <label htmlFor="lesson-position" className="block text-sm font-medium text-slate-200">Position</label>
        <input id="lesson-position" type="number" min={1} step={1} value={position} onChange={(event) => setPosition(event.target.value)} required className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="lesson-content" className="block text-sm font-medium text-slate-200">Lesson content <span className="font-normal text-slate-500">(optional)</span></label>
        <textarea id="lesson-content" rows={4} value={content} onChange={(event) => setContent(event.target.value)} className="mt-2 w-full resize-y rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm leading-6 text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor="lesson-youtube-url" className="block text-sm font-medium text-slate-200">YouTube video URL <span className="font-normal text-slate-500">(optional)</span></label>
        <input id="lesson-youtube-url" type="url" inputMode="url" autoComplete="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
        <p className="mt-2 text-xs leading-5 text-slate-500">You can paste a YouTube watch, short, embed, or youtu.be link. Clear this field to remove the video.</p>
      </div>
    </div>
  )
}

function FormActions({ onCancel, pending, submitLabel }: { onCancel: () => void; pending: boolean; submitLabel: string }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3">
      <button type="submit" disabled={pending} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60">
        {pending ? 'Saving…' : submitLabel}
      </button>
      <button type="button" onClick={onCancel} disabled={pending} className="rounded-xl border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">Cancel</button>
    </div>
  )
}


type QuizOption = { id?: number; text: string; isCorrect: boolean }
type EducatorQuizQuestion = { id: number; question: string; options: QuizOption[] }
type EducatorQuiz = {
  id: number
  title: string
  questions: EducatorQuizQuestion[]
  _count: { attempts: number }
}
type QuizListResponse = { success: boolean; message?: string; data: EducatorQuiz[] }
type QuizCreateQuestionResponse = { success: boolean; message?: string; data: EducatorQuizQuestion }
type QuizFormOption = { text: string; isCorrect: boolean }

const emptyQuizOptions = (): QuizFormOption[] => [
  { text: '', isCorrect: true },
  { text: '', isCorrect: false },
  { text: '', isCorrect: false },
  { text: '', isCorrect: false },
]

function QuizManager({ lessonId, lessonTitle }: { lessonId: number; lessonTitle: string }) {
  const queryClient = useQueryClient()
  const [quizTitle, setQuizTitle] = useState('')
  const [editingQuizId, setEditingQuizId] = useState<number | null>(null)
  const [editingQuizTitle, setEditingQuizTitle] = useState('')
  const [questionQuizId, setQuestionQuizId] = useState<number | null>(null)
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)
  const [questionText, setQuestionText] = useState('')
  const [questionOptions, setQuestionOptions] = useState<QuizFormOption[]>(emptyQuizOptions)
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')

  const quizzesQuery = useQuery({
    queryKey: ['educator-quizzes', lessonId],
    queryFn: async () => {
      const response = await apiRequest<QuizListResponse>(`/quizzes/lesson/${lessonId}`)
      return response.data
    },
  })

  const refreshQuizzes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['educator-quizzes', lessonId] })
  }

  const createQuizMutation = useMutation({
    mutationFn: (title: string) => apiRequest<MutationResponse>('/quizzes', {
      method: 'POST',
      body: JSON.stringify({ title, lessonId }),
    }),
    onSuccess: async (response) => {
      setQuizTitle('')
      setNotice(response.message || 'Quiz created successfully.')
      setFormError('')
      await refreshQuizzes()
    },
  })

  const updateQuizMutation = useMutation({
    mutationFn: ({ id, title }: { id: number; title: string }) => apiRequest<MutationResponse>(`/quizzes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    }),
    onSuccess: async (response) => {
      setEditingQuizId(null)
      setNotice(response.message || 'Quiz title updated successfully.')
      setFormError('')
      await refreshQuizzes()
    },
  })

  const deleteQuizMutation = useMutation({
    mutationFn: (id: number) => apiRequest<MutationResponse>(`/quizzes/${id}`, { method: 'DELETE' }),
    onSuccess: async (response) => {
      setNotice(response.message || 'Quiz deleted successfully.')
      await refreshQuizzes()
    },
  })

  const saveQuestionMutation = useMutation({
    mutationFn: (values: { quizId: number; questionId: number | null; question: string; options: QuizFormOption[] }) => {
      const body = JSON.stringify({ question: values.question, options: values.options })
      return values.questionId === null
        ? apiRequest<QuizCreateQuestionResponse>('/quizzes/questions', {
            method: 'POST',
            body: JSON.stringify({ quizId: values.quizId, question: values.question, options: values.options }),
          })
        : apiRequest<QuizCreateQuestionResponse>(`/quizzes/questions/${values.questionId}`, {
            method: 'PATCH',
            body,
          })
    },
    onSuccess: async (response) => {
      setQuestionQuizId(null)
      setEditingQuestionId(null)
      setQuestionText('')
      setQuestionOptions(emptyQuizOptions())
      setFormError('')
      setNotice(response.message || 'Question saved successfully.')
      await refreshQuizzes()
    },
  })

  const deleteQuestionMutation = useMutation({
    mutationFn: (id: number) => apiRequest<MutationResponse>(`/quizzes/questions/${id}`, { method: 'DELETE' }),
    onSuccess: async (response) => {
      setNotice(response.message || 'Question deleted successfully.')
      await refreshQuizzes()
    },
  })

  const mutationError = createQuizMutation.error || updateQuizMutation.error || deleteQuizMutation.error || saveQuestionMutation.error || deleteQuestionMutation.error
  const pending = createQuizMutation.isPending || updateQuizMutation.isPending || deleteQuizMutation.isPending || saveQuestionMutation.isPending || deleteQuestionMutation.isPending

  const beginQuestionForm = (quiz: EducatorQuiz, question?: EducatorQuizQuestion) => {
    setFormError('')
    setNotice('')
    setQuestionQuizId(quiz.id)
    setEditingQuestionId(question?.id ?? null)
    setQuestionText(question?.question ?? '')
    setQuestionOptions(question ? question.options.map((option) => ({ text: option.text, isCorrect: option.isCorrect })) : emptyQuizOptions())
  }

  const submitQuestion = (event: FormEvent<HTMLFormElement>, quizId: number) => {
    event.preventDefault()
    setFormError('')
    setNotice('')
    if (!questionText.trim()) return setFormError('Enter the question text.')
    if (questionOptions.some((option) => !option.text.trim())) return setFormError('Fill in all four answer options.')
    if (questionOptions.filter((option) => option.isCorrect).length !== 1) return setFormError('Select exactly one correct answer.')
    saveQuestionMutation.mutate({ quizId, questionId: editingQuestionId, question: questionText.trim(), options: questionOptions.map((option) => ({ ...option, text: option.text.trim() })) })
  }

  return (
    <section aria-label={`Quiz management for ${lessonTitle}`} className="mt-5 border-t border-slate-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h5 className="text-sm font-semibold text-indigo-200">Quiz management</h5>
          <p className="mt-1 text-xs leading-5 text-slate-500">Create lesson quizzes and manage four-option multiple-choice questions.</p>
        </div>
        <span className="rounded-full border border-indigo-400/20 bg-indigo-400/[0.07] px-2.5 py-1 text-xs font-medium text-indigo-200">Lesson quiz</span>
      </div>

      {notice && <p role="status" className="mt-3 rounded-lg border border-emerald-400/20 bg-emerald-400/[0.07] px-3 py-2 text-sm text-emerald-200">{notice}</p>}
      {mutationError && <p role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-sm text-red-200">{mutationError instanceof Error ? mutationError.message : 'The quiz change could not be completed.'}</p>}
      {formError && <p role="alert" className="mt-3 rounded-lg border border-red-400/20 bg-red-400/[0.07] px-3 py-2 text-sm text-red-200">{formError}</p>}

      <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
        event.preventDefault()
        const title = quizTitle.trim()
        if (!title) return setFormError('Enter a quiz title.')
        setFormError('')
        setNotice('')
        createQuizMutation.mutate(title)
      }}>
        <label htmlFor={`quiz-title-${lessonId}`} className="sr-only">New quiz title</label>
        <input id={`quiz-title-${lessonId}`} value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} placeholder="e.g. Lesson practice quiz" required className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
        <button type="submit" disabled={pending} className="rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60">{createQuizMutation.isPending ? 'Creating…' : 'Create quiz'}</button>
      </form>

      {quizzesQuery.isLoading && <p role="status" className="mt-4 text-sm text-slate-500">Loading quizzes…</p>}
      {quizzesQuery.isError && <div role="alert" className="mt-4 rounded-lg border border-red-400/20 bg-red-400/[0.07] p-3 text-sm text-red-200"><p>{quizzesQuery.error instanceof Error ? quizzesQuery.error.message : 'Unable to load quizzes.'}</p><button type="button" onClick={() => void quizzesQuery.refetch()} className="mt-2 underline">Try again</button></div>}
      {quizzesQuery.data?.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-slate-700 px-4 py-5 text-center text-sm text-slate-500">No quizzes for this lesson yet. Create one above.</p>}

      <div className="mt-4 space-y-3">
        {quizzesQuery.data?.map((quiz, quizIndex) => {
          const locked = quiz._count.attempts > 0
          return (
            <article key={quiz.id} className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
              <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-400/10 text-xs font-bold text-indigo-200">{quizIndex + 1}</span>
                  <div className="min-w-0 flex-1">
                    {editingQuizId === quiz.id ? (
                      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => {
                        event.preventDefault()
                        if (!editingQuizTitle.trim()) return setFormError('Enter a quiz title.')
                        updateQuizMutation.mutate({ id: quiz.id, title: editingQuizTitle.trim() })
                      }}>
                        <label htmlFor={`edit-quiz-title-${quiz.id}`} className="sr-only">Quiz title</label>
                        <input id={`edit-quiz-title-${quiz.id}`} value={editingQuizTitle} onChange={(event) => setEditingQuizTitle(event.target.value)} required className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400" />
                        <button type="submit" disabled={pending} className="rounded-lg bg-indigo-500 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">Save title</button>
                        <button type="button" onClick={() => setEditingQuizId(null)} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                      </form>
                    ) : <h6 className="break-words font-semibold text-slate-100">{quiz.title}</h6>}
                    <p className="mt-1 text-xs text-slate-500">{quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'} · {quiz._count.attempts} {quiz._count.attempts === 1 ? 'student attempt' : 'student attempts'}</p>
                    {locked && <p className="mt-2 text-xs leading-5 text-amber-200/80">Structure locked because students have attempted this quiz. This protects score history.</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={locked || pending} onClick={() => { setEditingQuizId(quiz.id); setEditingQuizTitle(quiz.title); setFormError(''); setNotice('') }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Rename</button>
                  <button type="button" disabled={locked || pending} onClick={() => { if (window.confirm(`Delete quiz “${quiz.title}”? This cannot be undone.`)) deleteQuizMutation.mutate(quiz.id) }} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">Delete quiz</button>
                </div>
              </div>

              <div className="space-y-3 px-4 pb-4">
                {quiz.questions.map((question, questionIndex) => (
                  <div key={question.id} className="rounded-lg border border-slate-800 bg-slate-900/70 p-3 sm:p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium leading-6 text-slate-100"><span className="mr-2 text-xs font-bold text-indigo-300">Q{questionIndex + 1}</span>{question.question}</p>
                        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
                          {question.options.map((option, optionIndex) => (
                            <li key={option.id ?? `${question.id}-${optionIndex}`} className={`rounded-lg border px-3 py-2 text-xs leading-5 ${option.isCorrect ? 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200' : 'border-slate-800 text-slate-400'}`}>
                              <span className="mr-2 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>{option.text}{option.isCorrect && <span className="ml-2 text-[10px] font-bold uppercase tracking-wide">Correct</span>}
                            </li>
                          ))}
                        </ol>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button type="button" disabled={locked || pending} onClick={() => beginQuestionForm(quiz, question)} className="rounded-lg border border-indigo-400/30 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-40">Edit</button>
                        <button type="button" disabled={locked || pending} onClick={() => { if (window.confirm('Delete this question? This cannot be undone.')) deleteQuestionMutation.mutate(question.id) }} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
                      </div>
                    </div>
                  </div>
                ))}

                {questionQuizId === quiz.id ? (
                  <form className="rounded-xl border border-indigo-400/20 bg-indigo-400/[0.035] p-4" onSubmit={(event) => submitQuestion(event, quiz.id)}>
                    <h6 className="font-semibold text-white">{editingQuestionId === null ? 'Add question' : 'Edit question'}</h6>
                    <label htmlFor={`quiz-question-${quiz.id}`} className="mt-3 block text-xs font-medium text-slate-300">Question text</label>
                    <textarea id={`quiz-question-${quiz.id}`} rows={3} value={questionText} onChange={(event) => setQuestionText(event.target.value)} required className="mt-2 w-full resize-y rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm leading-6 text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
                    <p className="mt-4 text-xs font-medium text-slate-300">Answer options <span className="font-normal text-slate-500">(select the one correct answer)</span></p>
                    <div className="mt-2 grid gap-3 sm:grid-cols-2">
                      {questionOptions.map((option, optionIndex) => (
                        <div key={optionIndex} className={`rounded-lg border p-3 ${option.isCorrect ? 'border-indigo-400/40 bg-indigo-400/[0.06]' : 'border-slate-800 bg-slate-950/50'}`}>
                          <label htmlFor={`quiz-${quiz.id}-option-${optionIndex}`} className="block text-xs font-medium text-slate-400">Option {String.fromCharCode(65 + optionIndex)}</label>
                          <input id={`quiz-${quiz.id}-option-${optionIndex}`} value={option.text} onChange={(event) => setQuestionOptions((current) => current.map((item, index) => index === optionIndex ? { ...item, text: event.target.value } : item))} required className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-indigo-400" />
                          <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-slate-300"><input type="radio" name={`correct-option-${quiz.id}`} checked={option.isCorrect} onChange={() => setQuestionOptions((current) => current.map((item, index) => ({ ...item, isCorrect: index === optionIndex })))} className="accent-indigo-400" /> Correct answer</label>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="submit" disabled={pending} className="rounded-lg bg-indigo-500 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:opacity-60">{saveQuestionMutation.isPending ? 'Saving…' : editingQuestionId === null ? 'Add question' : 'Save question'}</button>
                      <button type="button" disabled={pending} onClick={() => { setQuestionQuizId(null); setEditingQuestionId(null); setFormError('') }} className="rounded-lg border border-slate-700 px-4 py-2.5 text-xs font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <button type="button" disabled={locked || pending} onClick={() => beginQuestionForm(quiz)} className="w-full rounded-lg border border-dashed border-indigo-400/30 px-3 py-3 text-sm font-semibold text-indigo-200 transition hover:bg-indigo-400/[0.06] disabled:cursor-not-allowed disabled:opacity-40">+ Add question</button>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export default EducatorCurriculumPage
