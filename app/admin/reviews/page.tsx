'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'

interface AdminReview {
  id: string
  quality_rating: number
  difficulty_rating: number
  comment: string
  grade_received: string | null
  tags: string[] | null
  flag_count: number
  is_removed: boolean
  removed_at: string | null
  created_at: string
  professor: { first_name: string; last_name: string; slug: string; rmp_id: string } | null
  course: { course_number: string; name: string } | null
}

type StatusFilter = 'flagged' | 'removed' | 'all'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function qualityColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
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
      const res = await fetch('/api/admin/reviews?status=flagged&limit=1', {
        headers: { Authorization: `Bearer ${input.trim()}` },
      })
      if (res.status === 401) { setError('Invalid admin secret.'); return }
      if (!res.ok) { setError('Server error — try again.'); return }
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
          <div className="w-8 h-8 rounded flex items-center justify-center font-black text-white text-sm" style={{ backgroundColor: '#CC0033' }}>
            RU
          </div>
          <span className="font-bold text-white">Admin — Reviews</span>
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

        <div className="text-center space-y-1">
          <Link href="/admin/submissions" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors block">
            ← Submissions admin
          </Link>
          <Link href="/" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors block">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Review card
// --------------------------------------------------------------------------
function ReviewRow({
  review,
  secret,
  onUpdate,
}: {
  review: AdminReview
  secret: string
  onUpdate: (id: string, patch: Partial<AdminReview>) => void
}) {
  const [busy, setBusy] = useState<string | null>(null)

  async function act(action: 'remove' | 'restore' | 'dismiss_flags') {
    setBusy(action)
    try {
      const res = await fetch(`/api/admin/reviews/${review.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) return
      if (action === 'remove') onUpdate(review.id, { is_removed: true })
      else if (action === 'restore') onUpdate(review.id, { is_removed: false })
      else if (action === 'dismiss_flags') onUpdate(review.id, { flag_count: 0 })
    } finally {
      setBusy(null)
    }
  }

  const qColor = qualityColor(review.quality_rating)
  const profName = review.professor
    ? `${review.professor.first_name} ${review.professor.last_name}`
    : 'Unknown professor'

  return (
    <div className="relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />

      <div className="pl-4 pr-5 pt-4 pb-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-2xl font-black leading-none" style={{ color: qColor }}>
                {review.quality_rating}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Quality</div>
            </div>
            <div className="h-8 w-px bg-zinc-800" />
            <div className="text-center">
              <div
                className="text-2xl font-black leading-none"
                style={{ color: review.difficulty_rating >= 4 ? '#ef4444' : review.difficulty_rating >= 3 ? '#f59e0b' : '#22c55e' }}
              >
                {review.difficulty_rating}
              </div>
              <div className="text-[10px] text-zinc-500 mt-0.5">Diff</div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1 text-right">
            {review.professor ? (
              <Link
                href={`/professor/${review.professor.slug}?rmpId=${review.professor.rmp_id}`}
                className="text-sm font-semibold text-white hover:text-[#CC0033] transition-colors"
                target="_blank"
              >
                {profName}
              </Link>
            ) : (
              <span className="text-sm font-semibold text-zinc-500">{profName}</span>
            )}
            {review.course && (
              <span className="text-xs text-zinc-500 font-mono">{review.course.course_number}</span>
            )}
            <span className="text-xs text-zinc-700">{timeAgo(review.created_at)}</span>
          </div>
        </div>

        {/* Comment */}
        <p className="text-sm text-zinc-200 leading-relaxed">{review.comment}</p>

        {/* Tags */}
        {review.tags && review.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {review.tags.filter(Boolean).map((tag, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-zinc-800/80 text-zinc-400 border border-zinc-700/50">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer / actions */}
        <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-zinc-800/60">
          <div className="flex items-center gap-3">
            {review.flag_count > 0 && (
              <span className="text-xs font-semibold text-amber-400 bg-amber-950/40 border border-amber-800 px-2 py-0.5 rounded-md">
                ⚑ {review.flag_count} flag{review.flag_count !== 1 ? 's' : ''}
              </span>
            )}
            {review.is_removed && (
              <span className="text-xs font-semibold text-red-400 bg-red-950/40 border border-red-900 px-2 py-0.5 rounded-md">
                REMOVED
              </span>
            )}
            {review.grade_received && (
              <span className="text-xs font-mono text-zinc-400 bg-zinc-800 px-2 py-0.5 rounded-md border border-zinc-700">
                {review.grade_received}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!review.is_removed && review.flag_count > 0 && (
              <button
                onClick={() => act('dismiss_flags')}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 disabled:opacity-40 transition-all"
              >
                {busy === 'dismiss_flags' ? '…' : 'Dismiss'}
              </button>
            )}
            {review.is_removed ? (
              <button
                onClick={() => act('restore')}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 rounded-lg border border-green-800 text-green-400 bg-green-950/30 hover:bg-green-900/30 disabled:opacity-40 transition-all"
              >
                {busy === 'restore' ? '…' : 'Restore'}
              </button>
            ) : (
              <button
                onClick={() => act('remove')}
                disabled={busy !== null}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-900 text-red-400 bg-red-950/30 hover:bg-red-900/30 disabled:opacity-40 transition-all"
              >
                {busy === 'remove' ? '…' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// --------------------------------------------------------------------------
// Admin panel
// --------------------------------------------------------------------------
function AdminPanel({ secret }: { secret: string }) {
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<StatusFilter>('flagged')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchReviews = useCallback(async (status: StatusFilter, p: number, append: boolean) => {
    if (append) setLoadingMore(true); else { setLoading(true); setError(null) }
    try {
      const params = new URLSearchParams({ status, page: String(p), limit: '20' })
      const res = await fetch(`/api/admin/reviews?${params}`, {
        headers: { Authorization: `Bearer ${secret}` },
      })
      if (!res.ok) { setError('Failed to load reviews'); return }
      const json = await res.json()
      setReviews(prev => append ? [...prev, ...json.reviews] : json.reviews)
      setTotal(json.total ?? 0)
      setHasMore(json.has_more ?? false)
      setPage(p)
    } catch {
      setError('Network error')
    } finally {
      if (append) setLoadingMore(false); else setLoading(false)
    }
  }, [secret])

  useEffect(() => {
    fetchReviews(filter, 1, false)
  }, [filter, fetchReviews])

  function handleUpdate(id: string, patch: Partial<AdminReview>) {
    setReviews(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const FILTERS: { value: StatusFilter; label: string }[] = [
    { value: 'flagged', label: 'Flagged' },
    { value: 'removed', label: 'Removed' },
    { value: 'all', label: 'All' },
  ]

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <header className="border-b border-zinc-900 px-6 py-4 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Home
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <Link href="/admin/submissions" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
              Submissions
            </Link>
            <div className="h-4 w-px bg-zinc-800" />
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded flex items-center justify-center font-black text-white text-xs" style={{ backgroundColor: '#CC0033' }}>
                RU
              </div>
              <span className="font-bold text-white text-sm">Reviews</span>
            </div>
          </div>
          <div className="text-xs text-zinc-600">{total} total</div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Filter tabs */}
        <div className="flex items-center gap-2">
          {FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                filter === f.value
                  ? 'bg-zinc-100 text-black border-zinc-100'
                  : 'text-zinc-400 border-zinc-800 hover:border-zinc-600 hover:text-white'
              }`}
            >
              {f.label}
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
            <button onClick={() => fetchReviews(filter, 1, false)} className="mt-3 text-xs text-zinc-400 hover:text-white">
              Retry
            </button>
          </div>
        ) : reviews.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <p className="text-zinc-400 font-semibold">No reviews</p>
            <p className="text-zinc-600 text-sm mt-1">
              {filter === 'flagged' ? 'No flagged reviews right now.' : filter === 'removed' ? 'No removed reviews.' : 'No reviews found.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map(r => (
              <ReviewRow key={r.id} review={r} secret={secret} onUpdate={handleUpdate} />
            ))}
            {hasMore && (
              <button
                onClick={() => fetchReviews(filter, page + 1, true)}
                disabled={loadingMore}
                className="w-full py-3 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : `Load more (${total - reviews.length} remaining)`}
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

// --------------------------------------------------------------------------
// Page root
// --------------------------------------------------------------------------
export default function ReviewsAdminPage() {
  const [secret, setSecret] = useState<string | null>(null)
  if (!secret) return <LockScreen onUnlock={setSecret} />
  return <AdminPanel secret={secret} />
}
