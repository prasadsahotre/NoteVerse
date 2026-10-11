import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'

import { useState, type FormEvent } from 'react'

import { Link, Navigate, useParams } from 'react-router-dom'

import { useAuth } from '../auth/useAuth'

import { apiRequest, apiUpload } from '../api/client'



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



interface LessonCreateResponse extends MutationResponse {

  data?: CurriculumLesson

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

  const [lessonPdfFile, setLessonPdfFile] = useState<File | null>(null)

  const [lessonPdfTitle, setLessonPdfTitle] = useState('')

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

    mutationFn: (values: {

      title: string

      content: string | null

      position: number

      moduleId: number

      youtubeUrl: string | null

      pdfFile: File | null

      pdfTitle: string

    }) =>

      apiRequest<LessonCreateResponse>('/lessons', {

        method: 'POST',

        body: JSON.stringify({

          title: values.title,

          content: values.content,

          position: values.position,

          moduleId: values.moduleId,

          youtubeUrl: values.youtubeUrl,

        }),

      }),

    onSuccess: async (response, values) => {

      setLessonForm(null)

      setLessonPdfFile(null)

      setLessonPdfTitle('')

      await refreshCurriculum()



      if (!values.pdfFile) {

        setFeedback(response.message || 'Lesson created successfully.')

        return

      }



      try {

        // The resource endpoint needs the saved lesson ID, so create the lesson first,

        // then upload the selected PDF immediately as part of the same form workflow.

        let createdLesson = response.data

        if (!createdLesson?.id) {

          const cachedCurriculum = queryClient.getQueryData<CourseCurriculum>([

            'educator-curriculum', user?.id, courseIdNumber,

          ])

          const createdModule = cachedCurriculum?.modules.find(

            (module) => module.id === values.moduleId,

          )

          createdLesson = createdModule?.lessons.find(

            (lesson) => lesson.title === values.title && lesson.position === values.position,

          )

        }

        if (!createdLesson?.id) {

          throw new Error('The lesson was created, but its ID could not be retrieved. Open the saved lesson to upload the PDF.')

        }



        const formData = new FormData()

        const fallbackTitle = values.pdfFile.name.replace(/\.pdf$/i, '').trim() || 'Lesson PDF'

        formData.append('title', values.pdfTitle.trim() || fallbackTitle)

        formData.append('type', 'PDF')

        formData.append('lessonId', String(createdLesson.id))

        formData.append('file', values.pdfFile)

        const uploadResponse = await apiUpload<ResourceMutationResponse>('/lesson-resources/upload', formData)

        setFeedback(`${response.message || 'Lesson created successfully.'} ${uploadResponse.message || 'PDF uploaded successfully.'}`)

        await queryClient.invalidateQueries({ queryKey: ['lesson-resources', createdLesson.id] })

      } catch (error) {

        setFeedback(`Lesson created, but the PDF could not be uploaded: ${error instanceof Error ? error.message : 'Unknown upload error'}. You can upload it from the saved lesson below.`)

      }



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

    setLessonPdfFile(null)

    setLessonPdfTitle('')

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

    setLessonPdfFile(null)

    setLessonPdfTitle('')

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

      if (lessonPdfFile && lessonPdfFile.type !== 'application/pdf' && !lessonPdfFile.name.toLowerCase().endsWith('.pdf')) {

        return setValidationError('Only PDF files are supported for lesson resources.')

      }

      createLessonMutation.mutate({

        title: trimmedTitle,

        content,

        position: numericPosition,

        moduleId: lessonForm.moduleId,

        youtubeUrl,

        pdfFile: lessonPdfFile,

        pdfTitle: lessonPdfTitle,

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



                              <LessonResources lessonId={lesson.id} lessonTitle={lesson.title} />

                              <LessonQuizManager lessonId={lesson.id} lessonTitle={lesson.title} />



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

                          <div className="mt-4 rounded-xl border border-dashed border-indigo-400/30 bg-slate-900/70 p-4">

                            <p className="text-sm font-semibold text-indigo-200">PDF study material <span className="font-normal text-slate-500">(optional)</span></p>

                            <p className="mt-1 text-xs leading-5 text-slate-400">Choose a PDF now. It will upload automatically after the lesson is saved.</p>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">

                              <div>

                                <label htmlFor="new-lesson-pdf-title" className="block text-xs font-medium text-slate-300">PDF title <span className="font-normal text-slate-500">(optional)</span></label>

                                <input id="new-lesson-pdf-title" value={lessonPdfTitle} onChange={(event) => setLessonPdfTitle(event.target.value)} maxLength={150} placeholder="Defaults to the file name" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />

                              </div>

                              <div>

                                <label htmlFor="new-lesson-pdf-file" className="block text-xs font-medium text-slate-300">Choose PDF</label>

                                <input id="new-lesson-pdf-file" type="file" accept=".pdf,application/pdf" onChange={(event) => setLessonPdfFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:font-medium file:text-slate-200 hover:file:bg-slate-700" />

                              </div>

                            </div>

                            {lessonPdfFile && <p className="mt-2 text-xs text-emerald-300">Selected: {lessonPdfFile.name}</p>}

                          </div>

                          <FormActions onCancel={() => { setLessonForm(null); setLessonPdfFile(null); setLessonPdfTitle('') }} pending={createLessonMutation.isPending} submitLabel="Create lesson" />

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







interface LessonResource {

  id: number

  title: string

  type: 'PDF' | 'AUDIO' | 'VIDEO' | 'IMAGE'

  lessonId: number

  createdAt: string

  updatedAt: string

}





interface LessonQuizOption {
  id: number
  text: string
  isCorrect: boolean
}

interface LessonQuizQuestion {
  id: number
  question: string
  options: LessonQuizOption[]
}

interface LessonQuiz {
  id: number
  title: string
  lessonId: number
  questions?: LessonQuizQuestion[]
  _count?: { attempts: number }
}

interface LessonQuizzesResponse {
  success: boolean
  data: LessonQuiz[]
}

interface QuizMutationResponse extends MutationResponse {
  data?: LessonQuiz | LessonQuizQuestion
}

interface QuizOptionDraft {
  text: string
  isCorrect: boolean
}

function LessonQuizManager({ lessonId, lessonTitle }: { lessonId: number; lessonTitle: string }) {
  const queryClient = useQueryClient()
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [quizTitle, setQuizTitle] = useState('')
  const [activeQuizId, setActiveQuizId] = useState<number | null>(null)
  const [questionDraft, setQuestionDraft] = useState('')
  const [optionDrafts, setOptionDrafts] = useState(['', '', '', ''])
  const [correctOption, setCorrectOption] = useState(0)
  const [editingQuizId, setEditingQuizId] = useState<number | null>(null)
  const [editingQuizTitle, setEditingQuizTitle] = useState('')
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)
  const [editingQuestionDraft, setEditingQuestionDraft] = useState('')
  const [editingOptionDrafts, setEditingOptionDrafts] = useState(['', '', '', ''])
  const [editingCorrectOption, setEditingCorrectOption] = useState(0)
  const [quizError, setQuizError] = useState('')
  const [quizFeedback, setQuizFeedback] = useState('')

  const quizzesQuery = useQuery({
    queryKey: ['lesson-quizzes', lessonId],
    queryFn: async () => (await apiRequest<LessonQuizzesResponse>(`/quizzes/lesson/${lessonId}`)).data,
  })

  const refreshQuizzes = async () => {
    await queryClient.invalidateQueries({ queryKey: ['lesson-quizzes', lessonId] })
  }

  const createQuizMutation = useMutation({
    mutationFn: () => apiRequest<QuizMutationResponse>('/quizzes', {
      method: 'POST',
      body: JSON.stringify({ title: quizTitle.trim(), lessonId }),
    }),
    onSuccess: async (response) => {
      setQuizTitle('')
      setShowCreateForm(false)
      setQuizError('')
      setQuizFeedback(response.message || 'Quiz created. You can now add questions.')
      if (response.data && 'id' in response.data) setActiveQuizId(response.data.id)
      await refreshQuizzes()
    },
    onError: (error) => setQuizError(error instanceof Error ? error.message : 'Unable to create quiz.'),
  })

  const updateQuizMutation = useMutation({
    mutationFn: ({ quizId, title }: { quizId: number; title: string }) =>
      apiRequest<QuizMutationResponse>(`/quizzes/${quizId}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      }),
    onSuccess: async (response) => {
      setEditingQuizId(null)
      setEditingQuizTitle('')
      setQuizError('')
      setQuizFeedback(response.message || 'Quiz title updated successfully.')
      await refreshQuizzes()
    },
    onError: (error) => setQuizError(error instanceof Error ? error.message : 'Unable to update quiz.'),
  })

  const deleteQuizMutation = useMutation({
    mutationFn: (quizId: number) => apiRequest<QuizMutationResponse>(`/quizzes/${quizId}`, { method: 'DELETE' }),
    onSuccess: async (response, quizId) => {
      if (activeQuizId === quizId) resetQuestionForm()
      if (editingQuizId === quizId) setEditingQuizId(null)
      setQuizError('')
      setQuizFeedback(response.message || 'Quiz deleted successfully.')
      await refreshQuizzes()
    },
    onError: (error) => setQuizError(error instanceof Error ? error.message : 'Unable to delete quiz.'),
  })

  const addQuestionMutation = useMutation({
    mutationFn: () => {
      if (activeQuizId === null) throw new Error('Select a quiz before adding a question.')
      return apiRequest<QuizMutationResponse>('/quizzes/questions', {
        method: 'POST',
        body: JSON.stringify({
          quizId: activeQuizId,
          question: questionDraft.trim(),
          options: optionDrafts.map((text, index) => ({ text: text.trim(), isCorrect: index === correctOption })),
        }),
      })
    },
    onSuccess: async (response) => {
      setQuestionDraft('')
      setOptionDrafts(['', '', '', ''])
      setCorrectOption(0)
      setQuizError('')
      setQuizFeedback(response.message || 'Question added successfully.')
      await refreshQuizzes()
    },
    onError: (error) => setQuizError(error instanceof Error ? error.message : 'Unable to add this question.'),
  })

  const updateQuestionMutation = useMutation({
    mutationFn: ({ questionId, question, options }: { questionId: number; question: string; options: QuizOptionDraft[] }) =>
      apiRequest<QuizMutationResponse>(`/quizzes/questions/${questionId}`, {
        method: 'PATCH',
        body: JSON.stringify({ question, options }),
      }),
    onSuccess: async (response) => {
      setEditingQuestionId(null)
      setQuizError('')
      setQuizFeedback(response.message || 'Question updated successfully.')
      await refreshQuizzes()
    },
    onError: (error) => setQuizError(error instanceof Error ? error.message : 'Unable to update question.'),
  })

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: number) => apiRequest<QuizMutationResponse>(`/quizzes/questions/${questionId}`, { method: 'DELETE' }),
    onSuccess: async (response) => {
      if (editingQuestionId !== null) cancelQuestionEdit()
      setQuizError('')
      setQuizFeedback(response.message || 'Question deleted successfully.')
      await refreshQuizzes()
    },
    onError: (error) => setQuizError(error instanceof Error ? error.message : 'Unable to delete question.'),
  })

  function resetQuestionForm() {
    setActiveQuizId(null)
    setQuestionDraft('')
    setOptionDrafts(['', '', '', ''])
    setCorrectOption(0)
  }

  function cancelQuestionEdit() {
    setEditingQuestionId(null)
    setEditingQuestionDraft('')
    setEditingOptionDrafts(['', '', '', ''])
    setEditingCorrectOption(0)
  }

  const submitCreateQuiz = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setQuizError('')
    setQuizFeedback('')
    if (!quizTitle.trim()) {
      setQuizError('Enter a quiz title.')
      return
    }
    createQuizMutation.mutate()
  }

  const submitQuizTitle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingQuizId === null) return
    setQuizError('')
    setQuizFeedback('')
    if (!editingQuizTitle.trim()) {
      setQuizError('Enter a quiz title.')
      return
    }
    updateQuizMutation.mutate({ quizId: editingQuizId, title: editingQuizTitle.trim() })
  }

  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setQuizError('')
    setQuizFeedback('')
    if (!questionDraft.trim()) {
      setQuizError('Enter the question text.')
      return
    }
    if (optionDrafts.some((option) => !option.trim())) {
      setQuizError('Fill in all four answer options.')
      return
    }
    addQuestionMutation.mutate()
  }

  const beginQuestionEdit = (item: LessonQuizQuestion) => {
    const options = item.options.slice(0, 4)
    setEditingQuestionId(item.id)
    setEditingQuestionDraft(item.question)
    setEditingOptionDrafts(Array.from({ length: 4 }, (_, index) => options[index]?.text ?? ''))
    setEditingCorrectOption(Math.max(0, options.findIndex((option) => option.isCorrect)))
    setQuizError('')
    setQuizFeedback('')
  }

  const submitQuestionEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (editingQuestionId === null) return
    setQuizError('')
    setQuizFeedback('')
    if (!editingQuestionDraft.trim()) {
      setQuizError('Enter the question text.')
      return
    }
    if (editingOptionDrafts.some((option) => !option.trim())) {
      setQuizError('Fill in all four answer options.')
      return
    }
    updateQuestionMutation.mutate({
      questionId: editingQuestionId,
      question: editingQuestionDraft.trim(),
      options: editingOptionDrafts.map((text, index) => ({ text: text.trim(), isCorrect: index === editingCorrectOption })),
    })
  }

  const locked = (quiz: LessonQuiz) => (quiz._count?.attempts ?? 0) > 0
  const anyMutationPending = createQuizMutation.isPending || updateQuizMutation.isPending || deleteQuizMutation.isPending || addQuestionMutation.isPending || updateQuestionMutation.isPending || deleteQuestionMutation.isPending

  return (
    <section aria-label={`Quizzes for ${lessonTitle}`} className="mt-5 border-t border-slate-800 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h5 className="text-sm font-semibold text-indigo-200">Lesson quizzes</h5>
          <p className="mt-1 text-xs text-slate-500">Create and manage multiple-choice quizzes with four options and one correct answer.</p>
        </div>
        <button type="button" onClick={() => { setShowCreateForm((current) => !current); setQuizError(''); setQuizFeedback('') }} className="rounded-lg border border-indigo-400/30 px-3 py-2 text-xs font-semibold text-indigo-200 transition hover:bg-indigo-400/10">
          {showCreateForm ? 'Cancel' : 'Create quiz'}
        </button>
      </div>

      {quizzesQuery.isLoading && <p role="status" className="mt-3 text-sm text-slate-500">Loading quizzes…</p>}
      {quizzesQuery.isError && <div role="alert" className="mt-3 text-sm text-red-300"><p>{quizzesQuery.error instanceof Error ? quizzesQuery.error.message : 'Unable to load quizzes.'}</p><button type="button" onClick={() => void quizzesQuery.refetch()} className="mt-1 underline">Try again</button></div>}
      {quizzesQuery.data && quizzesQuery.data.length === 0 && <p className="mt-3 text-sm text-slate-500">No quizzes created for this lesson yet.</p>}

      {quizzesQuery.data && quizzesQuery.data.length > 0 && (
        <ul className="mt-3 space-y-3">
          {quizzesQuery.data.map((quiz) => {
            const quizLocked = locked(quiz)
            return (
              <li key={quiz.id} className="rounded-xl border border-slate-800 bg-slate-900/80 p-3 sm:p-4">
                {editingQuizId === quiz.id ? (
                  <form onSubmit={submitQuizTitle} className="space-y-3">
                    <label htmlFor={`edit-quiz-title-${quiz.id}`} className="block text-xs font-medium text-slate-300">Quiz title</label>
                    <input id={`edit-quiz-title-${quiz.id}`} value={editingQuizTitle} onChange={(event) => setEditingQuizTitle(event.target.value)} required maxLength={150} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
                    <div className="flex flex-wrap gap-2">
                      <button type="submit" disabled={updateQuizMutation.isPending || !editingQuizTitle.trim()} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{updateQuizMutation.isPending ? 'Saving…' : 'Save title'}</button>
                      <button type="button" onClick={() => setEditingQuizId(null)} disabled={updateQuizMutation.isPending} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                    </div>
                  </form>
                ) : (
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="break-words text-sm font-semibold text-slate-100">{quiz.title}</p>
                      <p className="mt-1 text-xs text-slate-500">{quiz.questions?.length ?? 0} question(s) · {quiz._count?.attempts ?? 0} student attempt(s)</p>
                      {quizLocked && <p className="mt-2 text-xs text-amber-300">Editing and deletion are locked because students have attempted this quiz. This protects score history.</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => { setActiveQuizId(quiz.id); setQuizError(''); setQuizFeedback('') }} disabled={quizLocked || anyMutationPending} className="rounded-lg border border-indigo-400/30 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/10 disabled:cursor-not-allowed disabled:opacity-40">Add question</button>
                      <button type="button" onClick={() => { setEditingQuizId(quiz.id); setEditingQuizTitle(quiz.title); setQuizError(''); setQuizFeedback('') }} disabled={quizLocked || anyMutationPending} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Edit quiz</button>
                      <button type="button" onClick={() => { if (window.confirm(`Delete “${quiz.title}” and all its questions? This cannot be undone.`)) { setQuizError(''); setQuizFeedback(''); deleteQuizMutation.mutate(quiz.id) } }} disabled={quizLocked || anyMutationPending} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">Delete quiz</button>
                    </div>
                  </div>
                )}

                {quiz.questions && quiz.questions.length > 0 && (
                  <ol className="mt-4 space-y-3 border-t border-slate-800 pt-3">
                    {quiz.questions.map((item, index) => (
                      <li key={item.id} className="rounded-lg bg-slate-950/60 p-3">
                        {editingQuestionId === item.id ? (
                          <form onSubmit={submitQuestionEdit} className="space-y-3">
                            <label htmlFor={`edit-question-${item.id}`} className="block text-xs font-medium text-slate-300">Question {index + 1}</label>
                            <textarea id={`edit-question-${item.id}`} value={editingQuestionDraft} onChange={(event) => setEditingQuestionDraft(event.target.value)} required rows={2} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
                            <fieldset className="space-y-2">
                              <legend className="text-xs font-medium text-slate-300">Answer options — select the correct answer</legend>
                              {editingOptionDrafts.map((option, optionIndex) => (
                                <div key={optionIndex} className="flex items-center gap-2">
                                  <input type="radio" name={`edit-correct-option-${item.id}`} aria-label={`Mark option ${optionIndex + 1} correct`} checked={editingCorrectOption === optionIndex} onChange={() => setEditingCorrectOption(optionIndex)} className="h-4 w-4 shrink-0 accent-indigo-500" />
                                  <input aria-label={`Option ${optionIndex + 1}`} value={option} onChange={(event) => setEditingOptionDrafts((current) => current.map((value, currentIndex) => currentIndex === optionIndex ? event.target.value : value))} required maxLength={500} placeholder={`Option ${optionIndex + 1}`} className="min-w-0 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
                                </div>
                              ))}
                            </fieldset>
                            <div className="flex flex-wrap gap-2">
                              <button type="submit" disabled={updateQuestionMutation.isPending || !editingQuestionDraft.trim() || editingOptionDrafts.some((option) => !option.trim())} className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{updateQuestionMutation.isPending ? 'Saving…' : 'Save question'}</button>
                              <button type="button" onClick={cancelQuestionEdit} disabled={updateQuestionMutation.isPending} className="rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300 hover:bg-slate-800">Cancel</button>
                            </div>
                          </form>
                        ) : (
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-200"><span className="mr-1 text-indigo-300">{index + 1}.</span>{item.question}</p>
                              <ul className="mt-2 space-y-1 pl-5 text-xs text-slate-500">
                                {item.options.map((option, optionIndex) => <li key={option.id} className={option.isCorrect ? 'list-disc text-emerald-300' : 'list-disc'}>{String.fromCharCode(65 + optionIndex)}. {option.text}{option.isCorrect ? ' — Correct answer' : ''}</li>)}
                              </ul>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              <button type="button" onClick={() => beginQuestionEdit(item)} disabled={quizLocked || anyMutationPending} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40">Edit</button>
                              <button type="button" onClick={() => { if (window.confirm('Delete this question and its answer options? This cannot be undone.')) { setQuizError(''); setQuizFeedback(''); deleteQuestionMutation.mutate(item.id) } }} disabled={quizLocked || anyMutationPending} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-400/10 disabled:cursor-not-allowed disabled:opacity-40">Delete</button>
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {showCreateForm && (
        <form onSubmit={submitCreateQuiz} className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 sm:p-4">
          <h6 className="text-sm font-medium text-slate-200">Create a quiz for this lesson</h6>
          <label htmlFor={`quiz-title-${lessonId}`} className="mt-3 block text-xs font-medium text-slate-300">Quiz title</label>
          <input id={`quiz-title-${lessonId}`} value={quizTitle} onChange={(event) => setQuizTitle(event.target.value)} required maxLength={150} placeholder="e.g. Lesson 1 knowledge check" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
          <button type="submit" disabled={createQuizMutation.isPending || !quizTitle.trim()} className="mt-3 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{createQuizMutation.isPending ? 'Creating quiz…' : 'Create quiz'}</button>
        </form>
      )}

      {activeQuizId !== null && (
        <form onSubmit={submitQuestion} className="mt-4 rounded-xl border border-indigo-400/20 bg-slate-950/60 p-3 sm:p-4">
          <div className="flex items-center justify-between gap-3"><h6 className="text-sm font-medium text-slate-200">Add a multiple-choice question</h6><button type="button" onClick={resetQuestionForm} className="text-xs text-slate-400 underline">Close</button></div>
          <label htmlFor={`quiz-question-${lessonId}`} className="mt-3 block text-xs font-medium text-slate-300">Question</label>
          <textarea id={`quiz-question-${lessonId}`} value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} required rows={2} className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />
          <fieldset className="mt-3 space-y-3"><legend className="text-xs font-medium text-slate-300">Answer options — select the correct answer</legend>
            {optionDrafts.map((option, index) => (
              <div key={index} className="flex items-center gap-3"><input type="radio" name={`correct-option-${lessonId}`} aria-label={`Mark option ${index + 1} correct`} checked={correctOption === index} onChange={() => setCorrectOption(index)} className="h-4 w-4 accent-indigo-500" /><label htmlFor={`quiz-option-${lessonId}-${index}`} className="sr-only">Option {index + 1}</label><input id={`quiz-option-${lessonId}-${index}`} value={option} onChange={(event) => setOptionDrafts((current) => current.map((value, optionIndex) => optionIndex === index ? event.target.value : value))} required maxLength={500} placeholder={`Option ${index + 1}`} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" /></div>
            ))}
          </fieldset>
          <button type="submit" disabled={addQuestionMutation.isPending || !questionDraft.trim() || optionDrafts.some((option) => !option.trim())} className="mt-4 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">{addQuestionMutation.isPending ? 'Saving question…' : 'Save question'}</button>
        </form>
      )}
      {quizError && <p role="alert" className="mt-3 text-sm text-red-300">{quizError}</p>}
      {quizFeedback && <p role="status" className="mt-3 text-sm text-emerald-300">{quizFeedback}</p>}
    </section>
  )
}


interface LessonResourcesResponse {

  success: boolean

  data: LessonResource[]

}



interface ResourceMutationResponse {

  success: boolean

  message: string

  data?: LessonResource

}



function LessonResources({ lessonId, lessonTitle }: { lessonId: number; lessonTitle: string }) {

  const queryClient = useQueryClient()

  const [resourceTitle, setResourceTitle] = useState('')

  const [resourceFile, setResourceFile] = useState<File | null>(null)

  const [resourceError, setResourceError] = useState('')

  const [resourceFeedback, setResourceFeedback] = useState('')



  const resourcesQuery = useQuery({

    queryKey: ['lesson-resources', lessonId],

    queryFn: async () => {

      const response = await apiRequest<LessonResourcesResponse>(`/lesson-resources/lesson/${lessonId}`)

      return response.data

    },

  })



  const uploadMutation = useMutation({

    mutationFn: async () => {

      if (!resourceFile) throw new Error('Choose a PDF file to upload.')

      const formData = new FormData()

      formData.append('title', resourceTitle.trim())

      formData.append('type', 'PDF')

      formData.append('lessonId', String(lessonId))

      formData.append('file', resourceFile)

      return apiUpload<ResourceMutationResponse>('/lesson-resources/upload', formData)

    },

    onSuccess: async (response) => {

      setResourceFeedback(response.message || 'PDF uploaded successfully.')

      setResourceError('')

      setResourceTitle('')

      setResourceFile(null)

      const input = document.getElementById(`resource-file-${lessonId}`) as HTMLInputElement | null

      if (input) input.value = ''

      await queryClient.invalidateQueries({ queryKey: ['lesson-resources', lessonId] })

    },

    onError: (error) => {

      setResourceError(error instanceof Error ? error.message : 'Unable to upload this PDF.')

    },

  })



  const deleteMutation = useMutation({

    mutationFn: (resourceId: number) =>

      apiRequest<ResourceMutationResponse>(`/lesson-resources/${resourceId}`, { method: 'DELETE' }),

    onSuccess: async (response) => {

      setResourceFeedback(response.message || 'Resource deleted successfully.')

      setResourceError('')

      await queryClient.invalidateQueries({ queryKey: ['lesson-resources', lessonId] })

    },

    onError: (error) => {

      setResourceError(error instanceof Error ? error.message : 'Unable to delete this resource.')

    },

  })



  const handleUpload = (event: FormEvent<HTMLFormElement>) => {

    event.preventDefault()

    setResourceError('')

    setResourceFeedback('')

    if (!resourceTitle.trim()) {

      setResourceError('Enter a title for this PDF.')

      return

    }

    if (!resourceFile) {

      setResourceError('Choose a PDF file to upload.')

      return

    }

    if (resourceFile.type !== 'application/pdf' && !resourceFile.name.toLowerCase().endsWith('.pdf')) {

      setResourceError('Only PDF files are supported here.')

      return

    }

    uploadMutation.mutate()

  }



  const handleDownload = async (resourceId: number) => {

    setResourceError('')

    try {

      const response = await apiRequest<{

        success: boolean

        data: { downloadUrl: string }

      }>(`/lesson-resources/${resourceId}/download`)

      window.open(response.data.downloadUrl, '_blank', 'noopener,noreferrer')

    } catch (error) {

      setResourceError(error instanceof Error ? error.message : 'Unable to open this resource.')

    }

  }



  return (

    <section aria-label={`PDF resources for ${lessonTitle}`} className="mt-5 border-t border-slate-800 pt-4">

      <div className="flex flex-wrap items-center justify-between gap-2">

        <h5 className="text-sm font-semibold text-indigo-200">Lesson resources</h5>

        <span className="text-xs text-slate-500">PDF study materials</span>

      </div>



      {resourcesQuery.isLoading && <p role="status" className="mt-3 text-sm text-slate-500">Loading resources…</p>}

      {resourcesQuery.isError && (

        <div role="alert" className="mt-3 text-sm text-red-300">

          <p>{resourcesQuery.error instanceof Error ? resourcesQuery.error.message : 'Unable to load lesson resources.'}</p>

          <button type="button" onClick={() => void resourcesQuery.refetch()} className="mt-1 underline">Try again</button>

        </div>

      )}

      {resourcesQuery.data && resourcesQuery.data.length === 0 && (

        <p className="mt-3 text-sm text-slate-500">No PDFs attached to this lesson yet.</p>

      )}

      {resourcesQuery.data && resourcesQuery.data.length > 0 && (

        <ul className="mt-3 space-y-2">

          {resourcesQuery.data.map((resource) => (

            <li key={resource.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/80 p-3">

              <div className="flex min-w-0 items-center gap-3">

                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-400/10 text-xs font-bold text-indigo-200">PDF</span>

                <div className="min-w-0">

                  <p className="break-words text-sm font-medium text-slate-200">{resource.title}</p>

                  <p className="text-xs text-slate-500">PDF resource</p>

                </div>

              </div>

              <div className="flex gap-2">

                <button type="button" onClick={() => void handleDownload(resource.id)} className="rounded-lg border border-indigo-400/30 px-3 py-2 text-xs font-semibold text-indigo-200 hover:bg-indigo-400/10">Open</button>

                <button type="button" onClick={() => {

                  if (window.confirm(`Delete resource “${resource.title}”?`)) deleteMutation.mutate(resource.id)

                }} disabled={deleteMutation.isPending} className="rounded-lg border border-red-400/30 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-400/10 disabled:opacity-50">Delete</button>

              </div>

            </li>

          ))}

        </ul>

      )}



      <form onSubmit={handleUpload} className="mt-4 rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 sm:p-4">

        <p className="text-sm font-medium text-slate-200">Add a PDF resource</p>

        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

          <div>

            <label htmlFor={`resource-title-${lessonId}`} className="block text-xs font-medium text-slate-300">Resource title</label>

            <input id={`resource-title-${lessonId}`} value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} maxLength={150} placeholder="e.g. Guitar chord chart" className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />

          </div>

          <div>

            <label htmlFor={`resource-file-${lessonId}`} className="block text-xs font-medium text-slate-300">PDF file</label>

            <input id={`resource-file-${lessonId}`} type="file" accept=".pdf,application/pdf" onChange={(event) => setResourceFile(event.target.files?.[0] ?? null)} className="mt-1.5 block w-full text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-800 file:px-3 file:py-2 file:font-medium file:text-slate-200 hover:file:bg-slate-700" />

          </div>

        </div>

        {resourceError && <p role="alert" className="mt-3 text-sm text-red-300">{resourceError}</p>}

        {resourceFeedback && <p role="status" className="mt-3 text-sm text-emerald-300">{resourceFeedback}</p>}

        <button type="submit" disabled={uploadMutation.isPending || !resourceTitle.trim() || !resourceFile} className="mt-3 rounded-lg bg-indigo-600 px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">

          {uploadMutation.isPending ? 'Uploading PDF…' : 'Upload PDF'}

        </button>

        <p className="mt-2 text-xs leading-5 text-slate-500">The PDF will be stored securely and linked to this lesson.</p>

      </form>

    </section>

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

        <input id="lesson-youtube-url" type="url" inputMode="url" autoComplete="url" value={youtubeUrl} onChange={(event) => setYoutubeUrl(event.target.value)} placeholder="https\://www.youtube.com/watch?v=..." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20" />

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



export default EducatorCurriculumPage