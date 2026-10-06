import { useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/AuthContext'

function HomePage() {
  const { user, isAuthenticated, login, logout } = useAuth()

  const [showLogin, setShowLogin] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [isLoggingIn, setIsLoggingIn] = useState(false)

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    setLoginError('')
    setIsLoggingIn(true)

    try {
      await login(email, password)
      setShowLogin(false)
      setEmail('')
      setPassword('')
    } catch (error) {
      setLoginError(
        error instanceof Error
          ? error.message
          : 'Login failed. Please try again.',
      )
    } finally {
      setIsLoggingIn(false)
    }
  }

  const handleLogout = () => {
    logout()
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Navbar */}
      <nav className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="text-2xl font-bold tracking-tight">
            Note<span className="text-indigo-400">Verse</span>
          </div>

          <div className="hidden items-center gap-8 md:flex">
            <a
              href="#courses"
              className="text-sm text-slate-300 hover:text-white"
            >
              Courses
            </a>

            <a
              href="#features"
              className="text-sm text-slate-300 hover:text-white"
            >
              Features
            </a>

            {isAuthenticated ? (
              <>
                <div className="text-sm text-slate-300">
                  Hi,{' '}
                  <span className="font-medium text-white">
                    {user?.name}
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    setLoginError('')
                    setShowLogin(true)
                  }}
                  className="rounded-lg border border-white/15 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  Login
                </button>

                <button
                  onClick={() => {
                    setLoginError('')
                    setShowLogin(true)
                  }}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium hover:bg-indigo-400"
                >
                  Get Started
                </button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main>
        <section className="mx-auto flex min-h-[calc(100vh-81px)] max-w-7xl items-center px-6 py-20">
          <div className="grid w-full gap-16 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="mb-6 inline-flex rounded-full border border-indigo-400/20 bg-indigo-400/10 px-4 py-2 text-sm text-indigo-300">
                Learn. Practice. Create.
              </div>

              <h1 className="max-w-3xl text-5xl font-bold leading-tight tracking-tight sm:text-6xl">
                Learn music.
                <br />
                <span className="text-indigo-400">
                  Find your rhythm.
                </span>
              </h1>

              <p className="mt-6 max-w-xl text-lg leading-8 text-slate-400">
                NoteVerse is a music learning platform where students can
                discover courses, learn from educators, practice their skills,
                and track their progress.
              </p>

              <div className="mt-8 flex flex-wrap gap-4">
                <button className="rounded-lg bg-indigo-500 px-6 py-3 font-medium hover:bg-indigo-400">
                  Browse Courses
                </button>

                <button className="rounded-lg border border-white/15 px-6 py-3 font-medium text-slate-200 hover:bg-white/5">
                  Become an Educator
                </button>
              </div>
            </div>

            <div className="relative hidden lg:block">
              <div className="absolute -inset-8 rounded-full bg-indigo-500/10 blur-3xl" />

              <div className="relative rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur">
                <div className="mb-8 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-400">
                      Featured Course
                    </p>
                    <h2 className="mt-1 text-2xl font-semibold">
                      Learn Guitar from Scratch
                    </h2>
                  </div>

                  <div className="rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-indigo-300">
                    Music
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-xl bg-slate-900/80 p-4">
                    <p className="text-sm text-slate-400">
                      Module 01
                    </p>
                    <p className="mt-1 font-medium">
                      Getting Started
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-900/80 p-4">
                    <p className="text-sm text-slate-400">
                      Module 02
                    </p>
                    <p className="mt-1 font-medium">
                      Chords & Techniques
                    </p>
                  </div>

                  <div className="rounded-xl bg-slate-900/80 p-4">
                    <p className="text-sm text-slate-400">
                      Module 03
                    </p>
                    <p className="mt-1 font-medium">
                      Playing Your First Song
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="border-t border-white/10 bg-slate-900/50 px-6 py-24"
        >
          <div className="mx-auto max-w-7xl">
            <div className="max-w-2xl">
              <p className="text-sm font-medium uppercase tracking-wider text-indigo-400">
                Why NoteVerse?
              </p>

              <h2 className="mt-3 text-3xl font-bold sm:text-4xl">
                Everything you need to learn music
              </h2>

              <p className="mt-4 text-slate-400">
                Learn at your own pace with structured courses, interactive
                lessons, quizzes, and progress tracking.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-3">
              <FeatureCard
                title="Learn from educators"
                description="Access structured courses created by educators and learn through lessons designed for different skill levels."
              />

              <FeatureCard
                title="Track your progress"
                description="Keep track of completed lessons and see how far you've progressed through each course."
              />

              <FeatureCard
                title="Practice with quizzes"
                description="Test your understanding with quizzes and review your previous attempts."
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section id="courses" className="px-6 py-24">
          <div className="mx-auto max-w-4xl rounded-3xl border border-indigo-400/20 bg-indigo-500/10 px-8 py-16 text-center">
            <h2 className="text-3xl font-bold sm:text-4xl">
              Ready to start learning?
            </h2>

            <p className="mx-auto mt-4 max-w-2xl text-slate-400">
              Explore courses, learn from educators, and build your musical
              skills with NoteVerse.
            </p>

            <button
              onClick={() => {
                if (!isAuthenticated) {
                  setLoginError('')
                  setShowLogin(true)
                }
              }}
              className="mt-8 rounded-lg bg-indigo-500 px-6 py-3 font-medium hover:bg-indigo-400"
            >
              Explore Courses
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 NoteVerse. All rights reserved.</p>
          <p>Learn. Practice. Create.</p>
        </div>
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-8 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  Welcome back
                </h2>

                <p className="mt-2 text-sm text-slate-400">
                  Login to continue learning with NoteVerse.
                </p>
              </div>

              <button
                onClick={() => setShowLogin(false)}
                className="text-xl text-slate-400 hover:text-white"
                aria-label="Close login"
              >
                ×
              </button>
            </div>

            <form
              onSubmit={handleLogin}
              className="mt-8 space-y-5"
            >
              <div>
                <label
                  htmlFor="email"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Email
                </label>

                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="student@noteverse.com"
                  required
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-2 block text-sm font-medium text-slate-300"
                >
                  Password
                </label>

                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-lg border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-indigo-400"
                />
              </div>

              {loginError && (
                <div className="rounded-lg border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                  {loginError}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full rounded-lg bg-indigo-500 px-4 py-3 font-medium hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingIn ? 'Logging in...' : 'Login'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

type FeatureCardProps = {
  title: string
  description: string
}

function FeatureCard({ title, description }: FeatureCardProps) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
        ♪
      </div>

      <h3 className="text-lg font-semibold">{title}</h3>

      <p className="mt-3 leading-7 text-slate-400">
        {description}
      </p>
    </div>
  )
}

export default HomePage