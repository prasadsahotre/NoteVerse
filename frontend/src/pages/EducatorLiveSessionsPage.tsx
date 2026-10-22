import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { apiRequest } from '../api/client'
import './EducatorLiveSessionsPage.css'

type SessionType = 'TEST' | 'DOUBT_SOLVING' | 'GENERAL_LESSON'
type SessionStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED'
type AudienceMode = 'ALL_ENROLLED' | 'SELECTED'

interface EducatorCourse {
  id: number
  title: string
  description: string | null
  status: 'DRAFT' | 'PUBLISHED'
  createdAt: string
  updatedAt: string
}

interface Enrollment {
  id: number
  userId: number
  courseId: number
  user: { id: number; name: string; email: string }
  course: { id: number; title: string; description: string | null }
}

interface AudienceMember {
  sessionId: number
  userId: number
  createdAt: string
  user: { id: number; name: string; email: string }
}

interface LiveSession {
  id: number
  courseId: number
  title: string
  description: string | null
  type: SessionType
  scheduledAt: string
  durationMinutes: number
  googleMeetUrl: string | null
  status: SessionStatus
  audienceMode: AudienceMode
  createdAt: string
  updatedAt: string
  course: { id: number; title: string }
  audience: AudienceMember[]
}

interface ListResponse<T> {
  success: boolean
  data: T
}

interface MutationResponse<T = LiveSession> {
  success: boolean
  message: string
  data: T
}

interface SessionPayload {
  courseId?: number
  title: string
  description: string | null
  type: SessionType
  scheduledAt: string
  durationMinutes: number
  googleMeetUrl: string | null
  audience: { mode: AudienceMode; studentIds?: number[] }
}

interface SessionForm {
  courseId: string
  title: string
  description: string
  type: SessionType
  scheduledAt: string
  durationMinutes: string
  googleMeetUrl: string
  audienceMode: AudienceMode
  studentIds: number[]
}

const SESSION_TYPES: Array<{ value: SessionType; label: string }> = [
  { value: 'TEST', label: 'Test / Knowledge Assessment' },
  { value: 'DOUBT_SOLVING', label: 'Doubt Solving' },
  { value: 'GENERAL_LESSON', label: 'General Lesson' },
]

const emptyForm = (): SessionForm => ({
  courseId: '',
  title: '',
  description: '',
  type: 'GENERAL_LESSON',
  scheduledAt: '',
  durationMinutes: '60',
  googleMeetUrl: '',
  audienceMode: 'ALL_ENROLLED',
  studentIds: [],
})

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function toLocalDateTime(value: string): string {
  const date = new Date(value)
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

function validateMeetUrl(value: string): string | null {
  if (!value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (
      url.protocol !== 'https:' ||
      url.hostname !== 'meet.google.com' ||
      url.port !== '' ||
      url.username !== '' ||
      url.password !== '' ||
      url.pathname.length < 2
    ) {
      return 'Use an HTTPS Google Meet link from meet.google.com.'
    }
    return null
  } catch {
    return 'Enter a valid Google Meet URL.'
  }
}

function EducatorLiveSessionsPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const approved = user?.educatorApprovalStatus === 'APPROVED'
  const [form, setForm] = useState<SessionForm>(emptyForm)
  const [editingSessionId, setEditingSessionId] = useState<number | null>(null)
  const [formError, setFormError] = useState('')
  const [feedback, setFeedback] = useState('')

  const coursesQuery = useQuery({
    queryKey: ['educator-courses', user?.id],
    queryFn: async () => (await apiRequest<ListResponse<EducatorCourse[]>>('/courses/mine')).data,
    enabled: Boolean(approved),
  })

  const enrollmentsQuery = useQuery({
    queryKey: ['educator-live-session-enrollments', user?.id],
    queryFn: async () => (await apiRequest<ListResponse<Enrollment[]>>('/enrollments')).data,
    enabled: Boolean(approved),
  })

  const sessionsQuery = useQuery({
    queryKey: ['educator-live-sessions', user?.id],
    queryFn: async () => (await apiRequest<ListResponse<LiveSession[]>>('/live-sessions/educator')).data,
    enabled: Boolean(approved),
  })

  const refreshSessions = async () => {
    await queryClient.invalidateQueries({ queryKey: ['educator-live-sessions', user?.id] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ sessionId, payload }: { sessionId: number | null; payload: SessionPayload }) =>
      apiRequest<MutationResponse>(sessionId === null ? '/live-sessions/' : `/live-sessions/${sessionId}`, {
        method: sessionId === null ? 'POST' : 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Live session saved.')
      setForm(emptyForm())
      setEditingSessionId(null)
      setFormError('')
      await refreshSessions()
    },
  })

  const transitionMutation = useMutation({
    mutationFn: ({ sessionId, action }: { sessionId: number; action: 'cancel' | 'complete' }) =>
      apiRequest<MutationResponse>(`/live-sessions/${sessionId}/${action}`, { method: 'POST' }),
    onSuccess: async (response) => {
      setFeedback(response.message || 'Session updated.')
      await refreshSessions()
    },
  })

  if (!approved) return <Navigate to="/educator" replace />

  const selectedCourseId = Number(form.courseId)
  const studentsById = new Map<number, Enrollment['user']>()
  for (const enrollment of enrollmentsQuery.data ?? []) {
    if (enrollment.courseId === selectedCourseId) studentsById.set(enrollment.user.id, enrollment.user)
  }
  const currentStudents = [...studentsById.values()].sort((a, b) => a.name.localeCompare(b.name))
  const currentStudentIds = new Set(currentStudents.map((student) => student.id))
  const selectedCurrentStudentIds = form.studentIds.filter((id) => currentStudentIds.has(id))
  const hasFormerAudienceMembers = form.studentIds.some((id) => !currentStudentIds.has(id))

  const updateForm = <K extends keyof SessionForm>(key: K, value: SessionForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const resetForm = () => {
    setForm(emptyForm())
    setEditingSessionId(null)
    setFormError('')
    saveMutation.reset()
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormError('')
    setFeedback('')
    saveMutation.reset()

    const title = form.title.trim()
    if (!title) return setFormError('Enter a session title.')
    if (!form.courseId || !coursesQuery.data?.some((course) => course.id === selectedCourseId)) {
      return setFormError('Select one of your courses.')
    }
    const scheduledDate = new Date(form.scheduledAt)
    if (!form.scheduledAt || Number.isNaN(scheduledDate.getTime())) return setFormError('Choose a valid date and time.')
    if (scheduledDate.getTime() <= Date.now()) return setFormError('Choose a future date and time.')
    const durationMinutes = Number(form.durationMinutes)
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      return setFormError('Duration must be between 5 and 480 minutes.')
    }
    const meetUrlError = validateMeetUrl(form.googleMeetUrl)
    if (meetUrlError) return setFormError(meetUrlError)
    if (form.audienceMode === 'SELECTED' && selectedCurrentStudentIds.length === 0) {
      return setFormError('Select at least one currently enrolled student.')
    }

    const payload: SessionPayload = {
      ...(editingSessionId === null ? { courseId: selectedCourseId } : {}),
      title,
      description: form.description.trim() || null,
      type: form.type,
      scheduledAt: scheduledDate.toISOString(),
      durationMinutes,
      googleMeetUrl: form.googleMeetUrl.trim() || null,
      audience: {
        mode: form.audienceMode,
        ...(form.audienceMode === 'SELECTED' ? { studentIds: selectedCurrentStudentIds } : {}),
      },
    }
    saveMutation.mutate({ sessionId: editingSessionId, payload })
  }

  const startEdit = (session: LiveSession) => {
    setFeedback('')
    setFormError('')
    saveMutation.reset()
    setEditingSessionId(session.id)
    setForm({
      courseId: String(session.courseId),
      title: session.title,
      description: session.description ?? '',
      type: session.type,
      scheduledAt: toLocalDateTime(session.scheduledAt),
      durationMinutes: String(session.durationMinutes),
      googleMeetUrl: session.googleMeetUrl ?? '',
      audienceMode: session.audienceMode,
      studentIds: session.audience.map(({ userId }) => userId),
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const transition = (session: LiveSession, action: 'cancel' | 'complete') => {
    const message = action === 'cancel'
      ? `Cancel “${session.title}”? Its Google Meet link will be cleared, and students will no longer be able to join through NoteVerse.`
      : `Mark “${session.title}” as completed? Its Google Meet link will be cleared and students will no longer be able to join through NoteVerse.`
    if (!window.confirm(message)) return
    setFeedback('')
    transitionMutation.reset()
    transitionMutation.mutate({ sessionId: session.id, action })
  }

  const toggleStudent = (studentId: number) => {
    setForm((current) => ({
      ...current,
      studentIds: current.studentIds.includes(studentId)
        ? current.studentIds.filter((id) => id !== studentId)
        : [...current.studentIds, studentId],
    }))
  }

  return (
    <div className="nv-live-sessions min-h-screen px-4 py-8 text-white sm:px-6 lg:py-12">
      <main className="mx-auto max-w-7xl">
        <header className="nv-live-header mb-8 flex flex-col justify-between gap-5 rounded-3xl border border-indigo-400/15 p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <Link to="/educator" className="text-sm font-medium text-indigo-300 hover:text-indigo-200">← Educator dashboard</Link>
            <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Educator workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Live Sessions</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Schedule Google Meet sessions for your enrolled students and manage upcoming sessions and history.</p>
          </div>
          <span className="w-fit rounded-full border border-indigo-300/20 bg-indigo-300/10 px-4 py-2 text-sm font-medium text-indigo-100">Meet link managed by you</span>
        </header>

        {feedback && <p role="status" className="mb-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.07] px-4 py-3 text-sm text-emerald-200">{feedback}</p>}
        {transitionMutation.isError && <p role="alert" className="mb-5 rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] px-4 py-3 text-sm text-rose-200">{errorText(transitionMutation.error, 'Unable to update this session.')}</p>}

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.82fr)_minmax(0,1.4fr)]">
          <section aria-labelledby="session-form-heading" className="nv-live-panel rounded-3xl border border-slate-700/60 p-5 sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Session details</p>
              <h2 id="session-form-heading" className="mt-2 text-xl font-bold">{editingSessionId === null ? 'Schedule a session' : 'Edit scheduled session'}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">The audience is saved as a snapshot when you schedule or update this session. Students must also remain enrolled to join.</p>
            </div>

            {coursesQuery.isLoading ? <p className="rounded-xl bg-slate-950/60 p-4 text-sm text-slate-300">Loading your courses…</p> : null}
            {coursesQuery.isError && <div role="alert" className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.07] p-4 text-sm text-rose-200"><p>{errorText(coursesQuery.error, 'Unable to load your courses.')}</p><button type="button" onClick={() => void coursesQuery.refetch()} className="mt-3 rounded-lg border border-rose-200/25 px-3 py-2 font-semibold hover:bg-rose-300/10">Try again</button></div>}
            {coursesQuery.data?.length === 0 && <p className="rounded-xl border border-slate-700/60 bg-slate-950/60 p-4 text-sm text-slate-300">Create a course in your educator dashboard before scheduling a live session.</p>}

            {coursesQuery.data && coursesQuery.data.length > 0 && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="live-course" className="block text-sm font-medium text-slate-200">Course</label>
                  <select id="live-course" value={form.courseId} disabled={editingSessionId !== null} onChange={(event) => { updateForm('courseId', event.target.value); updateForm('studentIds', []) }} required className="nv-live-control mt-2 w-full rounded-xl border px-3.5 py-3 text-sm">
                    <option value="">Choose a course</option>
                    {coursesQuery.data.map((course) => <option key={course.id} value={course.id}>{course.title}{course.status === 'DRAFT' ? ' · Draft' : ''}</option>)}
                  </select>
                </div>

                <div>
                  <label htmlFor="live-title" className="block text-sm font-medium text-slate-200">Session title</label>
                  <input id="live-title" value={form.title} onChange={(event) => updateForm('title', event.target.value)} required maxLength={160} className="nv-live-control mt-2 w-full rounded-xl border px-3.5 py-3 text-sm" placeholder="e.g. Chord changes workshop" />
                </div>

                <div>
                  <label htmlFor="live-description" className="block text-sm font-medium text-slate-200">Description <span className="text-slate-500">(optional)</span></label>
                  <textarea id="live-description" value={form.description} onChange={(event) => updateForm('description', event.target.value)} rows={3} className="nv-live-control mt-2 w-full resize-y rounded-xl border px-3.5 py-3 text-sm" placeholder="Share what students should prepare." />
                </div>

                <div>
                  <label htmlFor="live-type" className="block text-sm font-medium text-slate-200">Session type</label>
                  <select id="live-type" value={form.type} onChange={(event) => updateForm('type', event.target.value as SessionType)} className="nv-live-control mt-2 w-full rounded-xl border px-3.5 py-3 text-sm">
                    {SESSION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                  </select>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="live-date" className="block text-sm font-medium text-slate-200">Date and start time</label>
                    <input id="live-date" type="datetime-local" value={form.scheduledAt} onChange={(event) => updateForm('scheduledAt', event.target.value)} required className="nv-live-control mt-2 w-full rounded-xl border px-3 py-3 text-sm" />
                  </div>
                  <div>
                    <label htmlFor="live-duration" className="block text-sm font-medium text-slate-200">Duration (minutes)</label>
                    <input id="live-duration" type="number" min={5} max={480} step={1} value={form.durationMinutes} onChange={(event) => updateForm('durationMinutes', event.target.value)} required className="nv-live-control mt-2 w-full rounded-xl border px-3 py-3 text-sm" />
                  </div>
                </div>

                <div>
                  <label htmlFor="live-meet-url" className="block text-sm font-medium text-slate-200">Google Meet URL <span className="text-slate-500">(optional)</span></label>
                  <input id="live-meet-url" type="url" inputMode="url" value={form.googleMeetUrl} onChange={(event) => updateForm('googleMeetUrl', event.target.value)} className="nv-live-control mt-2 w-full rounded-xl border px-3.5 py-3 text-sm" placeholder="https://meet.google.com/..." />
                  <p className="mt-2 text-xs leading-5 text-slate-500">Paste a link you created in Google Meet. Leaving this blank removes a saved link when editing.</p>
                </div>

                <fieldset className="rounded-2xl border border-slate-700/60 bg-slate-950/35 p-4">
                  <legend className="px-1 text-sm font-semibold text-slate-200">Who can attend?</legend>
                  <label className="mt-1 flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-white/[0.03]">
                    <input type="radio" name="audience" checked={form.audienceMode === 'ALL_ENROLLED'} onChange={() => { updateForm('audienceMode', 'ALL_ENROLLED'); updateForm('studentIds', []) }} className="mt-1 accent-indigo-400" />
                    <span><span className="block text-sm font-medium text-slate-100">All currently enrolled students</span><span className="mt-1 block text-xs leading-5 text-slate-400">Students enrolling later are not automatically added.</span></span>
                  </label>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl p-2 hover:bg-white/[0.03]">
                    <input type="radio" name="audience" checked={form.audienceMode === 'SELECTED'} onChange={() => updateForm('audienceMode', 'SELECTED')} className="mt-1 accent-indigo-400" />
                    <span><span className="block text-sm font-medium text-slate-100">Select specific students</span><span className="mt-1 block text-xs leading-5 text-slate-400">Only students enrolled in this course can be selected.</span></span>
                  </label>

                  {form.audienceMode === 'SELECTED' && (
                    <div className="mt-3 border-t border-slate-700/60 pt-3">
                      {enrollmentsQuery.isLoading && <p className="text-sm text-slate-400">Loading enrolled students…</p>}
                      {enrollmentsQuery.isError && <div role="alert" className="text-sm text-rose-200"><p>{errorText(enrollmentsQuery.error, 'Unable to load the student roster.')}</p><button type="button" onClick={() => void enrollmentsQuery.refetch()} className="mt-2 underline underline-offset-4">Retry roster</button></div>}
                      {enrollmentsQuery.data && currentStudents.length === 0 && <p className="text-sm text-slate-400">No students are currently enrolled in this course.</p>}
                      {enrollmentsQuery.data && hasFormerAudienceMembers && <p className="mb-2 text-xs leading-5 text-amber-200">Some previously invited students are no longer enrolled. They will be removed from the updated audience.</p>}
                      <div className="max-h-56 space-y-1 overflow-y-auto">
                        {currentStudents.map((student) => (
                          <label key={student.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                            <input type="checkbox" checked={form.studentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} className="h-4 w-4 accent-indigo-400" />
                            <span className="min-w-0"><span className="block truncate text-sm text-slate-100">{student.name}</span><span className="block truncate text-xs text-slate-500">{student.email}</span></span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </fieldset>

                {formError && <p role="alert" className="rounded-lg text-sm text-rose-300">{formError}</p>}
                {saveMutation.isError && <p role="alert" className="rounded-lg text-sm text-rose-300">{errorText(saveMutation.error, 'Unable to save this session.')}</p>}
                <div className="flex flex-wrap gap-3 pt-1">
                  <button type="submit" disabled={saveMutation.isPending || coursesQuery.isLoading || coursesQuery.isError || (form.audienceMode === 'SELECTED' && (enrollmentsQuery.isLoading || enrollmentsQuery.isError || currentStudents.length === 0))} className="rounded-xl bg-indigo-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50">
                    {saveMutation.isPending ? 'Saving…' : editingSessionId === null ? 'Schedule session' : 'Save changes'}
                  </button>
                  {editingSessionId !== null && <button type="button" onClick={resetForm} disabled={saveMutation.isPending} className="rounded-xl border border-slate-600 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50">Cancel edit</button>}
                </div>
              </form>
            )}
          </section>

          <section aria-labelledby="session-list-heading" className="min-w-0">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-300">Your schedule</p><h2 id="session-list-heading" className="mt-2 text-2xl font-bold">Sessions and history</h2></div>
              {sessionsQuery.data && <span className="rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-slate-300">{sessionsQuery.data.length} total</span>}
            </div>
            {sessionsQuery.isLoading && <div className="nv-live-panel rounded-2xl p-8 text-center text-slate-300">Loading your sessions…</div>}
            {sessionsQuery.isError && <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/[0.07] p-6 text-rose-100"><p>{errorText(sessionsQuery.error, 'Unable to load your sessions.')}</p><button type="button" onClick={() => void sessionsQuery.refetch()} className="mt-4 rounded-xl border border-rose-200/30 px-4 py-2 text-sm font-semibold hover:bg-rose-300/10">Try again</button></div>}
            {sessionsQuery.data?.length === 0 && <div className="nv-live-panel rounded-2xl p-8 text-center"><p className="font-semibold text-slate-100">No sessions scheduled yet</p><p className="mt-2 text-sm text-slate-400">Create a session for one of your courses using the form.</p></div>}
            {sessionsQuery.data && sessionsQuery.data.length > 0 && (
              <div className="space-y-4">
                {sessionsQuery.data.map((session) => (
                  <article key={session.id} className="nv-live-panel rounded-2xl border border-slate-700/60 p-5 sm:p-6">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="break-words text-lg font-bold text-white">{session.title}</h3>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${session.status === 'SCHEDULED' ? 'bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/20' : session.status === 'COMPLETED' ? 'bg-emerald-300/10 text-emerald-200 ring-1 ring-emerald-300/20' : 'bg-slate-700/70 text-slate-300 ring-1 ring-slate-500/30'}`}>{session.status === 'SCHEDULED' ? 'Scheduled' : session.status === 'COMPLETED' ? 'Completed' : 'Cancelled'}</span>
                        </div>
                        <p className="mt-1 text-sm text-indigo-200">{session.course.title} <span className="text-slate-500">·</span> {SESSION_TYPES.find((type) => type.value === session.type)?.label}</p>
                        {session.description && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{session.description}</p>}
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 rounded-xl border border-white/[0.06] bg-slate-950/35 p-4 text-sm sm:grid-cols-2">
                      <div><span className="block text-xs font-medium uppercase tracking-wider text-slate-500">Scheduled</span><time className="mt-1 block text-slate-100" dateTime={session.scheduledAt}>{new Date(session.scheduledAt).toLocaleString()}</time></div>
                      <div><span className="block text-xs font-medium uppercase tracking-wider text-slate-500">Duration</span><span className="mt-1 block text-slate-100">{session.durationMinutes} minutes</span></div>
                      <div><span className="block text-xs font-medium uppercase tracking-wider text-slate-500">Audience</span><span className="mt-1 block text-slate-100">{session.audienceMode === 'ALL_ENROLLED' ? 'All enrolled at scheduling' : `${session.audience.length} selected student${session.audience.length === 1 ? '' : 's'}`}</span></div>
                      <div><span className="block text-xs font-medium uppercase tracking-wider text-slate-500">Meet link</span><span className="mt-1 block text-slate-100">{session.googleMeetUrl ? 'Added' : 'Not set'}</span></div>
                    </div>
                    {session.audienceMode === 'SELECTED' && session.audience.length > 0 && <p className="mt-3 text-xs leading-5 text-slate-400">Invited: {session.audience.map(({ user }) => user.name).join(', ')}</p>}
                    {session.status === 'SCHEDULED' && (
                      <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
                        <button type="button" onClick={() => startEdit(session)} disabled={saveMutation.isPending || transitionMutation.isPending} className="rounded-lg border border-indigo-300/25 bg-indigo-300/[0.07] px-3.5 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-300/[0.13] disabled:opacity-50">Edit session</button>
                        <button type="button" onClick={() => transition(session, 'cancel')} disabled={transitionMutation.isPending || saveMutation.isPending} className="rounded-lg border border-rose-300/25 px-3.5 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-300/[0.08] disabled:opacity-50">{transitionMutation.isPending && transitionMutation.variables?.sessionId === session.id && transitionMutation.variables.action === 'cancel' ? 'Cancelling…' : 'Cancel session'}</button>
                        <button type="button" onClick={() => transition(session, 'complete')} disabled={transitionMutation.isPending || saveMutation.isPending} className="rounded-lg border border-emerald-300/25 px-3.5 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-300/[0.08] disabled:opacity-50">{transitionMutation.isPending && transitionMutation.variables?.sessionId === session.id && transitionMutation.variables.action === 'complete' ? 'Completing…' : 'Mark completed'}</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}

export default EducatorLiveSessionsPage
