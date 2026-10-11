import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { apiRequest } from '../api/client'
import './StudentLesson.css'

interface Quiz { id: number; title: string }
interface Lesson { id: number; title: string; content: string | null; position: number; youtubeVideoId: string | null; quizzes: Quiz[] }
interface LessonQuestion { id: number; question: string; answer: string | null; answeredAt: string | null; createdAt: string; user: { id: number; name: string } }
interface Module { id: number; title: string; position: number; lessons: Lesson[] }
interface Course { id: number; title: string; description: string; status: string }
interface CourseResponse { success: boolean; data: { enrollment: { id: number; userId: number; courseId: number; createdAt: string }; course: Course; progress: { totalLessons: number; completedLessons: number; progressPercentage: number }; modules: Module[] } }
interface LessonQuestionsResponse { success: boolean; data: LessonQuestion[] }
interface QuestionMutationResponse { success: boolean; message: string }
interface ProgressResponse { success: boolean; message: string; data?: unknown }
interface LessonResource { id: number; title: string; type: string; lessonId: number; createdAt: string; updatedAt: string }
interface ResourcesResponse { success: boolean; data: LessonResource[] }
interface ResourceDownloadResponse { success: boolean; data: { id: number; title: string; type: string; downloadUrl: string; expiresIn: number } }

function StudentLessonPage() {
  const { courseId, lessonId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [questionDraft, setQuestionDraft] = useState('')
  const [questionValidationError, setQuestionValidationError] = useState('')
  const [questionFeedback, setQuestionFeedback] = useState('')
  const courseIdNumber = Number(courseId)
  const lessonIdNumber = Number(lessonId)
  const hasValidCourseId = Boolean(courseId) && Number.isInteger(courseIdNumber) && courseIdNumber > 0
  const hasValidLessonId = Boolean(lessonId) && Number.isInteger(lessonIdNumber) && lessonIdNumber > 0

  const courseQuery = useQuery({
    queryKey: ['student-course', user?.id, courseIdNumber],
    queryFn: async () => {
      if (!user) throw new Error('User is not authenticated')
      const response = await apiRequest<CourseResponse>(`/enrollments/user/${user.id}/course/${courseIdNumber}`)
      return response.data
    },
    enabled: Boolean(user) && hasValidCourseId && hasValidLessonId,
  })
  const resourcesQuery = useQuery({
    queryKey: ['lesson-resources', lessonIdNumber],
    queryFn: async () => (await apiRequest<ResourcesResponse>(`/lesson-resources/lesson/${lessonIdNumber}`)).data,
    enabled: hasValidLessonId && hasValidCourseId,
  })
  const questionsQuery = useQuery({
    queryKey: ['lesson-questions', user?.id, lessonIdNumber],
    queryFn: async () => (await apiRequest<LessonQuestionsResponse>(`/lesson-questions/lesson/${lessonIdNumber}`)).data,
    enabled: Boolean(user && hasValidCourseId && hasValidLessonId && courseQuery.isSuccess),
  })
  const askQuestionMutation = useMutation({
    mutationFn: (question: string) => apiRequest<QuestionMutationResponse>('/lesson-questions', { method: 'POST', body: JSON.stringify({ lessonId: lessonIdNumber, question }) }),
    onSuccess: async (response) => {
      setQuestionDraft('')
      setQuestionFeedback(response.message || 'Your question was submitted.')
      await queryClient.invalidateQueries({ queryKey: ['lesson-questions', user?.id, lessonIdNumber] })
    },
  })
  const submitQuestion = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const question = questionDraft.trim()
    setQuestionFeedback('')
    if (!question) { setQuestionValidationError('Enter a question before submitting.'); return }
    setQuestionValidationError('')
    askQuestionMutation.mutate(question)
  }

  const courseData = courseQuery.data
  const course = courseData?.course
  const modules = courseData?.modules ?? []
  const lesson = modules.flatMap((module) => module.lessons).find((item) => item.id === lessonIdNumber)
  const lessonModule = modules.find((module) => module.lessons.some((item) => item.id === lessonIdNumber))
  const completeLessonMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('User is not authenticated')
      return apiRequest<ProgressResponse>('/progress', { method: 'POST', body: JSON.stringify({ userId: user.id, lessonId: lessonIdNumber }) })
    },
    onSuccess: () => navigate(`/student/courses/${courseIdNumber}`),
  })
  const downloadResourceMutation = useMutation({
    mutationFn: async (resourceId: number) => (await apiRequest<ResourceDownloadResponse>(`/lesson-resources/${resourceId}/download`)).data,
    onSuccess: (resource) => window.open(resource.downloadUrl, '_blank', 'noopener,noreferrer'),
  })

  if (!hasValidCourseId || !hasValidLessonId) return <LessonState title="Invalid lesson URL" message={`Course ID: ${courseId ?? 'missing'} · Lesson ID: ${lessonId ?? 'missing'}`}><Link to="/student" className="nv-lesson-primary-link">Back to Dashboard</Link></LessonState>
  if (courseQuery.isLoading) return <LessonState title="Preparing your learning space" message="Loading lesson..." loading />
  if (courseQuery.isError) return <LessonState title="Unable to load lesson" message={courseQuery.error instanceof Error ? courseQuery.error.message : 'Something went wrong.'}><button type="button" onClick={() => navigate(-1)} className="nv-lesson-primary-link">Go Back</button></LessonState>
  if (!course || !lesson || !lessonModule) return <LessonState title="Lesson not found" message="This lesson could not be found in this course."><Link to={`/student/courses/${courseIdNumber}`} className="nv-lesson-primary-link">Back to Course</Link></LessonState>

  const totalLessons = modules.reduce((total, item) => total + item.lessons.length, 0)
  const lessonIndex = modules.flatMap((item) => item.lessons).findIndex((item) => item.id === lesson.id)

  return (
    <div className="nv-lesson-page">
      <nav className="nv-lesson-nav">
        <div className="nv-lesson-nav-inner">
          <Link to="/student" className="nv-lesson-brand">Note<span>Verse</span><i>♪</i></Link>
          <div className="nv-lesson-nav-right"><span className="nv-lesson-nav-label">YOUR LEARNING SPACE</span><Link to={`/student/courses/${course.id}`} className="nv-lesson-back-link"><span aria-hidden="true">←</span> Back to course</Link></div>
        </div>
      </nav>

      <main className="nv-lesson-main">
        <div className="nv-lesson-breadcrumb"><Link to={`/student/courses/${course.id}`}>{course.title}</Link><span>/</span><span>{lessonModule.title}</span></div>
        <header className="nv-lesson-heading">
          <div className="nv-lesson-heading-copy"><div className="nv-lesson-eyebrow"><span className="nv-lesson-eyebrow-dot" /> MODULE {lessonModule.position} <span className="nv-lesson-eyebrow-divider">/</span> LESSON {lesson.position}</div><h1>{lesson.title}</h1><p>Take your time, explore the material, and keep building your musical skills.</p></div>
          <div className="nv-lesson-counter"><span>LESSON</span><strong>{String(lessonIndex + 1).padStart(2, '0')}<small> / {String(totalLessons).padStart(2, '0')}</small></strong></div>
        </header>

        {lesson.youtubeVideoId && /^[A-Za-z0-9_-]{11}$/.test(lesson.youtubeVideoId) && <section aria-label="Lesson video" className="nv-lesson-video-card"><div className="nv-lesson-video-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${lesson.youtubeVideoId}`} title={`${lesson.title} video`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div><p className="nv-lesson-video-note"><span aria-hidden="true">ⓘ</span> This video is hosted by YouTube. Unlisted videos can be watched by anyone with the link and are not private to NoteVerse students.</p></section>}

        <article className="nv-lesson-panel nv-lesson-content-panel"><div className="nv-lesson-panel-heading"><div className="nv-lesson-icon-tile">☷</div><div><span className="nv-lesson-section-kicker">THE LEARNING NOTES</span><h2>Lesson overview</h2></div></div><div className="nv-lesson-content">{lesson.content || 'No lesson content available.'}</div></article>

        <section aria-labelledby="lesson-questions-heading" className="nv-lesson-panel nv-lesson-qa-panel"><div className="nv-lesson-panel-heading"><div className="nv-lesson-icon-tile">✳</div><div><span className="nv-lesson-section-kicker">LEARN TOGETHER</span><h2 id="lesson-questions-heading">Questions & answers</h2><p>Ask your educator when something needs a little more explanation.</p></div></div>
          {questionsQuery.isLoading && <p role="status" className="nv-lesson-muted-message">Loading questions...</p>}
          {questionsQuery.isError && <div role="alert" className="nv-lesson-alert nv-lesson-alert-error"><p>{questionsQuery.error instanceof Error ? questionsQuery.error.message : 'Unable to load lesson questions.'}</p><button type="button" onClick={() => void questionsQuery.refetch()}>Try again</button></div>}
          {!questionsQuery.isLoading && !questionsQuery.isError && questionsQuery.data?.length === 0 && <p className="nv-lesson-empty-state">No questions yet. Be the first to ask something about this lesson.</p>}
          {questionsQuery.data && questionsQuery.data.length > 0 && <ol className="nv-lesson-question-list">{questionsQuery.data.map((item) => <li key={item.id} className="nv-lesson-question-card"><div className="nv-lesson-question-meta"><span>{item.user.name}{item.user.id === user?.id ? ' · You' : ''}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString()}</time></div><p className="nv-lesson-question-text">{item.question}</p>{item.answer ? <div className="nv-lesson-answer"><span>EDUCATOR ANSWER</span><p>{item.answer}</p></div> : <p className="nv-lesson-waiting">◷ Waiting for the educator’s reply</p>}</li>)}</ol>}
          <form onSubmit={submitQuestion} className="nv-lesson-question-form"><label htmlFor="lesson-question">Your question</label><textarea id="lesson-question" rows={3} value={questionDraft} onChange={(event) => setQuestionDraft(event.target.value)} disabled={askQuestionMutation.isPending} placeholder="What would you like to understand about this lesson?" />{questionValidationError && <p role="alert" className="nv-lesson-form-error">{questionValidationError}</p>}{askQuestionMutation.isError && <p role="alert" className="nv-lesson-form-error">{askQuestionMutation.error instanceof Error ? askQuestionMutation.error.message : 'Unable to submit your question.'}</p>}{questionFeedback && <p role="status" className="nv-lesson-form-success">{questionFeedback}</p>}<button type="submit" disabled={askQuestionMutation.isPending} className="nv-lesson-primary-button">{askQuestionMutation.isPending ? 'Submitting...' : 'Send question'} <span aria-hidden="true">↗</span></button></form>
        </section>

        <section className="nv-lesson-panel nv-lesson-resources-panel"><div className="nv-lesson-panel-heading"><div className="nv-lesson-icon-tile">↧</div><div><span className="nv-lesson-section-kicker">GO A LITTLE DEEPER</span><h2>Lesson resources</h2><p>Keep helpful materials close while you practise.</p></div></div>
          {resourcesQuery.isLoading && <p className="nv-lesson-muted-message">Loading resources...</p>}
          {resourcesQuery.isError && <p className="nv-lesson-form-error">Failed to load lesson resources.</p>}
          {!resourcesQuery.isLoading && !resourcesQuery.isError && resourcesQuery.data?.length === 0 && <p className="nv-lesson-empty-state">No additional resources are available for this lesson.</p>}
          {!resourcesQuery.isLoading && !resourcesQuery.isError && resourcesQuery.data && resourcesQuery.data.length > 0 && <div className="nv-lesson-resource-list">{resourcesQuery.data.map((resource) => <div key={resource.id} className="nv-lesson-resource-item"><div className="nv-lesson-resource-symbol">{resource.type.slice(0, 4).toUpperCase()}</div><div className="nv-lesson-resource-copy"><strong>{resource.title}</strong><span>{resource.type} resource</span></div><button type="button" onClick={() => downloadResourceMutation.mutate(resource.id)} disabled={downloadResourceMutation.isPending} className="nv-lesson-secondary-button">{downloadResourceMutation.isPending ? 'Preparing...' : 'Download'} <span aria-hidden="true">↓</span></button></div>)}</div>}
          {downloadResourceMutation.isError && <div className="nv-lesson-alert nv-lesson-alert-error">{downloadResourceMutation.error instanceof Error ? downloadResourceMutation.error.message : 'Failed to prepare the resource download.'}</div>}
        </section>

        {lesson.quizzes.length > 0 && <section className="nv-lesson-quiz-callout"><div className="nv-lesson-quiz-orb" aria-hidden="true">✦</div><div className="nv-lesson-quiz-callout-copy"><span className="nv-lesson-section-kicker">READY FOR A QUICK CHECK?</span><h2>Put your knowledge to work.</h2><p>Try the quiz connected to this lesson and see what has clicked.</p></div><div className="nv-lesson-quiz-links">{lesson.quizzes.map((quiz) => <Link key={quiz.id} to={`/student/quizzes/${quiz.id}`} className="nv-lesson-quiz-link"><span>{quiz.title}</span><span aria-hidden="true">↗</span></Link>)}</div></section>}

        <section className="nv-lesson-complete-card"><div className="nv-lesson-complete-mark" aria-hidden="true">✓</div><div className="nv-lesson-complete-copy"><h2>Finished this lesson?</h2><p>Mark it complete to update your course progress and keep your learning journey moving.</p></div><button type="button" onClick={() => completeLessonMutation.mutate()} disabled={completeLessonMutation.isPending} className="nv-lesson-primary-button">{completeLessonMutation.isPending ? 'Saving...' : 'Mark as complete'} <span aria-hidden="true">→</span></button></section>
        {completeLessonMutation.isError && <div role="alert" className="nv-lesson-alert nv-lesson-alert-error">{completeLessonMutation.error instanceof Error ? completeLessonMutation.error.message : 'Failed to mark lesson as complete.'}</div>}
        <footer className="nv-lesson-footer"><span>NOTEVERSE <i>♪</i></span><span>One lesson at a time.</span></footer>
      </main>
    </div>
  )
}

function LessonState({ title, message, children, loading = false }: { title: string; message: string; children?: ReactNode; loading?: boolean }) {
  return <div className="nv-lesson-page nv-lesson-state-page"><div className="nv-lesson-state-card"><div className={`nv-lesson-state-symbol${loading ? ' is-loading' : ''}`}>{loading ? '♪' : '♫'}</div><span className="nv-lesson-section-kicker">NOTEVERSE LEARNING</span><h1>{title}</h1><p>{message}</p>{children}</div></div>
}

export default StudentLessonPage
