import { useQueries, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import './StudentDashboard.css'
import { useAuth } from '../auth/useAuth'
import { apiDownload, apiRequest } from '../api/client'
import type {
  CourseProgress,
  Enrollment,
} from '../features/student/studentApi'

interface CourseProgressResponse {
  success: boolean
  data: CourseProgress
}

interface CertificatesResponse {
  success: boolean
  data: Certificate[]
}

interface Certificate {
  id: number
  certificateNo: string
  issuedAt: string
  course: {
    id: number
    title: string
  }
}

function StudentDashboard() {
  const { user, logout } = useAuth()
  const [downloadingCertificateId, setDownloadingCertificateId] = useState<number | null>(null)
  const [downloadError, setDownloadError] = useState('')

  const certificatesQuery = useQuery({
    queryKey: ['student-certificates', user?.id],
    queryFn: async () => {
      if (!user?.id) {
        throw new Error('User ID is required')
      }

      const response = await apiRequest<CertificatesResponse>(
        '/certificates',
      )

      return response.data
    },
    enabled: Boolean(user?.id),
  })

  const handleCertificateDownload = async (certificate: Certificate) => {
    setDownloadingCertificateId(certificate.id)
    setDownloadError('')
    let objectUrl: string | undefined

    try {
      const pdf = await apiDownload(`/certificates/${certificate.id}/download`)
      objectUrl = URL.createObjectURL(pdf)
      const link = document.createElement('a')
      link.href = objectUrl
      link.download = `NoteVerse-Certificate-${certificate.certificateNo}.pdf`
      document.body.appendChild(link)
      try {
        link.click()
      } finally {
        link.remove()
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : 'Unable to download certificate.')
    } finally {
      if (objectUrl) {
        const urlToRevoke = objectUrl
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 1000)
      }
      setDownloadingCertificateId(null)
    }
  }

  const enrollmentsQuery = useQueries({
    queries: [
      {
        queryKey: ['my-enrollments', user?.id],
        queryFn: async () => {
          if (!user?.id) {
            throw new Error('User ID is required')
          }

          const response = await apiRequest<{
            success: boolean
            data: Enrollment[]
          }>(`/enrollments/user/${user.id}`)

          return response.data
        },
        enabled: Boolean(user?.id),
      },
    ],
  })

  const enrollments = enrollmentsQuery[0].data
  const isLoadingEnrollments = enrollmentsQuery[0].isLoading
  const isErrorEnrollments = enrollmentsQuery[0].isError

  const progressQueries = useQueries({
    queries:
      enrollments?.map((enrollment) => ({
        queryKey: [
          'course-progress',
          user?.id,
          enrollment.courseId,
        ],
        queryFn: async () => {
          if (!user?.id) {
            throw new Error('User ID is required')
          }

          const response = await apiRequest<CourseProgressResponse>(
            `/progress/user/${user.id}/course/${enrollment.courseId}`,
          )

          return response.data
        },
        enabled: Boolean(user?.id),
      })) ?? [],
  })

  const getProgressQueryForCourse = (courseId: number) => {
    const index = enrollments?.findIndex(
      (enrollment) => enrollment.courseId === courseId,
    )

    if (index === undefined || index < 0) {
      return undefined
    }

    return progressQueries[index]
  }

  const isLoadingProgress = progressQueries.some(
    (query) => query.isLoading,
  )
  const isErrorProgress = progressQueries.some(
    (query) => query.isError,
  )
  const isLoadingCompletedLessons =
    isLoadingEnrollments || isLoadingProgress
  const isErrorCompletedLessons =
    isErrorEnrollments || isErrorProgress

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>(
      '.nv-sd-reveal:not(.nv-sd-visible)',
    )

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('nv-sd-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('nv-sd-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 },
    )

    elements.forEach((element) => observer.observe(element))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="nv-student-dashboard">
      <div className="nv-sd-ambient nv-sd-ambient-one" aria-hidden="true" />
      <div className="nv-sd-ambient nv-sd-ambient-two" aria-hidden="true" />

      <nav className="nv-sd-nav">
        <div className="nv-sd-nav-inner">
          <Link to="/student" className="nv-sd-brand" aria-label="NoteVerse student dashboard">
            Note<span>Verse</span><span className="nv-sd-brand-dot">.</span>
          </Link>

          <div className="nv-sd-nav-actions">
            <span className="nv-sd-welcome">
              Welcome back, <strong>{user?.name}</strong>
            </span>
            <button type="button" onClick={logout} className="nv-sd-logout">
              <span aria-hidden="true">↗</span> Log out
            </button>
          </div>
        </div>
      </nav>

      <main className="nv-sd-main">
        <section className="nv-sd-hero nv-sd-reveal">
          <div className="nv-sd-hero-copy">
            <div className="nv-sd-eyebrow">
              <span className="nv-sd-eyebrow-dot" />
              YOUR MUSIC JOURNEY
            </div>
            <h1>Find your rhythm.<br /><span>Keep growing.</span></h1>
            <p className="nv-sd-hero-description">
              Welcome back{user?.name ? `, ${user.name}` : ''}. Pick up where you left off
              and keep building your musical skills, one lesson at a time.
            </p>
            <Link to="/student/discover" className="nv-sd-button nv-sd-button-primary">
              Explore courses <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="nv-sd-hero-art" aria-label="Decorative music waveform">
            <div className="nv-sd-art-orbit nv-sd-art-orbit-one" />
            <div className="nv-sd-art-orbit nv-sd-art-orbit-two" />
            <div className="nv-sd-vinyl">
              <div className="nv-sd-vinyl-grooves" />
              <div className="nv-sd-vinyl-label">
                <span>NOTE</span>
                <span className="nv-sd-vinyl-center">♪</span>
                <span>VERSE</span>
              </div>
            </div>
            <div className="nv-sd-art-note nv-sd-art-note-one">♫</div>
            <div className="nv-sd-art-note nv-sd-art-note-two">♪</div>
            <div className="nv-sd-waveform" aria-hidden="true">
              {Array.from({ length: 27 }, (_, index) => (
                <span key={index} style={{ '--wave-index': index, height: `${7 + (index % 6) * 4}px` } as CSSProperties} />
              ))}
            </div>
            <div className="nv-sd-art-caption">
              <span className="nv-sd-art-caption-icon">♪</span>
              <span><strong>Your pace.</strong><small>Your progress.</small></span>
            </div>
          </div>
        </section>

        <section className="nv-sd-stats nv-sd-reveal" aria-label="Learning summary">
          <article className="nv-sd-stat-card">
            <div className="nv-sd-stat-icon nv-sd-icon-indigo">♫</div>
            <div>
              <p>Enrolled courses</p>
              <strong>
                {isLoadingEnrollments
                  ? '...'
                  : isErrorEnrollments
                    ? '—'
                    : enrollments?.length ?? '—'}
              </strong>
              {isErrorEnrollments && <small className="nv-sd-error-text">Unable to load course count.</small>}
            </div>
            <span className="nv-sd-stat-decoration" aria-hidden="true">01</span>
          </article>

          <article className="nv-sd-stat-card">
            <div className="nv-sd-stat-icon nv-sd-icon-violet">✓</div>
            <div>
              <p>Lessons completed</p>
              <strong>
                {isLoadingCompletedLessons
                  ? '...'
                  : isErrorCompletedLessons
                    ? '—'
                    : progressQueries.reduce(
                        (total, query) => total + (query.data?.completedLessons ?? 0),
                        0,
                      )}
              </strong>
              {isErrorCompletedLessons && <small className="nv-sd-error-text">Unable to load lesson count.</small>}
            </div>
            <span className="nv-sd-stat-decoration" aria-hidden="true">02</span>
          </article>

          <article className="nv-sd-stat-card">
            <div className="nv-sd-stat-icon nv-sd-icon-pink">✧</div>
            <div>
              <p>Certificates earned</p>
              <strong>
                {certificatesQuery.isLoading
                  ? '...'
                  : certificatesQuery.isError
                    ? '—'
                    : certificatesQuery.data?.length ?? '—'}
              </strong>
              {certificatesQuery.isError && <small className="nv-sd-error-text">Unable to load certificate count.</small>}
            </div>
            <span className="nv-sd-stat-decoration" aria-hidden="true">03</span>
          </article>
        </section>

        <section className="nv-sd-section nv-sd-reveal">
          <div className="nv-sd-section-heading">
            <div>
              <p className="nv-sd-section-kicker">MILESTONES</p>
              <h2>Your certificates</h2>
              <p className="nv-sd-section-subtitle">Celebrate the progress you’ve made.</p>
            </div>
            <span className="nv-sd-section-symbol" aria-hidden="true">✧</span>
          </div>

          {certificatesQuery.isLoading && (
            <div className="nv-sd-state-card"><span className="nv-sd-spinner" /> Loading certificates...</div>
          )}

          {certificatesQuery.isError && (
            <div role="alert" className="nv-sd-alert nv-sd-alert-error">
              Unable to load your certificates. Please try again later.
            </div>
          )}

          {downloadError && (
            <div role="alert" className="nv-sd-alert nv-sd-alert-error">{downloadError}</div>
          )}

          {!certificatesQuery.isLoading && !certificatesQuery.isError && certificatesQuery.data?.length === 0 && (
            <div className="nv-sd-empty-card">
              <div className="nv-sd-empty-icon">✧</div>
              <h3>Your first certificate is waiting</h3>
              <p>Complete a course to earn a certificate and celebrate your achievement.</p>
            </div>
          )}

          {!certificatesQuery.isLoading && !certificatesQuery.isError && Boolean(certificatesQuery.data?.length) && (
            <div className="nv-sd-certificate-list">
              {certificatesQuery.data?.map((certificate) => (
                <article key={certificate.id} className="nv-sd-certificate-card">
                  <div className="nv-sd-certificate-art" aria-hidden="true">
                    <span>NV</span><small>ACHIEVEMENT</small>
                  </div>
                  <div className="nv-sd-certificate-info">
                    <span className="nv-sd-status-pill">CERTIFICATE EARNED</span>
                    <h3>{certificate.course.title}</h3>
                    <p>Certificate No: {certificate.certificateNo}</p>
                    <p>Issued {new Date(certificate.issuedAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCertificateDownload(certificate)}
                    disabled={downloadingCertificateId === certificate.id}
                    className="nv-sd-button nv-sd-button-secondary"
                  >
                    {downloadingCertificateId === certificate.id ? 'Downloading...' : '↓ Download PDF'}
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="nv-sd-section nv-sd-learning-section nv-sd-reveal">
          <div className="nv-sd-section-heading">
            <div>
              <p className="nv-sd-section-kicker">KEEP THE MOMENTUM</p>
              <h2>Your learning space</h2>
              <p className="nv-sd-section-subtitle">Your courses, your progress, your next step.</p>
            </div>
            <Link to="/student/discover" className="nv-sd-text-link">
              Discover more <span aria-hidden="true">↗</span>
            </Link>
          </div>

          {isLoadingEnrollments && (
            <div className="nv-sd-state-card"><span className="nv-sd-spinner" /> Loading your courses...</div>
          )}

          {isErrorEnrollments && (
            <div role="alert" className="nv-sd-alert nv-sd-alert-error">Failed to load your courses.</div>
          )}

          {!isLoadingEnrollments && !isErrorEnrollments && enrollments && enrollments.length === 0 && (
            <div className="nv-sd-empty-card">
              <div className="nv-sd-empty-icon">♫</div>
              <h3>Your learning journey starts here</h3>
              <p>Explore the course library and find something that inspires you.</p>
              <Link to="/student/discover" className="nv-sd-button nv-sd-button-primary">
                Browse courses <span aria-hidden="true">↗</span>
              </Link>
            </div>
          )}

          {!isLoadingEnrollments && !isErrorEnrollments && enrollments && enrollments.length > 0 && (
            <div className="nv-sd-course-grid">
              {enrollments.map((enrollment, index) => {
                const progressQuery = getProgressQueryForCourse(enrollment.courseId)
                const progress = progressQuery?.data
                const progressPercentage = progress
                  ? Math.min(100, Math.max(0, progress.progressPercentage))
                  : 0

                return (
                  <article key={enrollment.id} className="nv-sd-course-card" style={{ '--course-index': index } as CSSProperties}>
                    <div className={`nv-sd-course-cover nv-sd-course-cover-${index % 4}`}>
                      <span className="nv-sd-course-cover-label">YOUR COURSE</span>
                      <div className="nv-sd-course-cover-art" aria-hidden="true">
                        {index % 4 === 0 ? '♫' : index % 4 === 1 ? '𝄞' : index % 4 === 2 ? '♪' : '♬'}
                      </div>
                      <span className="nv-sd-course-status">{enrollment.course.status}</span>
                    </div>

                    <div className="nv-sd-course-content">
                      <p className="nv-sd-course-number">COURSE {String(index + 1).padStart(2, '0')}</p>
                      <h3>{enrollment.course.title}</h3>
                      <p className="nv-sd-course-description">{enrollment.course.description}</p>

                      <div className="nv-sd-progress-heading">
                        <span>Course progress</span>
                        <strong>
                          {progressQuery?.isLoading
                            ? '...'
                            : progressQuery?.isError
                              ? 'Unavailable'
                              : progress
                                ? `${progress.progressPercentage}%`
                                : '—'}
                        </strong>
                      </div>

                      {progress && !progressQuery?.isError ? (
                        <>
                          <div
                            className="nv-sd-progress-track"
                            role="progressbar"
                            aria-label={`${enrollment.course.title} progress`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progressPercentage}
                          >
                            <div className="nv-sd-progress-fill" style={{ width: `${progressPercentage}%` }} />
                          </div>
                          <p className="nv-sd-progress-caption">
                            {progress.completedLessons} of {progress.totalLessons} lessons completed
                          </p>
                        </>
                      ) : (
                        <p className={`nv-sd-progress-caption ${progressQuery?.isError ? 'nv-sd-error-text' : ''}`}>
                          {progressQuery?.isLoading
                            ? 'Loading progress...'
                            : progressQuery?.isError
                              ? 'Unable to load progress.'
                              : 'Progress unavailable.'}
                        </p>
                      )}

                      {Number.isInteger(enrollment.courseId) && enrollment.courseId > 0 ? (
                        <Link to={`/student/courses/${enrollment.courseId}`} className="nv-sd-button nv-sd-button-course">
                          Continue learning <span aria-hidden="true">→</span>
                        </Link>
                      ) : (
                        <p className="nv-sd-error-text">Invalid course information.</p>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <footer className="nv-sd-footer">
          <Link to="/student" className="nv-sd-footer-brand">Note<span>Verse</span></Link>
          <p>Keep learning. Keep listening. Keep creating.</p>
          <span>MADE FOR YOUR NEXT NOTE <span aria-hidden="true">♪</span></span>
        </footer>
      </main>
    </div>
  )
}

export default StudentDashboard
