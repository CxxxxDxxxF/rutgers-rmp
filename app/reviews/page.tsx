'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

interface ReviewProfessor {
  first_name: string
  last_name: string
  slug: string
  avg_rating: number | null
  verdict: string | null
}

interface ReviewCourse {
  course_number: string
  name: string
}

interface Review {
  id: string
  quality_rating: number
  difficulty_rating: number
  would_take_again: boolean | null
  grade_received: string | null
  comment: string
  tags: string[]
  is_online: boolean
  attendance_required: boolean
  helpful_count: number
  created_at: string
  professor: ReviewProfessor | null
  course: ReviewCourse | null
}

const SORT_OPTIONS = [
  { value: 'newest',  label: 'Newest first' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest',  label: 'Lowest rated' },
] as const

const RATING_FILTERS = [
  { label: 'All', min: null, max: null },
  { label: '5 ★',  min: 5, max: 5 },
  { label: '4–5 ★', min: 4, max: 5 },
  { label: '3–4 ★', min: 3, max: 4 },
  { label: '1–2 ★', min: 1, max: 2 },
] as const

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function verdictStyle(v: string | null): { bg: string; text: string; label: string } | null {
  if (!v) return null
  if (v === 'take')    return { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e', label: 'TAKE' }
  if (v === 'depends') return { bg: 'rgba(245,158,11,0.12)', text: '#f59e0b', label: 'DEPENDS' }
  if (v === 'avoid')   return { bg: 'rgba(239,68,68,0.12)',  text: '#ef4444', label: 'AVOID' }
  return null
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${Math.max(mins, 1)}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo ago`
  return `${Math.floor(months / 12)}y ago`
}

function ReviewCard({ review }: { review: Review }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = review.comment.length > 280
  const displayComment = !isLong || expanded ? review.comment : review.comment.slice(0, 280) + '…'
  const verdict = verdictStyle(review.professor?.verdict ?? null)

  return (
    <article
      className="rounded-xl p-4 flex flex-col gap-3"
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-0.5 min-w-0">
          {review.professor ? (
            <Link
              href={`/professor/${review.professor.slug}`}
              className="font-semibold text-sm leading-tight hover:text-white transition-colors truncate"
              style={{ color: '#e4e4e7' }}
            >
              {review.professor.first_name} {review.professor.last_name}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-zinc-400">Unknown professor</span>
          )}
          {review.course && (
            <span className="text-xs text-zinc-500 truncate">
              {review.course.course_number}
              {review.course.name && ` · ${review.course.name}`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {verdict && (
            <span
              className="text-[10px] font-black tracking-wide px-1.5 py-0.5 rounded"
              style={{ background: verdict.bg, color: verdict.text }}
            >
              {verdict.label}
            </span>
          )}
          {/* Quality rating bubble */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-black shrink-0"
            style={{
              background: `${ratingColor(review.quality_rating)}20`,
              border: `1.5px solid ${ratingColor(review.quality_rating)}60`,
              color: ratingColor(review.quality_rating),
            }}
          >
            {review.quality_rating}
          </div>
        </div>
      </div>

      {/* Comment */}
      <p className="text-sm text-zinc-300 leading-relaxed">
        {displayComment}
        {isLong && (
          <button
            onClick={() => setExpanded(e => !e)}
            className="ml-1 text-zinc-500 hover:text-zinc-300 transition-colors text-xs"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </p>

      {/* Tags */}
      {review.tags && review.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {review.tags.map(tag => (
            <span
              key={tag}
              className="text-[10px] px-2 py-0.5 rounded-full text-zinc-400"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-3 text-[11px] text-zinc-600 flex-wrap">
        {review.grade_received && review.grade_received !== 'N/A' && (
          <span>Grade: <span className="text-zinc-400 font-medium">{review.grade_received}</span></span>
        )}
        {review.difficulty_rating && (
          <span>Difficulty: <span className="text-zinc-400 font-medium">{review.difficulty_rating}/5</span></span>
        )}
        {review.would_take_again != null && (
          <span className={review.would_take_again ? 'text-green-600' : 'text-red-600'}>
            {review.would_take_again ? '✓ Would take again' : '✕ Would not take again'}
          </span>
        )}
        {review.is_online && <span className="text-blue-500">Online</span>}
        <span className="ml-auto">{timeAgo(review.created_at)}</span>
      </div>
    </article>
  )
}

function ReviewsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [sort, setSort] = useState<string>(searchParams.get('sort') ?? 'newest')
  const [ratingFilter, setRatingFilter] = useState<number>(() => {
    const idx = parseInt(searchParams.get('rf') ?? '')
    return isNaN(idx) ? 0 : Math.max(0, Math.min(idx, RATING_FILTERS.length - 1))
  })
  const [reviews, setReviews] = useState<Review[]>([])
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [loading, setLoading] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const loadingRef = useRef(false)

  const buildUrl = useCallback((off: number, currentSort: string, rf: number) => {
    const rf_config = RATING_FILTERS[rf]
    const params = new URLSearchParams()
    params.set('sort', currentSort)
    params.set('offset', String(off))
    params.set('limit', '20')
    if (rf_config.min != null) params.set('min_rating', String(rf_config.min))
    if (rf_config.max != null) params.set('max_rating', String(rf_config.max))
    return `/api/reviews/recent?${params}`
  }, [])

  const fetchPage = useCallback(async (off: number, currentSort: string, rf: number, replace: boolean) => {
    if (loadingRef.current) return
    loadingRef.current = true
    if (off === 0) setInitialLoading(true)
    else setLoading(true)

    try {
      const res = await fetch(buildUrl(off, currentSort, rf))
      if (!res.ok) throw new Error('fetch failed')
      const json = await res.json()
      setReviews(prev => replace ? json.reviews : [...prev, ...json.reviews])
      setOffset(off + json.reviews.length)
      setHasMore(json.hasMore)
    } catch {
      // silent
    } finally {
      loadingRef.current = false
      setLoading(false)
      setInitialLoading(false)
    }
  }, [buildUrl])

  // Reset on filter/sort change
  useEffect(() => {
    setReviews([])
    setOffset(0)
    setHasMore(true)
    fetchPage(0, sort, ratingFilter, true)

    const p = new URLSearchParams()
    if (sort !== 'newest') p.set('sort', sort)
    if (ratingFilter !== 0) p.set('rf', String(ratingFilter))
    router.replace(p.toString() ? `?${p}` : '/reviews', { scroll: false })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, ratingFilter])

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return
    const observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore && !loadingRef.current) {
        fetchPage(offset, sort, ratingFilter, false)
      }
    }, { rootMargin: '200px' })
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [offset, hasMore, sort, ratingFilter, fetchPage])

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-black text-white">Recent Reviews</h1>
        <p className="text-sm text-zinc-500 mt-1">Student reviews submitted on RU Rate</p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3">
        {/* Rating chips */}
        <div className="flex flex-wrap gap-2">
          {RATING_FILTERS.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setRatingFilter(i)}
              className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
              style={
                ratingFilter === i
                  ? { background: 'rgba(204,0,51,0.18)', borderColor: 'rgba(204,0,51,0.55)', color: '#ff4d6d' }
                  : { background: 'transparent', borderColor: 'rgba(255,255,255,0.1)', color: '#71717a' }
              }
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-600">Sort:</span>
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="text-xs rounded-lg px-2 py-1.5 outline-none border"
            style={{
              background: 'rgba(255,255,255,0.04)',
              borderColor: 'rgba(255,255,255,0.1)',
              color: '#a1a1aa',
            }}
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Results */}
      {initialLoading ? (
        <div className="flex flex-col gap-3">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="rounded-xl h-36 animate-pulse"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        ratingFilter !== 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="text-2xl">🔍</div>
            <p className="text-sm font-semibold text-white">No reviews match this filter</p>
            <p className="text-xs text-zinc-500">Try a wider rating range.</p>
            <button
              onClick={() => setRatingFilter(0)}
              className="mt-1 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
              style={{ backgroundColor: '#CC0033' }}
            >
              Show all reviews
            </button>
          </div>
        ) : (
          <div className="max-w-md mx-auto text-center py-16 space-y-3">
            <div className="text-3xl">📝</div>
            <p className="text-base font-semibold text-white">No student reviews yet</p>
            <p className="text-sm text-zinc-500 leading-relaxed">
              RU Rate reviews are written by Rutgers students, for Rutgers students — real talk on
              grading, workload, and whether a professor is worth taking. Be the first.
            </p>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Link
                href="/professors"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-85"
                style={{ backgroundColor: '#CC0033' }}
              >
                Find a professor to review
              </Link>
              <Link
                href="/courses"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-zinc-300 border transition-colors hover:text-white hover:border-zinc-500"
                style={{ borderColor: 'var(--border)', background: 'var(--card-2)' }}
              >
                Browse courses
              </Link>
            </div>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-3">
          {reviews.map(r => <ReviewCard key={r.id} review={r} />)}
        </div>
      )}

      {/* Sentinel + loading indicator */}
      <div ref={sentinelRef} className="h-4" />
      {loading && (
        <div className="flex justify-center py-4">
          <div
            className="w-5 h-5 rounded-full border-2 animate-spin"
            style={{ borderColor: 'rgba(255,255,255,0.1)', borderTopColor: '#CC0033' }}
          />
        </div>
      )}
      {!hasMore && reviews.length > 0 && (
        <p className="text-center text-xs text-zinc-700 pb-4">All reviews loaded</p>
      )}
    </div>
  )
}

function PageLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 flex flex-col gap-3">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="rounded-xl h-36 animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
      ))}
    </div>
  )
}

export default function ReviewsPage() {
  return (
    <div className="min-h-screen" style={{ background: '#09080A', color: '#e4e4e7' }}>
      <AppHeader />
      <Suspense fallback={<PageLoading />}>
        <ReviewsContent />
      </Suspense>
    </div>
  )
}
