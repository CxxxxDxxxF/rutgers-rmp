'use client'

import { useState } from 'react'
import Link from 'next/link'

type Status = 'pending' | 'approved' | 'rejected'

interface Submission {
  id: string
  professor_name: string
  course_id: string
  semester_code: string | null
  section_number: string | null
  evidence: string | null
  status: Status
  upvotes: number
  downvotes: number
  created_at: string
}

const STATUS_STYLES: Record<Status, string> = {
  pending: 'bg-amber-950 border-amber-800 text-amber-400',
  approved: 'bg-green-950 border-green-800 text-green-400',
  rejected: 'bg-red-950 border-red-900 text-red-400',
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// --------------------------------------------------------------------------
// Lock screen
// --------------------------------------------------------------------------
function LockScreen({ onUnlock }: { onUnlock: (secret: string) => void }) {
  const [input, setInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/submissions?status=pending', {
        headers: { Authorization: `Bearer ${input.trim()}` },
      })
      if (res.status === 401 || res.status === 403) {
        setError('Invalid admin secret.')
        return
      }
      if (!res.ok) {
        setError('Server error — try again.')
        return
      }
      onUnlock(input.trim())
    } catch {
      setError('Network error — try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex items-center gap-2 justify-center">
          <div
            className="w-8 h-8 rounded flex items-center justify-center font-black text-white text-sm"
            style={{ backgroundColor: '#CC0033' }}
          >
            RU
          </div>
          <span className="font-bold text-white">Admin — Submissions</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Admin secret"
            autoFocus
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500 text-sm"
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-full py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
            style={{ backgroundColor: '#CC0033' }}
          >
            {loading ? 'Verifying…' : 'Enter'}
          </button>
        </form>

        <div className="text-center">
          <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Admin panel (shown after successful auth)
// --------------------------------------------------------------------------
function AdminPanel({ secret }: { secret: string }) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [filter, setFilter] = useState<Status | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  // Load on mount and when filter changes
  const [loadedFilter, setLoadedFilter] = useState<string | null>(null)

  if (loadedFilter !== filter) {
    setLoadedFilter(filter)
    setLoading(true)
    setError(null)
    const url =
      filter === 'all'
        ? '/api/admin/submissions'
        : `/api/admin/submissions?status=${filter}`
    fetch(url, { headers: { Authorization: `Bearer ${secret}` } })
      .then(res => {
        if (!res.ok) throw new Error('Failed to load submissions')
        return res.json()
      })
      .then(data => setSubmissions(data))
      .catch(e => setError(e instanceof Error ? e.message : 'Something went wrong'))
      .finally(() => setLoading(false))
  }

  async function updateStatus(id: string, status: 'approved' | 'rejected') {
    setUpdating(id)
    try {
      const res = await fetch(`/api/submissions/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error('Update failed')
      setSubmissions(prev => prev.map(s => (s.id === id ? { ...s, status } : s)))
    } catch {
      // keep current state on failure
    } finally {
      setUpdating(null)
    }
  }

  const counts = submissions.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1
      return acc
    },
    {} as Record<Status, number>
  )

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-zinc-900 px-6 py-4 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded flex items-center justify-center font-black text-white text-xs"
                style={{ backgroundColor: '#CC0033' }}
              >
                RU
              </div>
              <span className="font-bold text-white text-sm">Admin — Submissions</span>
            </div>
          </div>

          <div className="text-xs text-zinc-600">{submissions.length} total</div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 space-y-6">
        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                filter === f
                  ? 'bg-zinc-100 text-black border-zinc-100'
                  : 'text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f !== 'all' && counts[f] ? (
                <span className="ml-1.5 text-xs opacity-70">{counts[f]}</span>
              ) : null}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="relative w-10 h-10">
              <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
              <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
            </div>
          </div>
        ) : error ? (
          <div className="bg-red-950/40 border border-red-900 rounded-xl p-6 text-center">
            <p className="text-red-400">{error}</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <p className="text-zinc-400 font-semibold">No submissions</p>
            <p className="text-zinc-600 text-sm mt-1">Nothing to review right now.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {submissions.map(sub => (
              <div
                key={sub.id}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{sub.professor_name}</span>
                      <span className="text-xs text-zinc-500">→</span>
                      <span className="text-sm text-zinc-400 font-mono">{sub.course_id}</span>
                      {sub.semester_code && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                          {sub.semester_code}
                        </span>
                      )}
                      {sub.section_number && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-800 border border-zinc-700 text-zinc-400">
                          §{sub.section_number}
                        </span>
                      )}
                    </div>
                    {sub.evidence && (
                      <p className="text-sm text-zinc-500 italic">&ldquo;{sub.evidence}&rdquo;</p>
                    )}
                    <p className="text-xs text-zinc-700">{timeAgo(sub.created_at)}</p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`text-xs font-bold px-2 py-1 rounded-md border ${STATUS_STYLES[sub.status]}`}
                    >
                      {sub.status.toUpperCase()}
                    </span>
                  </div>
                </div>

                {sub.status === 'pending' && (
                  <div className="flex items-center gap-2 pt-1 border-t border-zinc-800">
                    <button
                      onClick={() => updateStatus(sub.id, 'approved')}
                      disabled={updating === sub.id}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white bg-green-900 border border-green-700 hover:bg-green-800 disabled:opacity-40 transition-all"
                    >
                      {updating === sub.id ? '...' : 'Approve'}
                    </button>
                    <button
                      onClick={() => updateStatus(sub.id, 'rejected')}
                      disabled={updating === sub.id}
                      className="px-4 py-1.5 rounded-lg text-sm font-semibold text-zinc-300 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 disabled:opacity-40 transition-all"
                    >
                      {updating === sub.id ? '...' : 'Reject'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

// --------------------------------------------------------------------------
// Page root — controls locked / unlocked state
// --------------------------------------------------------------------------
export default function SubmissionsAdminPage() {
  const [secret, setSecret] = useState<string | null>(null)

  if (!secret) {
    return <LockScreen onUnlock={setSecret} />
  }

  return <AdminPanel secret={secret} />
}
