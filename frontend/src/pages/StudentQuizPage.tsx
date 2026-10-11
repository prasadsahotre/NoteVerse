import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { apiRequest } from '../api/client'
import { useAuth } from '../auth/useAuth'
import './StudentQuiz.css'

interface QuizOption { id: number; text: string }
interface QuizQuestion { id: number; question: string; quizId: number; options: QuizOption[] }
interface Quiz { id: number; title: string; lessonId: number; lesson: { id: number; title: string; module: { courseId: number } }; questions: QuizQuestion[] }
interface QuizResponse { success: boolean; data: Quiz }
interface SubmitAnswer { questionId: number; optionId: number }
interface SubmitQuizResponse { success: boolean; message: string; data: { attemptId: number; quizId: number; totalQuestions: number; correctAnswers: number; score: number; attemptedAt: string } }

function StudentQuizPage() {
  const { quizId } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const quizIdNumber = Number(quizId)
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, number>>({})
  const [submitted, setSubmitted] = useState(false)

  const quizQuery = useQuery({
    queryKey: ['student-quiz', user?.id, quizIdNumber],
    queryFn: async () => (await apiRequest<QuizResponse>(`/quizzes/${quizIdNumber}`)).data,
    enabled: Boolean(user) && Number.isInteger(quizIdNumber) && quizIdNumber > 0,
  })
  const submitMutation = useMutation({
    mutationFn: async (answers: SubmitAnswer[]) => apiRequest<SubmitQuizResponse>(`/quizzes/${quizIdNumber}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
    onSuccess: () => setSubmitted(true),
  })

  if (!Number.isInteger(quizIdNumber) || quizIdNumber <= 0) return <QuizState title="Invalid quiz link" message="This quiz URL does not contain a valid quiz ID."><Link to="/student" className="nv-quiz-primary-link">Back to dashboard</Link></QuizState>
  if (quizQuery.isLoading) return <QuizState title="Getting your quiz ready" message="Loading questions..." loading />
  if (quizQuery.isError) return <QuizState title="Unable to load quiz" message={quizQuery.error instanceof Error ? quizQuery.error.message : 'Something went wrong.'}><button type="button" onClick={() => navigate(-1)} className="nv-quiz-primary-link">Go back</button></QuizState>
  const quiz = quizQuery.data
  if (!quiz) return <QuizState title="Quiz unavailable" message="We couldn't find this quiz right now."><button type="button" onClick={() => navigate(-1)} className="nv-quiz-primary-link">Go back</button></QuizState>

  const handleOptionChange = (questionId: number, optionId: number) => setSelectedAnswers((current) => ({ ...current, [questionId]: optionId }))
  const handleSubmit = () => {
    if (submitMutation.isPending || submitted) return
    const answers: SubmitAnswer[] = quiz.questions.filter((question) => selectedAnswers[question.id] !== undefined).map((question) => ({ questionId: question.id, optionId: selectedAnswers[question.id] }))
    if (answers.length !== quiz.questions.length) return
    submitMutation.mutate(answers)
  }
  const answeredCount = quiz.questions.filter((question) => selectedAnswers[question.id] !== undefined).length
  const allQuestionsAnswered = quiz.questions.length > 0 && answeredCount === quiz.questions.length
  const progress = quiz.questions.length ? Math.round((answeredCount / quiz.questions.length) * 100) : 0
  const result = submitMutation.data?.data

  return (
    <div className="nv-quiz-page">
      <nav className="nv-quiz-nav"><div className="nv-quiz-nav-inner"><Link to="/student" className="nv-quiz-brand">Note<span>Verse</span><i>♪</i></Link><div className="nv-quiz-nav-right"><span className="nv-quiz-nav-label">FOCUS MODE</span><Link to={`/student/courses/${quiz.lesson.module.courseId}/lessons/${quiz.lessonId}`} className="nv-quiz-back-link"><span aria-hidden="true">←</span> Back to lesson</Link></div></div></nav>
      <main className="nv-quiz-main">
        <div className="nv-quiz-breadcrumb"><Link to={`/student/courses/${quiz.lesson.module.courseId}/lessons/${quiz.lessonId}`}>{quiz.lesson.title}</Link><span>/</span><span>Knowledge check</span></div>
        <header className="nv-quiz-hero"><div className="nv-quiz-hero-copy"><div className="nv-quiz-eyebrow"><span className="nv-quiz-eyebrow-dot" /> KNOWLEDGE CHECK</div><h1>{quiz.title}</h1><p>A quiet moment to check what you've learned. Take each question one at a time.</p><div className="nv-quiz-hero-meta"><span><i>▤</i>{quiz.questions.length} {quiz.questions.length === 1 ? 'question' : 'questions'}</span><span><i>◷</i>Work at your own pace</span></div></div><div className="nv-quiz-hero-art" aria-hidden="true"><div className="nv-quiz-art-ring nv-quiz-art-ring-one"/><div className="nv-quiz-art-ring nv-quiz-art-ring-two"/><div className="nv-quiz-art-note">♫</div><span className="nv-quiz-art-spark nv-quiz-art-spark-one">✦</span><span className="nv-quiz-art-spark nv-quiz-art-spark-two">✧</span></div></header>

        <section className="nv-quiz-progress-card" aria-label="Quiz progress"><div className="nv-quiz-progress-top"><div><span className="nv-quiz-progress-kicker">YOUR PROGRESS</span><strong>{answeredCount}<small> / {quiz.questions.length} answered</small></strong></div><span className="nv-quiz-progress-percent">{progress}%</span></div><div className="nv-quiz-progress-track"><div className="nv-quiz-progress-fill" style={{ width: `${progress}%` }}/></div><div className="nv-quiz-progress-bottom"><span>{allQuestionsAnswered ? 'All questions answered — ready when you are.' : 'Choose an answer for each question to finish.'}</span><span>{Math.max(quiz.questions.length - answeredCount, 0)} left</span></div></section>

        {submitted && result && <section className="nv-quiz-result-card" aria-live="polite"><div className="nv-quiz-result-icon">✓</div><div className="nv-quiz-result-copy"><span className="nv-quiz-section-kicker">QUIZ COMPLETED</span><h2>You've made it through.</h2><p>You answered {result.correctAnswers} out of {result.totalQuestions} questions correctly.</p><div className="nv-quiz-score-track"><div style={{ width: `${Math.max(0, Math.min(100, result.score))}%` }}/></div></div><div className="nv-quiz-score"><strong>{result.score}<small>%</small></strong><span>YOUR SCORE</span></div><Link to={`/student/courses/${quiz.lesson.module.courseId}/lessons/${quiz.lessonId}`} className="nv-quiz-primary-link">Back to lesson <span aria-hidden="true">→</span></Link></section>}

        {!submitted && <section className="nv-quiz-question-section" aria-label="Quiz questions">
          {quiz.questions.length === 0 ? <div className="nv-quiz-empty-card"><div className="nv-quiz-empty-icon">☷</div><h2>No questions just yet</h2><p>This quiz does not have any questions yet, so it cannot be submitted.</p><Link to={`/student/courses/${quiz.lesson.module.courseId}/lessons/${quiz.lessonId}`} className="nv-quiz-secondary-link">Return to lesson</Link></div> : <>
            <div className="nv-quiz-question-heading"><div><span className="nv-quiz-section-kicker">TAKE YOUR TIME</span><h2>Questions <span>({quiz.questions.length})</span></h2></div><span className="nv-quiz-select-note">Select one answer per question</span></div>
            {quiz.questions.map((question, index) => <article key={question.id} className={`nv-quiz-question-card${selectedAnswers[question.id] !== undefined ? ' is-answered' : ''}`}><div className="nv-quiz-question-top"><span className="nv-quiz-question-number">{String(index + 1).padStart(2, '0')}</span><div className="nv-quiz-question-text-wrap"><span className="nv-quiz-question-kicker">QUESTION {index + 1} OF {quiz.questions.length}</span><h3>{question.question}</h3></div><span className={`nv-quiz-question-status${selectedAnswers[question.id] !== undefined ? ' is-done' : ''}`}>{selectedAnswers[question.id] !== undefined ? '✓ Answered' : 'Not answered'}</span></div><div className="nv-quiz-options" role="radiogroup" aria-label={`Answers for question ${index + 1}`}>{question.options.map((option, optionIndex) => { const selected = selectedAnswers[question.id] === option.id; return <label key={option.id} className={`nv-quiz-option${selected ? ' is-selected' : ''}`}><input type="radio" name={`question-${question.id}`} value={option.id} checked={selected} onChange={() => handleOptionChange(question.id, option.id)}/><span className="nv-quiz-option-letter">{String.fromCharCode(65 + optionIndex)}</span><span className="nv-quiz-option-text">{option.text}</span><span className="nv-quiz-option-check" aria-hidden="true">{selected ? '✓' : ''}</span></label>})}</div></article>)}
            {submitMutation.isError && <div role="alert" className="nv-quiz-submit-error">{submitMutation.error instanceof Error ? submitMutation.error.message : 'Failed to submit quiz.'}</div>}
            <div className="nv-quiz-submit-panel"><div className="nv-quiz-submit-copy"><strong>{allQuestionsAnswered ? 'Ready to submit?' : 'Almost there'}</strong><p>{allQuestionsAnswered ? 'Review your choices, then submit when you’re ready.' : `You still have ${quiz.questions.length - answeredCount} ${quiz.questions.length - answeredCount === 1 ? 'question' : 'questions'} to answer.`}</p></div><button type="button" onClick={handleSubmit} disabled={!allQuestionsAnswered || submitMutation.isPending} className="nv-quiz-primary-button">{submitMutation.isPending ? 'Submitting...' : 'Submit quiz'} <span aria-hidden="true">→</span></button></div>
          </>}
        </section>}
        <footer className="nv-quiz-footer"><span>NOTEVERSE <i>♪</i></span><span>Learn something. Play something.</span></footer>
      </main>
    </div>
  )
}

function QuizState({ title, message, children, loading = false }: { title: string; message: string; children?: import('react').ReactNode; loading?: boolean }) {
  return <div className="nv-quiz-page nv-quiz-state-page"><div className="nv-quiz-state-card"><div className={`nv-quiz-state-symbol${loading ? ' is-loading' : ''}`}>{loading ? '♫' : '♪'}</div><span className="nv-quiz-section-kicker">NOTEVERSE LEARNING</span><h1>{title}</h1><p>{message}</p>{children}</div></div>
}

export default StudentQuizPage
