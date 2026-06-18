'use client'

import { useState } from 'react'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'

const FEATURES = [
  'Priority open-seat alerts with email/SMS support',
  'Section watchlists by semester with open/closed history',
  'Professor fit summaries for Rutgers New Brunswick',
  'Schedule ranking by teacher quality, difficulty, and seat risk',
]

export default function ProPage() {
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [plan, setPlan] = useState<'pro' | 'club'>('pro')
  const [useCase, setUseCase] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    setSaved(false)
    setError(null)

    try {
      const res = await fetch('/api/pro-interest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          phone,
          plan,
          use_case: useCase,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not save interest')
      setSaved(true)
      setEmail('')
      setPhone('')
      setUseCase('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save interest')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="mx-auto max-w-6xl px-4 sm:px-6 py-10 pb-28">
        <section className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="motion-rise">
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone="green">Railway live</Badge>
              <Badge tone="scarlet">Rutgers NB only</Badge>
            </div>
            <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
              RU Rate Pro is for students who cannot miss a seat.
            </h1>
            <p className="mt-4 max-w-2xl text-base sm:text-lg leading-relaxed text-zinc-400">
              The free app helps students search courses and compare professors. Pro is the paid
              layer for high-priority registration: faster alerts, richer schedule ranking, and
              better decisions before WebReg opens.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {FEATURES.map(feature => (
                <div key={feature} className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300">
                  <span className="mr-2 text-green-400">✓</span>
                  {feature}
                </div>
              ))}
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/courses"
                className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: '#CC0033' }}
              >
                Search courses
              </Link>
              <Link
                href="/watchlist"
                className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
              >
                Open sniper
              </Link>
            </div>
          </div>

          <form onSubmit={submit} className="motion-rise rounded-2xl border border-zinc-800 bg-zinc-950 p-5 sm:p-6 shadow-2xl">
            <div className="mb-5">
              <h2 className="text-xl font-black text-white">Join the Pro list</h2>
              <p className="mt-1 text-sm text-zinc-500">
                No charge today. This captures demand before Stripe is wired.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 rounded-xl bg-zinc-900 p-1">
              <button
                type="button"
                onClick={() => setPlan('pro')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  plan === 'pro' ? 'bg-[#CC0033] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Student Pro
              </button>
              <button
                type="button"
                onClick={() => setPlan('club')}
                className={`rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                  plan === 'club' ? 'bg-[#CC0033] text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                Club / Group
              </button>
            </div>

            <div className="mt-5 space-y-3">
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Rutgers email"
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#CC0033]"
              />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="Phone for SMS alerts"
                className="w-full rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#CC0033]"
              />
              <textarea
                value={useCase}
                onChange={e => setUseCase(e.target.value)}
                placeholder="What would make this worth paying for?"
                rows={4}
                className="w-full resize-none rounded-xl border border-zinc-800 bg-black px-4 py-3 text-sm text-white outline-none focus:border-[#CC0033]"
              />
            </div>

            {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
            {saved && <p className="mt-3 text-sm text-green-400">Saved. You are on the list.</p>}

            <button
              type="submit"
              disabled={saving || (!email.trim() && !phone.trim())}
              className="motion-pulse-soft mt-5 w-full rounded-xl bg-[#CC0033] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#a8002b] disabled:animate-none disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Request Pro access'}
            </button>

            <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
              RU Rate does not register for you, store NetID credentials, or submit WebReg actions.
              It helps you make better decisions and move faster when a seat opens.
            </p>
          </form>
        </section>
      </main>
    </div>
  )
}
