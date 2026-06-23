'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import AppHeader from '@/components/AppHeader'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

interface SubscriptionRow {
  status: string
  stripe_price_id: string | null
  current_period_end: string | null
  created_at: string
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-green-400 bg-green-950 border border-green-800">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold text-zinc-500 bg-zinc-900 border border-zinc-700">
      Free
    </span>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-6 space-y-4" style={{ background: 'var(--card)', borderColor: 'var(--border)' }}>
      <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h2>
      {children}
    </div>
  )
}

export default function AccountPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [sub, setSub] = useState<SubscriptionRow | null>(null)
  const [subLoading, setSubLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [deletePhase, setDeletePhase] = useState<'idle' | 'confirm' | 'deleting'>('idle')
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login')
    }
  }, [authLoading, user, router])

  // Load subscription
  useEffect(() => {
    if (!user || !supabase) { setSubLoading(false); return }
    supabase
      .from('user_subscriptions')
      .select('status, stripe_price_id, current_period_end, created_at')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setSub(data ?? null)
        setSubLoading(false)
      })
  }, [user])

  async function openBillingPortal() {
    if (!supabase || portalLoading) return
    setPortalLoading(true)
    setPortalError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not open billing portal')
      if (json.url) window.location.href = json.url
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setPortalLoading(false)
    }
  }

  async function deleteAccount() {
    if (!supabase) return
    setDeletePhase('deleting')
    setDeleteError(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Deletion failed')
      await supabase.auth.signOut()
      router.replace('/?deleted=1')
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Deletion failed')
      setDeletePhase('confirm')
    }
  }

  if (authLoading || (!user && !authLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="w-8 h-8 rounded-full border-2 border-[var(--border)] border-t-[#CC0033] animate-spin" />
      </div>
    )
  }

  const planLabel = sub?.status === 'active' ? 'RU Rate Pro' : 'Free'
  const renewalDate = sub?.current_period_end
    ? new Date(sub.current_period_end).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="max-w-xl mx-auto px-4 sm:px-6 py-12 space-y-6">
        <div className="mb-2">
          <h1 className="text-3xl font-black text-white">Account</h1>
          <p className="text-zinc-500 text-sm mt-1">Manage your RU Rate account and subscription.</p>
        </div>

        {/* Profile */}
        <Section title="Profile">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white break-all">{user!.email}</div>
              <div className="text-xs text-zinc-600 mt-0.5">
                Member since {new Date(user!.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </div>
            </div>
          </div>
        </Section>

        {/* Subscription */}
        <Section title="Subscription">
          {subLoading ? (
            <div className="h-10 rounded-lg bg-zinc-800 animate-pulse" />
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-white">{planLabel}</div>
                  {renewalDate && (
                    <div className="text-xs text-zinc-500 mt-0.5">Renews {renewalDate}</div>
                  )}
                </div>
                <StatusBadge status={sub?.status ?? 'free'} />
              </div>

              {sub?.status === 'active' ? (
                <div className="space-y-2">
                  <button
                    onClick={openBillingPortal}
                    disabled={portalLoading}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-50"
                    style={{ background: '#CC0033' }}
                  >
                    {portalLoading ? 'Opening portal…' : 'Manage subscription'}
                  </button>
                  {portalError && (
                    <p className="text-xs text-red-400 text-center">{portalError}</p>
                  )}
                </div>
              ) : (
                <Link
                  href="/pro"
                  className="block w-full py-2.5 rounded-xl text-sm font-semibold text-center text-[#ff4d6d] transition-all"
                  style={{ background: 'rgba(204,0,51,0.1)', border: '1px solid rgba(204,0,51,0.4)' }}
                >
                  Upgrade to Pro
                </Link>
              )}
            </div>
          )}
        </Section>

        {/* Data & Privacy */}
        <Section title="Data &amp; Privacy">
          <p className="text-xs text-zinc-500 leading-relaxed">
            Your sniper watchlist is stored locally in your browser. Reviews are submitted anonymously via fingerprint and are not linked to your account.
            For full details, see our{' '}
            <Link href="/privacy" className="underline text-zinc-400 hover:text-white transition-colors">Privacy Policy</Link>.
          </p>
        </Section>

        {/* Danger zone */}
        <Section title="Danger Zone">
          {deletePhase === 'idle' && (
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-white">Delete account</div>
                <div className="text-xs text-zinc-500 mt-0.5">Permanently removes your account and cancels any active subscription.</div>
              </div>
              <button
                onClick={() => setDeletePhase('confirm')}
                className="shrink-0 px-4 py-2 rounded-lg text-xs font-semibold text-red-400 border border-red-900 bg-red-950 hover:bg-red-900 transition-colors"
              >
                Delete
              </button>
            </div>
          )}

          {deletePhase === 'confirm' && (
            <div className="space-y-3">
              <p className="text-sm text-red-300 font-semibold">Are you sure? This cannot be undone.</p>
              <p className="text-xs text-zinc-500">
                Your account, subscription, and all associated data will be permanently deleted.
              </p>
              {deleteError && (
                <p className="text-xs text-red-400">{deleteError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={deleteAccount}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white bg-red-700 hover:bg-red-600 transition-colors"
                >
                  Yes, delete my account
                </button>
                <button
                  onClick={() => { setDeletePhase('idle'); setDeleteError(null) }}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-colors text-zinc-400 hover:text-white"
                  style={{ borderColor: 'var(--border)' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {deletePhase === 'deleting' && (
            <div className="flex items-center gap-3 text-sm text-zinc-400">
              <div className="w-4 h-4 rounded-full border-2 border-zinc-700 border-t-red-500 animate-spin" />
              Deleting account…
            </div>
          )}
        </Section>

        <p className="text-xs text-zinc-700 text-center">
          <Link href="/terms" className="hover:text-zinc-500 transition-colors underline underline-offset-2">Terms</Link>
          {' · '}
          <Link href="/privacy" className="hover:text-zinc-500 transition-colors underline underline-offset-2">Privacy</Link>
          {' · '}
          <a href="mailto:obvcjgaming@gmail.com" className="hover:text-zinc-500 transition-colors underline underline-offset-2">Contact</a>
        </p>
      </main>
    </div>
  )
}
