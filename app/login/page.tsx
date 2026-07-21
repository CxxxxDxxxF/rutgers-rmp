'use client'

import { useState } from 'react'
import AppHeader from '@/components/AppHeader'
import { supabase } from '@/lib/supabase'

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
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setLoading(true)
    setError(null)

    if (mode === 'signin') {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password })
      if (err) {
        setError(err.message === 'Invalid login credentials'
          ? 'Wrong email or password. New here? Switch to Sign up.'
          : err.message)
        setLoading(false)
      } else {
        window.location.href = '/'
      }
    } else {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + '/login' },
      })
      if (err) {
        setError(err.message.includes('already registered') || err.message.includes('already been registered')
          ? 'That email already has an account — switch to Sign in.'
          : err.message)
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
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--card-2)] px-4 py-3 text-sm text-white outline-none focus:border-[#CC0033]"
              />

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
