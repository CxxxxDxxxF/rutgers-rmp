'use client'

import { Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const FEATURES = [
  'Priority open-seat alerts with email/SMS support',
  'Section watchlists by semester with open/closed history',
  'Professor fit summaries for Rutgers New Brunswick',
  'Schedule ranking by teacher quality, difficulty, and seat risk',
]

function ProPageContent() {
  const { user, loading } = useAuth()
  const searchParams = useSearchParams()
  const paymentSuccess = searchParams.get('success') === '1'

  const [plan, setPlan] = useState<'pro' | 'club'>('pro')
  const [subscribed, setSubscribed] = useState(false)
  const [subLoading, setSubLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [checkoutError, setCheckoutError] = useState<string | null>(null)

  useEffect(() => {
    if (!user || !supabase) { setSubLoading(false); return }
    supabase
      .from('user_subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSubscribed(data?.status === 'active')
        setSubLoading(false)
      })
  }, [user])

  async function handleSubscribe() {
    if (checkoutLoading || !supabase) return
    setCheckoutLoading(true)
    setCheckoutError(null)

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ plan }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not start checkout')
      if (json.url) window.location.href = json.url
    } catch (err) {
      setCheckoutError(err instanceof Error ? err.message : 'Could not start checkout')
      setCheckoutLoading(false)
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      {paymentSuccess && (
        <div className="border-b border-green-900 bg-green-950 px-4 py-3 text-center text-sm font-medium text-green-400">
          Payment successful! Welcome to Pro.
        </div>
      )}

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
                <div key={feature} className="rounded-xl border border-[var(--border)] bg-[var(--card)]/70 p-4 text-sm text-zinc-300">
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
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
              >
                Open sniper
              </Link>
            </div>
          </div>

          <div className="motion-rise rounded-2xl p-5 sm:p-6 shadow-2xl" style={{ border: '1px solid var(--border)', background: 'var(--card-2)' }}>
            {!user && !loading && !subLoading && (
              <>
                <div className="mb-5">
                  <h2 className="text-xl font-black text-white">Subscribe to Pro</h2>
                  <p className="mt-1 text-sm text-zinc-500">Sign in to get started.</p>
                </div>
                <Link
                  href="/login"
                  className="block w-full rounded-xl bg-[#CC0033] px-4 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-[#a8002b]"
                >
                  Sign in to subscribe
                </Link>
                <p className="mt-4 text-center text-sm text-zinc-500">
                  or{' '}
                  <Link href="/login" className="text-zinc-300 underline underline-offset-2 hover:text-white">
                    join the waitlist
                  </Link>
                </p>
              </>
            )}

            {user && !subscribed && !subLoading && (
              <>
                <div className="mb-5">
                  <h2 className="text-xl font-black text-white">Choose a plan</h2>
                  <p className="mt-1 text-sm text-zinc-500">Billed monthly. Cancel any time.</p>
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-[var(--card)] p-1">
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

                <p className="mt-3 text-center text-sm text-zinc-400">
                  {plan === 'pro' ? '$4.99 / month' : '$9.99 / month'}
                </p>

                {checkoutError && <p className="mt-3 text-sm text-red-400">{checkoutError}</p>}

                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={checkoutLoading}
                  className="mt-4 w-full rounded-xl bg-[#CC0033] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#a8002b] disabled:opacity-50"
                >
                  {checkoutLoading ? 'Redirecting...' : 'Subscribe with Stripe'}
                </button>

                <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
                  Clicking opens Stripe&apos;s secure checkout. RU Rate never stores your payment details.
                </p>
              </>
            )}

            {user && subscribed && !subLoading && (
              <>
                <div className="mb-5">
                  <h2 className="text-xl font-black text-white">You&apos;re a Pro subscriber</h2>
                </div>
                <div className="rounded-xl border border-green-900 bg-green-950/40 p-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-green-400">
                    <span className="text-base">✓</span>
                    Active subscription
                  </p>
                  <ul className="mt-3 space-y-2">
                    {FEATURES.map(feature => (
                      <li key={feature} className="flex items-start gap-2 text-sm text-zinc-300">
                        <span className="mt-0.5 shrink-0 text-green-400">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}

            {(loading || subLoading) && (
              <div className="flex items-center justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-700 border-t-[#CC0033]" />
              </div>
            )}

            <p className="mt-4 text-[11px] leading-relaxed text-zinc-600">
              RU Rate does not register for you, store NetID credentials, or submit WebReg actions.
              It helps you make better decisions and move faster when a seat opens.
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

export default function ProPage() {
  return (
    <Suspense>
      <ProPageContent />
    </Suspense>
  )
}
