'use client'

import { useState } from 'react'
import AppHeader from '@/components/AppHeader'
import { supabase } from '@/lib/supabase'
import { normalizeEmail, validatePassword, mapAuthError, MIN_PASSWORD_LENGTH } from '@/lib/auth-errors'

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [signedUp, setSignedUp] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    if (!supabase) {
      setError('Accounts are temporarily unavailable. Please try again later.')
      return
    }
    const pwError = validatePassword(password)
    if (pwError) {
      setError(pwError)
      return
    }
    // Normalize so case/whitespace variants map to one identity — prevents a
    // sign-up under "Me@X.com" that a later "me@x.com " sign-in can't match.
    const cleanEmail = normalizeEmail(email)
    setLoading(true)
    setError(null)

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
      if (err) {
        setError(mapAuthError(err.message))
        setLoading(false)
      } else {
        window.location.href = '/'
      }
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: { emailRedirectTo: window.location.origin + '/login' },
      })
      if (err) {
        setError(mapAuthError(err.message))
        setLoading(false)
      } else if (data.session) {
        // Email confirmation is disabled → the account is live immediately.
        window.location.href = '/'
      } else {
        // Confirmation required → tell them to check their inbox.
        setSignedUp(true)
        setLoading(false)
      }
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="mx-auto max-w-sm px-4 py-16">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card-2)] p-6 shadow-2xl">
          <h1 className="mb-6 text-xl font-black text-white">Sign in to RU Rate</h1>

          <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl bg-[var(--card)] p-1">
            <button
              type="button"
              onClick={() => { setMode('signin'); setError(null); setSignedUp(false) }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                mode === 'signin' ? 'bg-[#CC0033] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => { setMode('signup'); setError(null); setSignedUp(false) }}
              className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                mode === 'signup' ? 'bg-[#CC0033] text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              Sign up
            </button>
          </div>

          {signedUp ? (
            <p className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-4 text-sm text-green-400">
              Check your email to confirm your account.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Email"
                required
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3 text-sm text-white outline-none focus:border-[#CC0033]"
              />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                required
                minLength={MIN_PASSWORD_LENGTH}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3 text-sm text-white outline-none focus:border-[#CC0033]"
              />

              {mode === 'signup' && !error && (
                <p className="text-[11px] text-zinc-500">At least {MIN_PASSWORD_LENGTH} characters.</p>
              )}

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-[#CC0033] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#a8002b] disabled:opacity-50"
              >
                {loading ? (mode === 'signin' ? 'Signing in...' : 'Creating account...') : (mode === 'signin' ? 'Sign in' : 'Create account')}
              </button>
            </form>
          )}

          <p className="mt-5 text-[11px] leading-relaxed text-zinc-600">
            RU Rate uses Supabase Auth. Your Rutgers email is recommended.
          </p>
        </div>
      </main>
    </div>
  )
}
