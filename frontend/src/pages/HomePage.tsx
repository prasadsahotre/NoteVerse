import { useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'

import { useAuth } from '../auth/useAuth'
import type { RegistrationRole, User } from '../auth/auth-context'

type AuthModalMode = 'login' | 'choose-role' | 'signup'

function getPasswordFeedback(password: string) {
  const suggestions = [
    ...(password.length < 8 ? ['Use at least 8 characters.'] : []),
    ...(!/[a-z]/.test(password) ? ['Add a lowercase letter.'] : []),
    ...(!/[A-Z]/.test(password) ? ['Add an uppercase letter.'] : []),
    ...(!/\d/.test(password) ? ['Add a number.'] : []),
    ...(!/[^A-Za-z0-9]/.test(password) ? ['Add a symbol.'] : []),
  ]

  const score = 5 - suggestions.length
  return {
    label: score <= 2 ? 'Needs work' : score <= 3 ? 'Getting stronger' : 'Strong',
    suggestions,
  }
}

function HomePage() {
  const { user, isAuthenticated, login, register, logout } = useAuth()

  const [showLogin, setShowLogin] = useState(false)
  const [modalMode, setModalMode] = useState<AuthModalMode>('login')
  const [registrationRole, setRegistrationRole] = useState<RegistrationRole>('STUDENT')
  const [name, setName] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  useEffect(() => {
    const elements = document.querySelectorAll<HTMLElement>('[data-reveal]')
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      elements.forEach((element) => element.classList.add('nv-visible'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('nv-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12, rootMargin: '0px 0px -35px 0px' },
    )

    elements.forEach((element) => {
      element.classList.add('nv-reveal')
      observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  const navigateForUser = (authenticatedUser: User) => {
    if (authenticatedUser.roles.includes('STUDENT')) {
      window.location.replace('/student')
    } else if (authenticatedUser.roles.includes('ADMIN')) {
      window.location.replace('/admin')
    } else {
      window.location.replace('/educator')
    }
  }

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError('')
    setIsLoggingIn(true)

    try {
      const authenticatedUser = await login(email, password)
      setShowLogin(false)
      setEmail('')
      setPassword('')
      // Full navigation lets ProtectedRoute load the latest authenticated state.
      navigateForUser(authenticatedUser)
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Login failed. Please try again.',
      )
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleRegistration = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setLoginError('')

    if (password !== confirmation) {
      setLoginError('Passwords do not match.')
      return
    }

    setIsLoggingIn(true)
    try {
      await register(name, email, password, registrationRole)
    } catch (error) {
      setLoginError(
        error instanceof Error ? error.message : 'Registration failed. Please try again.',
      )
      setIsLoggingIn(false)
      return
    }

    try {
      const authenticatedUser = await login(email, password)
      setShowLogin(false)
      setName('')
      setEmail('')
      setPassword('')
      setConfirmation('')
      navigateForUser(authenticatedUser)
    } catch (error) {
      setPassword('')
      setConfirmation('')
      setModalMode('login')
      setLoginError(
        `Your account was created, but automatic login failed${error instanceof Error ? `: ${error.message}` : '.'} Please log in manually.`,
      )
    } finally {
      setIsLoggingIn(false)
    }
  }

  const openModal = (mode: AuthModalMode) => {
    setLoginError('')
    setModalMode(mode)
    setShowLogin(true)
  }

  const handleLogout = () => logout()

  return (
    <div className="nv-home min-h-screen text-white">
      <div className="nv-ambient nv-ambient-one" aria-hidden="true" />
      <div className="nv-ambient nv-ambient-two" aria-hidden="true" />

      <nav className="nv-nav">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="nv-brand" aria-label="NoteVerse home">
            <span className="nv-brand-mark" aria-hidden="true">♫</span>
            <span>Note<span className="nv-brand-accent">Verse</span></span>
          </a>

          <div className="flex items-center gap-3 sm:gap-6">
            <div className="hidden items-center gap-7 md:flex">
              <a href="#courses" className="nv-nav-link">Discover</a>
              <a href="#features" className="nv-nav-link">Why NoteVerse</a>
            </div>

            {isAuthenticated ? (
              <div className="flex items-center gap-3">
                <span className="hidden text-sm text-slate-300 sm:inline">
                  Hi, <span className="font-semibold text-white">{user?.name}</span>
                </span>
                <button type="button" onClick={handleLogout} className="nv-button nv-button-quiet">
                  Log out
                </button>
              </div>
            ) : (
              <>
                <button type="button" onClick={() => openModal('login')} className="nv-button nv-button-quiet">
                  Log in
                </button>
                <button type="button" onClick={() => openModal('choose-role')} className="nv-button nv-button-primary nv-nav-cta">
                  Get started <span aria-hidden="true">↗</span>
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        <section className="nv-hero mx-auto grid max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 md:py-28 lg:grid-cols-[1.03fr_0.97fr] lg:gap-10">
          <div className="nv-hero-copy">
            <div className="nv-eyebrow">
              <span className="nv-live-dot" />
              A little more music in every day
            </div>

            <h1 className="nv-display mt-7">
              Find your
              <br />
              <span className="nv-gradient-text">rhythm.</span>
              <span className="nv-heading-period"> Learn your way.</span>
            </h1>

            <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">
              A space to explore instruments, learn from passionate educators, and turn
              small practice sessions into something you’re proud of.
            </p>

            <div className="mt-9 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!isAuthenticated) openModal('login')
                  else document.getElementById('courses')?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="nv-button nv-button-primary nv-button-large"
              >
                Explore NoteVerse <span aria-hidden="true">↗</span>
              </button>
              <button
                type="button"
                onClick={() => openModal('choose-role')}
                className="nv-button nv-button-outline nv-button-large"
              >
                Teach on NoteVerse
              </button>
            </div>

            <div className="nv-hero-proof mt-10">
              <div className="nv-proof-icon" aria-hidden="true">♪</div>
              <p><strong>Learn. Practice. Create.</strong><span>Make room for your next note.</span></p>
            </div>
          </div>

          <div className="nv-visual-wrap" data-reveal>
            <div className="nv-orbit nv-orbit-one" aria-hidden="true" />
            <div className="nv-orbit nv-orbit-two" aria-hidden="true" />
            <div className="nv-music-panel">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="nv-kicker">YOUR NEXT CHAPTER</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Make music yours.</h2>
                  <p className="mt-2 text-sm text-slate-400">One lesson at a time.</p>
                </div>
                <div className="nv-note-bubble" aria-hidden="true">♫</div>
              </div>

              <div className="nv-art-stage mt-8">
                <div className="nv-art-glow" aria-hidden="true" />
                <div className="nv-record" aria-hidden="true">
                  <div className="nv-record-label"><span>NV</span></div>
                </div>
                <div className="nv-art-note nv-art-note-a" aria-hidden="true">♪</div>
                <div className="nv-art-note nv-art-note-b" aria-hidden="true">♫</div>
                <div className="nv-art-caption">
                  <span className="nv-caption-line" />
                  <span>LISTEN · LEARN · REPEAT</span>
                </div>
              </div>

              <div className="mt-7 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">Find your sound</p>
                  <p className="mt-1 text-xs text-slate-400">Your journey starts here</p>
                </div>
                <div className="nv-mini-wave" aria-hidden="true">
                  {Array.from({ length: 13 }, (_, index) => (
                    <span key={index} style={{ '--bar-index': index, height: `${8 + ((index * 7) % 5) * 4}px` } as CSSProperties} />
                  ))}
                </div>
              </div>
            </div>
            <div className="nv-floating-tag nv-floating-tag-top"><span>✦</span> Curiosity sounds good on you</div>
            <div className="nv-floating-tag nv-floating-tag-bottom"><span>♫</span> Your pace. Your sound.</div>
          </div>
        </section>

        <section id="features" className="nv-section border-t border-white/[0.07] px-5 py-20 sm:px-8 md:py-24">
          <div className="mx-auto max-w-7xl">
            <div className="nv-section-heading" data-reveal>
              <p className="nv-kicker">THE NOTEVERSE FEELING</p>
              <h2 className="nv-section-title mt-4">A place to grow into your sound.</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-400">
                Whether you’re learning your first chord or building on years of practice,
                keep your musical journey moving with tools that help you learn.
              </p>
            </div>

            <div className="mt-12 grid gap-5 md:grid-cols-3">
              <FeatureCard
                number="01"
                symbol="♫"
                title="Learn from educators"
                description="Explore structured courses made by educators and build skills step by step."
                delay="0ms"
              />
              <FeatureCard
                number="02"
                symbol="◌"
                title="Notice your progress"
                description="Keep track of completed lessons and see how far your practice has taken you."
                delay="100ms"
              />
              <FeatureCard
                number="03"
                symbol="✳"
                title="Put knowledge to work"
                description="Use quizzes to check your understanding and reinforce what you’ve learned."
                delay="200ms"
              />
            </div>
          </div>
        </section>

        <section id="courses" className="px-5 py-16 sm:px-8 md:py-24">
          <div className="nv-cta-panel mx-auto max-w-6xl px-6 py-12 sm:px-12 sm:py-16" data-reveal>
            <div className="nv-cta-decoration" aria-hidden="true">♫</div>
            <p className="nv-kicker">YOUR NEXT NOTE IS WAITING</p>
            <h2 className="nv-section-title mx-auto mt-4 max-w-2xl">Ready to make a little music?</h2>
            <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-300">
              Find a course, meet a new idea, and make a little more space for music in your life.
            </p>
            <button
              type="button"
              onClick={() => {
                if (!isAuthenticated) openModal('login')
              }}
              className="nv-button nv-button-primary nv-button-large mt-8"
            >
              Start your journey <span aria-hidden="true">↗</span>
            </button>
          </div>
        </section>
      </main>

      <footer className="nv-footer px-5 py-7 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <a href="/" className="nv-brand nv-brand-small" aria-label="NoteVerse home">
            <span className="nv-brand-mark" aria-hidden="true">♫</span>
            <span>Note<span className="nv-brand-accent">Verse</span></span>
          </a>
          <p className="text-slate-500">© 2026 NoteVerse. Made for the love of learning music.</p>
          <a href="#top" onClick={(event) => { event.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="nv-nav-link">Back to top ↑</a>
        </div>
      </footer>

      {showLogin && (
        <div
          className="nv-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setShowLogin(false)
          }}
        >
          <section
            className="nv-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-dialog-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="nv-kicker">{modalMode === 'login' ? 'WELCOME BACK' : 'JOIN THE COMMUNITY'}</p>
                <h2 id="auth-dialog-title" className="mt-3 text-2xl font-semibold tracking-tight">
                  {modalMode === 'login'
                    ? 'Good to have you back.'
                    : modalMode === 'choose-role'
                      ? 'How will you join us?'
                      : `Create your ${registrationRole === 'STUDENT' ? 'student' : 'educator'} account`}
                </h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  {modalMode === 'login'
                    ? 'Log in to continue your musical journey.'
                    : 'A new chapter in your music journey starts here.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogin(false)}
                className="nv-modal-close"
                aria-label="Close account dialog"
              >
                ×
              </button>
            </div>

            {modalMode === 'choose-role' ? (
              <div className="mt-8 grid gap-3">
                <button
                  type="button"
                  onClick={() => { setRegistrationRole('STUDENT'); setModalMode('signup') }}
                  className="nv-role-choice"
                >
                  <span className="nv-role-icon" aria-hidden="true">♫</span>
                  <span className="text-left"><strong>Learn as a student</strong><small>Discover courses and build your skills</small></span>
                  <span className="ml-auto" aria-hidden="true">↗</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setRegistrationRole('EDUCATOR'); setModalMode('signup') }}
                  className="nv-role-choice"
                >
                  <span className="nv-role-icon" aria-hidden="true">✦</span>
                  <span className="text-left"><strong>Apply as an educator</strong><small>Share your knowledge and experience</small></span>
                  <span className="ml-auto" aria-hidden="true">↗</span>
                </button>
                <button type="button" onClick={() => { setLoginError(''); setModalMode('login') }} className="nv-modal-switch">
                  Already have an account? Log in
                </button>
              </div>
            ) : (
              <form onSubmit={modalMode === 'login' ? handleLogin : handleRegistration} className="mt-8 space-y-5">
                {modalMode === 'signup' && (
                  <div>
                    <label htmlFor="signup-name" className="nv-field-label">Name</label>
                    <input id="signup-name" type="text" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required className="nv-field" />
                  </div>
                )}

                <div>
                  <label htmlFor="auth-email" className="nv-field-label">Email address</label>
                  <input id="auth-email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required className="nv-field" />
                </div>

                <div>
                  <label htmlFor="auth-password" className="nv-field-label">Password</label>
                  <input id="auth-password" type="password" autoComplete={modalMode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} minLength={modalMode === 'signup' ? 8 : undefined} required className="nv-field" />
                  {modalMode === 'signup' && (
                    <div className="mt-3 text-xs leading-5 text-slate-400" aria-live="polite">
                      <p>Password strength: <span className="font-semibold text-violet-300">{getPasswordFeedback(password).label}</span></p>
                      {getPasswordFeedback(password).suggestions.length > 0 && (
                        <ul className="mt-1 list-inside list-disc">{getPasswordFeedback(password).suggestions.map((suggestion) => <li key={suggestion}>{suggestion}</li>)}</ul>
                      )}
                    </div>
                  )}
                </div>

                {modalMode === 'signup' && (
                  <div>
                    <label htmlFor="auth-confirm-password" className="nv-field-label">Confirm password</label>
                    <input id="auth-confirm-password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required className="nv-field" />
                    {confirmation && password !== confirmation && <p className="mt-2 text-sm text-rose-300">Passwords do not match.</p>}
                  </div>
                )}

                {loginError && <div role="alert" className="nv-form-error">{loginError}</div>}
                <button type="submit" disabled={isLoggingIn || (modalMode === 'signup' && (password !== confirmation || password.length < 8))} className="nv-button nv-button-primary w-full justify-center py-3.5 disabled:cursor-not-allowed disabled:opacity-60">
                  {isLoggingIn ? 'Please wait…' : modalMode === 'login' ? 'Log in' : 'Create account'}
                </button>
                <button type="button" onClick={() => { setLoginError(''); setModalMode(modalMode === 'login' ? 'choose-role' : 'login') }} className="nv-modal-switch">
                  {modalMode === 'login' ? 'New to NoteVerse? Create an account' : 'Already have an account? Log in'}
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

type FeatureCardProps = {
  number: string
  symbol: string
  title: string
  description: string
  delay: string
}

function FeatureCard({ number, symbol, title, description, delay }: FeatureCardProps) {
  return (
    <article className="nv-feature-card" data-reveal style={{ '--reveal-delay': delay } as CSSProperties}>
      <div className="flex items-start justify-between">
        <span className="nv-feature-symbol" aria-hidden="true">{symbol}</span>
        <span className="nv-feature-number">{number}</span>
      </div>
      <h3 className="mt-8 text-lg font-semibold text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-slate-400">{description}</p>
      <div className="nv-card-accent" aria-hidden="true" />
    </article>
  )
}

export default HomePage
