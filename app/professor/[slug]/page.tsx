'use client'

import { Suspense, use, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'motion/react'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import CompareButton from '@/components/CompareButton'
import GradeChart from '@/components/GradeChart'
import ReviewCard from '@/components/ReviewCard'
import NativeReviewCard, { type NativeReview } from '@/components/NativeReviewCard'
import NativeGradeChart from '@/components/NativeGradeChart'
import WriteReviewForm from '@/components/WriteReviewForm'
import ProfessorGradeBadge from '@/components/ProfessorGradeBadge'
import { supabase } from '@/lib/supabase'
import type { ProfessorCache, AIAnalysis, Rating } from '@/lib/supabase'
import { buildProfessorGrade, summarizeNativeReviews } from '@/lib/professor-grade'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function VerdictBox({ analysis }: { analysis: AIAnalysis }) {
  const config = {
    take: { bg: 'bg-green-950/60', border: 'border-green-800', badge: 'bg-green-900 text-green-300', label: '✓ TAKE THIS PROF', headerColor: '#22c55e' },
    avoid: { bg: 'bg-red-950/60', border: 'border-red-900', badge: 'bg-red-900 text-red-300', label: '✗ AVOID', headerColor: '#ef4444' },
    depends: { bg: 'bg-amber-950/60', border: 'border-amber-800', badge: 'bg-amber-900 text-amber-300', label: '~ IT DEPENDS', headerColor: '#f59e0b' },
  }
  const c = config[analysis.verdict]

  return (
    <div className={`rounded-2xl border p-6 space-y-4 ${c.bg} ${c.border}`}>
      <div className="flex items-center gap-3">
        <span className={`text-xs font-black tracking-widest px-3 py-1.5 rounded-lg ${c.badge}`}>
          {c.label}
        </span>
      </div>
      <p className="text-lg font-semibold text-white leading-snug">{analysis.verdict_reason}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Best For</h4>
          <p className="text-sm text-zinc-300">{analysis.best_for}</p>
        </div>
        <div>
          <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Worst For</h4>
          <p className="text-sm text-zinc-300">{analysis.worst_for}</p>
        </div>
      </div>
    </div>
  )
}

function TipsList({ tips }: { tips: string[] }) {
  return (
    <div className="space-y-2">
      {tips.map((tip, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: '#CC0033', color: 'white' }}>
            {i + 1}
          </div>
          <p className="text-sm text-zinc-300">{tip}</p>
        </div>
      ))}
    </div>
  )
}

function TagCloud({ ratings, tagCounts: precomputed }: { ratings: Rating[]; tagCounts?: Record<string, number> | null }) {
  let tagCounts: Record<string, number>
  if (precomputed) {
    tagCounts = precomputed
  } else {
    const counts: Record<string, number> = {}
    for (const r of ratings) {
      for (const tag of r.tags ?? []) {
        if (tag?.trim()) counts[tag.trim()] = (counts[tag.trim()] ?? 0) + 1
      }
    }
    tagCounts = counts
  }
  const sorted = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 15)
  if (sorted.length === 0) return null
  const max = sorted[0][1]

  return (
    <div className="flex flex-wrap gap-2">
      {sorted.map(([tag, count]) => {
        const intensity = count / max
        const alpha = Math.round(0.15 + intensity * 0.25 * 255).toString(16).padStart(2, '0')
        return (
          <span
            key={tag}
            className="text-xs px-3 py-1.5 rounded-full border border-zinc-700 text-zinc-300"
            style={{ backgroundColor: `#CC0033${alpha}`, borderColor: intensity > 0.5 ? '#CC003360' : '#3f3f46' }}
          >
            {tag}
            <span className="ml-1.5 text-zinc-500">{count}</span>
          </span>
        )
      })}
    </div>
  )
}

function RatingCircle({ value, label, pct }: { value: number | string; label: string; pct?: boolean }) {
  const num = typeof value === 'number' ? value : parseFloat(value as string)
  const maxVal = pct ? 100 : 5
  const percent = Math.min((num / maxVal) * 100, 100)
  const color = label === 'Difficulty'
    ? (num >= 4 ? '#ef4444' : num >= 3 ? '#f59e0b' : '#22c55e')
    : pct
      ? (num >= 70 ? '#22c55e' : num >= 50 ? '#f59e0b' : '#ef4444')
      : (num >= 4 ? '#22c55e' : num >= 3 ? '#f59e0b' : '#ef4444')

  const r = 36
  const circumference = 2 * Math.PI * r
  const offset = circumference - (percent / 100) * circumference

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#27272a" strokeWidth="6" />
          <circle cx="44" cy="44" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black text-white">
            {pct ? `${Math.round(num)}%` : num.toFixed(1)}
          </span>
        </div>
      </div>
      <span className="text-xs text-zinc-500 font-medium">{label}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Related professor card
// ---------------------------------------------------------------------------

interface RelatedProfessor {
  rmp_id: string
  slug: string
  first_name: string
  last_name: string
  avg_rating: number | null
  avg_difficulty: number | null
  department: string | null
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function RelatedProfessorCard({ prof }: { prof: RelatedProfessor }) {
  const qColor = ratingColor(prof.avg_rating ?? 0)
  const href = prof.rmp_id
    ? `/professor/${prof.slug}?rmpId=${prof.rmp_id}`
    : `/professor/${prof.slug}`

  return (
    <Link
      href={href}
      className="relative block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-[#CC0033]/40 hover:bg-zinc-800/50 transition-all group"
    >
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />
      <div className="pl-4 pr-4 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white group-hover:text-[#CC0033] transition-colors truncate">
            {prof.first_name} {prof.last_name}
          </p>
          {prof.department && (
            <p className="text-xs text-zinc-500 truncate mt-0.5">{prof.department}</p>
          )}
        </div>
        {prof.avg_rating != null && (
          <div className="shrink-0 text-center">
            <div className="text-lg font-black leading-none" style={{ color: qColor }}>
              {prof.avg_rating.toFixed(1)}
            </div>
            <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
          </div>
        )}
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Native reviews section
// ---------------------------------------------------------------------------

type ReviewSortMode = 'newest' | 'helpful' | 'quality_desc' | 'quality_asc'

const REVIEW_SORT_OPTIONS: { value: ReviewSortMode; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'helpful', label: 'Most Helpful' },
  { value: 'quality_desc', label: 'Best Rating' },
  { value: 'quality_asc', label: 'Worst Rating' },
]

const REVIEWS_PER_PAGE = 10

function NativeReviewsSection({ rmpId, professorId: initProfId }: { rmpId?: string; professorId?: string }) {
  const [professorId, setProfessorId] = useState<string | null>(initProfId ?? null)
  const [reviews, setReviews] = useState<NativeReview[]>([])
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [sort, setSort] = useState<ReviewSortMode>('newest')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [allTagCounts, setAllTagCounts] = useState<[string, number][]>([])
  const [page, setPage] = useState(1)
  const [resolving, setResolving] = useState(!initProfId)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [showForm, setShowForm] = useState(false)

  // Step 1: resolve professor UUID from rmpId if not provided directly
  useEffect(() => {
    if (initProfId) { setProfessorId(initProfId); setResolving(false); return }
    if (!rmpId || !supabase) { setResolving(false); return }

    supabase
      .from('professors')
      .select('id')
      .eq('rmp_id', rmpId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProfessorId(data.id)
        setResolving(false)
      })
  }, [rmpId, initProfId])

  // Step 2: load reviews whenever professorId, sort, activeTag, or page changes
  const loadReviews = useCallback(async (pid: string, s: ReviewSortMode, p: number, append: boolean, tag: string | null) => {
    if (append) setLoadingMore(true); else setLoading(true)
    try {
      const params = new URLSearchParams({
        professor_id: pid,
        sort: s,
        page: String(p),
        limit: String(REVIEWS_PER_PAGE),
      })
      if (tag) params.set('tag', tag)
      const res = await fetch(`/api/reviews?${params}`)
      if (!res.ok) return
      const json = await res.json()
      const incoming: NativeReview[] = json.reviews ?? []
      setReviews(prev => append ? [...prev, ...incoming] : incoming)
      setTotal(json.total ?? 0)
      setHasMore(json.has_more ?? false)
      // Cache tag counts from the first unfiltered page to power filter chips
      if (!tag && !append) {
        const counts: Record<string, number> = {}
        for (const r of incoming) {
          for (const t of r.tags ?? []) {
            if (t) counts[t] = (counts[t] ?? 0) + 1
          }
        }
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8)
        if (sorted.length > 0) setAllTagCounts(sorted)
      }
    } finally {
      if (append) setLoadingMore(false); else setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!professorId) return
    loadReviews(professorId, sort, 1, false, activeTag)
    setPage(1)
  }, [professorId, sort, activeTag, loadReviews])

  function handleLoadMore() {
    if (!professorId || !hasMore || loadingMore) return
    const nextPage = page + 1
    setPage(nextPage)
    loadReviews(professorId, sort, nextPage, true, activeTag)
  }

  function handleTagClick(tag: string) {
    setActiveTag(prev => (prev === tag ? null : tag))
  }

  function handleReviewSubmitted(review: NativeReview) {
    setReviews(prev => [review, ...prev])
    setTotal(t => t + 1)
    setShowForm(false)
  }

  const nativeStats = summarizeNativeReviews(reviews)
  const nativeGrade = buildProfessorGrade({ native: nativeStats })

  if (resolving) return <div className="text-sm text-zinc-600 py-4">Loading reviews...</div>

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          Student Reviews on RU Rate
          {total > 0 && (
            <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-500">
              {total}
            </span>
          )}
        </h3>
        {(rmpId || professorId) && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition-opacity hover:opacity-80"
            style={{ backgroundColor: '#CC0033' }}
          >
            Write a Review
          </button>
        )}
      </div>

      {showForm && (rmpId || professorId) && (
        <WriteReviewForm
          rmpId={rmpId}
          professorId={professorId ?? undefined}
          onSubmitted={handleReviewSubmitted}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading ? (
        <div className="text-sm text-zinc-600 py-4">Loading reviews...</div>
      ) : reviews.length === 0 && !showForm ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
          <div className="text-2xl">📝</div>
          <p className="text-sm font-semibold text-white">Be the first to review on RU Rate!</p>
          <p className="text-xs text-zinc-500">Share your experience to help fellow Rutgers students.</p>
          {(rmpId || professorId) && (
            <button
              onClick={() => setShowForm(true)}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-80"
              style={{ backgroundColor: '#CC0033' }}
            >
              Write a Review
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Grade summary */}
          {reviews.length > 0 && (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <ProfessorGradeBadge grade={nativeGrade} />
                {nativeStats.review_count >= 2 && (
                  <div className="flex items-center gap-4">
                    {nativeStats.avg_quality != null && (
                      <div className="text-center">
                        <div
                          className="text-xl font-black leading-none"
                          style={{ color: nativeStats.avg_quality >= 4 ? '#22c55e' : nativeStats.avg_quality >= 3 ? '#f59e0b' : '#ef4444' }}
                        >
                          {nativeStats.avg_quality.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Quality</div>
                      </div>
                    )}
                    {nativeStats.avg_quality != null && nativeStats.avg_difficulty != null && (
                      <div className="h-7 w-px bg-zinc-800" />
                    )}
                    {nativeStats.avg_difficulty != null && (
                      <div className="text-center">
                        <div
                          className="text-xl font-black leading-none"
                          style={{ color: nativeStats.avg_difficulty >= 4 ? '#ef4444' : nativeStats.avg_difficulty >= 3 ? '#f59e0b' : '#22c55e' }}
                        >
                          {nativeStats.avg_difficulty.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-zinc-500 mt-0.5">Difficulty</div>
                      </div>
                    )}
                    {nativeStats.would_take_again_pct != null && (
                      <>
                        <div className="h-7 w-px bg-zinc-800" />
                        <div className="text-center">
                          <div
                            className="text-xl font-black leading-none"
                            style={{ color: nativeStats.would_take_again_pct >= 70 ? '#22c55e' : nativeStats.would_take_again_pct >= 50 ? '#f59e0b' : '#ef4444' }}
                          >
                            {Math.round(nativeStats.would_take_again_pct)}%
                          </div>
                          <div className="text-[10px] text-zinc-500 mt-0.5">Again</div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <p className="text-xs text-zinc-500">
                Based on RU Rate reviews including quality, difficulty, would-take-again, and reported grades.
              </p>
              <NativeGradeChart reviews={reviews} />
            </div>
          )}

          {/* Sort + tag filter bar */}
          {total > 1 && (
            <div className="space-y-2">
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-hide">
                {REVIEW_SORT_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSort(opt.value)}
                    className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                      sort === opt.value
                        ? 'border-zinc-600 bg-zinc-800 text-white font-semibold'
                        : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {allTagCounts.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                  {activeTag && (
                    <button
                      onClick={() => setActiveTag(null)}
                      className="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-300 hover:text-white transition-all flex items-center gap-1"
                    >
                      ✕ Clear
                    </button>
                  )}
                  {allTagCounts.map(([tag, count]) => (
                    <button
                      key={tag}
                      onClick={() => handleTagClick(tag)}
                      className={`shrink-0 text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        activeTag === tag
                          ? 'border-[#CC0033] bg-[#CC003320] text-[#CC0033] font-semibold'
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      {tag}
                      <span className="ml-1 opacity-50">{count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Reviews list */}
          <AnimatePresence mode="popLayout">
            {reviews.map((r, i) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.18, delay: i < 3 ? i * 0.04 : 0 }}
              >
                <NativeReviewCard review={r} />
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Load more */}
          {hasMore && (
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="w-full py-3 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading…' : `Load more (${total - reviews.length} remaining)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Related professors section
// ---------------------------------------------------------------------------

function RelatedProfessorsSection({ rmpId }: { rmpId: string }) {
  const [related, setRelated] = useState<RelatedProfessor[]>([])
  const [deptName, setDeptName] = useState<string | null>(null)
  const [deptSlug, setDeptSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    async function load() {
      setLoading(true)
      try {
        // Query 1: get this prof's id + primary department in one join
        const { data: prof } = await supabase!
          .from('professors')
          .select('id, professor_departments!inner(department_id, is_primary, departments(id, name, slug))')
          .eq('rmp_id', rmpId)
          .eq('professor_departments.is_primary', true)
          .single()

        if (!prof) { setLoading(false); return }

        const deptJoin = (prof as { professor_departments: unknown }).professor_departments
        const deptRow = Array.isArray(deptJoin) ? deptJoin[0] : deptJoin
        const dept = deptRow
          ? (Array.isArray(deptRow.departments) ? deptRow.departments[0] : deptRow.departments) as { id: string; name: string; slug: string } | null
          : null
        if (!dept) { setLoading(false); return }
        setDeptName(dept.name)
        setDeptSlug(dept.slug)

        // Query 2: get related profs with ratings via embedded join
        const { data: relatedRows } = await supabase!
          .from('professor_departments')
          .select('professors!inner(id, rmp_id, slug, first_name, last_name, professor_cache(avg_rating, avg_difficulty, department))')
          .eq('department_id', dept.id)
          .neq('professor_id', prof.id)
          .limit(20)

        const result: RelatedProfessor[] = (relatedRows ?? [])
          .map((row: unknown) => {
            const r = row as { professors: unknown }
            const p = Array.isArray(r.professors) ? r.professors[0] : r.professors
            if (!p) return null
            const cache = Array.isArray(p.professor_cache) ? p.professor_cache[0] : p.professor_cache
            return {
              rmp_id: p.rmp_id as string,
              slug: p.slug as string,
              first_name: p.first_name as string,
              last_name: p.last_name as string,
              avg_rating: cache?.avg_rating != null ? Number(cache.avg_rating) : null,
              avg_difficulty: cache?.avg_difficulty != null ? Number(cache.avg_difficulty) : null,
              department: (cache?.department as string | null) ?? null,
            } satisfies RelatedProfessor
          })
          .filter((p): p is RelatedProfessor => p !== null)
          .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
          .slice(0, 4)

        setRelated(result)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [rmpId])

  if (loading || related.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          Other professors in {deptName ?? 'this department'}
        </h3>
        {deptSlug && (
          <Link
            href={`/department/${deptSlug}`}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            View department →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {related.map((p) => (
          <RelatedProfessorCard key={p.rmp_id} prof={p} />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Teaching history (3A)
// ---------------------------------------------------------------------------

interface TeachingRow {
  section_number: string | null
  index_number: string | null
  meeting_days: string | null
  meeting_times: string | null
  campus: string | null
  location: string | null
  open_status: boolean | null
  courses: { id: string; course_number: string; name: string; slug: string } | null
  semesters: { id: string; name: string; is_current: boolean } | null
}

interface SemesterCourse {
  course_id: string
  course_number: string
  course_name: string
  course_slug: string
  sections: {
    section_number: string | null
    index_number: string | null
    meeting_days: string | null
    meeting_times: string | null
    campus: string | null
    location: string | null
    open_status: boolean | null
  }[]
}

interface SemesterGroup {
  semester_id: string
  semester_name: string
  is_current: boolean
  courses: SemesterCourse[]
}

function TeachingHistorySection({ professorId }: { professorId: string }) {
  const [semesters, setSemesters] = useState<SemesterGroup[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    async function load() {
      const { data } = await supabase!
        .from('teaching_assignments')
        .select('section_number, index_number, meeting_days, meeting_times, campus, location, open_status, courses(id, course_number, name, slug), semesters(id, name, is_current)')
        .eq('professor_id', professorId)
        .eq('status', 'active')

      if (!data) { setLoading(false); return }

      const semMap = new Map<string, SemesterGroup>()
      for (const r of data as unknown as TeachingRow[]) {
        const sem = r.semesters
        const course = r.courses
        if (!sem || !course) continue

        if (!semMap.has(sem.id)) {
          semMap.set(sem.id, { semester_id: sem.id, semester_name: sem.name, is_current: sem.is_current, courses: [] })
        }
        const sg = semMap.get(sem.id)!
        let sc = sg.courses.find(c => c.course_id === course.id)
        if (!sc) {
          sc = {
            course_id: course.id,
            course_number: course.course_number,
            course_name: course.name,
            course_slug: course.slug,
            sections: [],
          }
          sg.courses.push(sc)
        }
        sc.sections.push({
          section_number: r.section_number,
          index_number: r.index_number,
          meeting_days: r.meeting_days,
          meeting_times: r.meeting_times,
          campus: r.campus,
          location: r.location,
          open_status: r.open_status,
        })
      }

      setSemesters(Array.from(semMap.values()).sort((a, b) => b.semester_name.localeCompare(a.semester_name)))
      setLoading(false)
    }
    load()
  }, [professorId])

  if (loading) return <div className="text-sm text-zinc-600 py-2">Loading teaching history...</div>
  if (semesters.length === 0) return null

  // Unique courses across all semesters for quick links
  const courseMap = new Map<string, SemesterCourse>()
  for (const sem of semesters) {
    for (const c of sem.courses) {
      if (!courseMap.has(c.course_id)) courseMap.set(c.course_id, c)
    }
  }
  const allCourses = Array.from(courseMap.values()).sort((a, b) =>
    a.course_number.localeCompare(b.course_number)
  )

  return (
    <div className="space-y-6">
      {/* Courses taught quick links */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Courses Taught</h3>
          <Badge tone="scarlet">Rutgers SOC</Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {allCourses.map(c => (
            <Link
              key={c.course_id}
              href={`/course/${c.course_slug}`}
              className="group bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 hover:border-[#CC0033]/50 transition-all"
            >
              <span className="font-mono text-xs text-zinc-500 group-hover:text-[#ff4d6d] transition-colors">
                {c.course_number}
              </span>
              <span className="ml-2 text-sm text-zinc-300 group-hover:text-white transition-colors">
                {c.course_name}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Per-semester detail */}
      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Teaching History</h3>
        {semesters.map(sem => (
          <div key={sem.semester_id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-white text-sm">{sem.semester_name}</span>
              {sem.is_current && <Badge tone="green">CURRENT</Badge>}
            </div>
            <div className="divide-y divide-zinc-800/60">
              {sem.courses.map(course => (
                <div key={course.course_id} className="py-2.5 first:pt-0 last:pb-0">
                  <Link href={`/course/${course.course_slug}`} className="text-sm text-zinc-300 hover:text-[#ff4d6d] transition-colors">
                    <span className="font-mono text-xs text-zinc-500 mr-2">{course.course_number}</span>
                    {course.course_name}
                  </Link>
                  <div className="mt-1.5 space-y-1">
                    {course.sections.map((s, i) => (
                      <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500">
                        <span className="text-zinc-400">Sec {s.section_number ?? '—'}</span>
                        {s.index_number && <span className="font-mono">idx {s.index_number}</span>}
                        {(s.meeting_days || s.meeting_times) && (
                          <span>{[s.meeting_days, s.meeting_times].filter(Boolean).join(' ')}</span>
                        )}
                        {(s.campus || s.location) && (
                          <span className="text-zinc-600">{[s.campus, s.location].filter(Boolean).join(' · ')}</span>
                        )}
                        {s.open_status === true && sem.is_current && <Badge tone="green">OPEN</Badge>}
                        {s.open_status === false && sem.is_current && <Badge tone="red">CLOSED</Badge>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Resolves the SOC professors.id for an RMP professor so SOC-backed sections render on RMP profiles too. */
function SocDataForRmpProfessor({ rmpId }: { rmpId: string }) {
  const [professorId, setProfessorId] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    async function load() {
      const { data } = await supabase!
        .from('professors')
        .select('id')
        .eq('rmp_id', rmpId)
        .maybeSingle()
      if (!cancelled && data) setProfessorId(data.id)
    }
    load()
    return () => { cancelled = true }
  }, [rmpId])

  if (!professorId) return null
  return <TeachingHistorySection professorId={professorId} />
}

// ---------------------------------------------------------------------------
// Related professors — SOC-aware (3B helper)
// ---------------------------------------------------------------------------

interface SocRelatedProf {
  id: string
  rmp_id: string | null
  slug: string
  first_name: string
  last_name: string
  avg_rating: number | null
}

function SocRelatedSection({ professorId }: { professorId: string }) {
  const [related, setRelated] = useState<SocRelatedProf[]>([])
  const [deptName, setDeptName] = useState<string | null>(null)
  const [deptSlug, setDeptSlug] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }

    async function load() {
      const { data: deptRows } = await supabase!
        .from('professor_departments')
        .select('department_id, departments(id, name, slug)')
        .eq('professor_id', professorId)
        .order('is_primary', { ascending: false })
        .limit(1)

      if (!deptRows?.length) { setLoading(false); return }
      const dept = deptRows[0].departments as unknown as { id: string; name: string; slug: string } | null
      if (!dept) { setLoading(false); return }
      setDeptName(dept.name)
      setDeptSlug(dept.slug)

      const { data: others } = await supabase!
        .from('professor_departments')
        .select('professor_id')
        .eq('department_id', dept.id)
        .neq('professor_id', professorId)
        .limit(20)

      if (!others?.length) { setLoading(false); return }

      const { data: profs } = await supabase!
        .from('professors')
        .select('id, rmp_id, slug, first_name, last_name, cache_id')
        .in('id', others.map((r: { professor_id: string }) => r.professor_id))
        .limit(8)

      if (!profs?.length) { setLoading(false); return }

      const cacheIds = profs
        .filter((p: { cache_id: string | null }) => p.cache_id)
        .map((p: { cache_id: string | null }) => p.cache_id as string)

      const cacheMap: Record<string, number> = {}
      if (cacheIds.length > 0) {
        const { data: caches } = await supabase!
          .from('professor_cache')
          .select('id, avg_rating')
          .in('id', cacheIds)
        for (const c of caches ?? []) cacheMap[c.id] = c.avg_rating
      }

      setRelated(
        (profs as { id: string; rmp_id: string | null; slug: string; first_name: string; last_name: string; cache_id: string | null }[])
          .map(p => ({
            id: p.id,
            rmp_id: p.rmp_id,
            slug: p.slug,
            first_name: p.first_name,
            last_name: p.last_name,
            avg_rating: p.cache_id ? (cacheMap[p.cache_id] ?? null) : null,
          }))
          .sort((a, b) => (b.avg_rating ?? 0) - (a.avg_rating ?? 0))
          .slice(0, 4)
      )
      setLoading(false)
    }
    load()
  }, [professorId])

  if (loading || related.length === 0) return null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-zinc-300">
          Other professors in {deptName ?? 'this department'}
        </h3>
        {deptSlug && (
          <Link
            href={`/department/${deptSlug}`}
            className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors shrink-0"
          >
            View department →
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {related.map(p => {
          const qColor = p.avg_rating != null ? ratingColor(p.avg_rating) : '#52525b'
          return (
            <Link
              key={p.id}
              href={p.rmp_id ? `/professor/${p.slug}?rmpId=${p.rmp_id}` : `/professor/${p.slug}?socId=${p.id}`}
              className="relative block bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-[#CC0033]/40 hover:bg-zinc-800/50 transition-all group"
            >
              <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: qColor }} />
              <div className="pl-4 pr-4 py-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white group-hover:text-[#CC0033] transition-colors truncate min-w-0">
                  {p.first_name} {p.last_name}
                </p>
                {p.avg_rating != null && (
                  <div className="shrink-0 text-center">
                    <div className="text-lg font-black leading-none" style={{ color: qColor }}>{p.avg_rating.toFixed(1)}</div>
                    <div className="text-[10px] text-zinc-600 mt-0.5">Quality</div>
                  </div>
                )}
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SOC professor profile (3B)
// ---------------------------------------------------------------------------

function SocProfessorContent({ socId }: { socId: string }) {
  const [prof, setProf] = useState<{ first_name: string; last_name: string; department: string | null; teaching_count: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) { setError('Database unavailable'); setLoading(false); return }

    async function load() {
      setLoading(true)
      try {
        const { data: profRow, error: profErr } = await supabase!
          .from('professors')
          .select('first_name, last_name, professor_departments(is_primary, departments(name))')
          .eq('id', socId)
          .single()

        if (profErr || !profRow) { setError('Professor not found'); return }

        const depts = profRow.professor_departments as unknown as { is_primary: boolean; departments: { name: string }[] | null }[]
        const primary = depts?.find(d => d.is_primary) ?? depts?.[0]
        const deptName = primary?.departments?.[0]?.name ?? null

        const { count } = await supabase!
          .from('teaching_assignments')
          .select('id', { count: 'exact', head: true })
          .eq('professor_id', socId)

        setProf({ first_name: profRow.first_name, last_name: profRow.last_name, department: deptName, teaching_count: count ?? 0 })
        document.title = `${profRow.first_name} ${profRow.last_name} | RU Rate`
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [socId])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold">Loading professor...</p>
          <p className="text-zinc-500 text-sm mt-1">Fetching professor data</p>
        </div>
      </div>
    )
  }

  if (error || !prof) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-5xl">😬</div>
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="text-zinc-500 text-sm">{error ?? 'Professor not found'}</p>
        <Link href="/" className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#CC0033' }}>
          ← Back to Search
        </Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 pb-28">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8">
          {prof.department && (
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{prof.department}</div>
          )}
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            {prof.first_name} {prof.last_name}
          </h1>
          <p className="text-zinc-400 mt-2">Rutgers University - New Brunswick</p>
          {prof.teaching_count > 0 && (
            <p className="text-sm text-zinc-600 mt-1">{prof.teaching_count} course sections on record</p>
          )}
          <div className="mt-3">
            <Badge tone="scarlet">Rutgers SOC data</Badge>
          </div>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center gap-3">
            <span className="text-xl">📋</span>
            <div>
              <p className="font-semibold text-white text-sm">No RMP data yet</p>
              <p className="text-xs text-zinc-500 mt-0.5">
                This professor was found in Rutgers course listings but hasn&apos;t been linked to RateMyProfessors.
              </p>
            </div>
          </div>
        </div>

        <TeachingHistorySection professorId={socId} />

        <NativeReviewsSection professorId={socId} />

        <SocRelatedSection professorId={socId} />
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  )
}

function ProfessorContent() {
  const searchParams = useSearchParams()
  const rmpId = searchParams.get('rmpId')
  const [data, setData] = useState<ProfessorCache | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllReviews, setShowAllReviews] = useState(false)
  const [rmpSort, setRmpSort] = useState<'newest' | 'helpful' | 'quality_desc' | 'quality_asc'>('newest')
  const [staleInfo, setStaleInfo] = useState<{ isStale: boolean; cacheAgeDays: number } | null>(null)

  const loadData = useCallback(async (force = false) => {
    if (!rmpId) { setError('No professor ID provided.'); setLoading(false); return }
    if (force) setRefreshing(true); else setLoading(true)
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rmpId, force }),
      })
      if (!res.ok) throw new Error('Failed to load professor data')
      const json = await res.json()
      setData(json)
      document.title = `${json.first_name} ${json.last_name} | RU Rate`
      if (json.cached_at) {
        const ageMs = Date.now() - new Date(json.cached_at).getTime()
        const days = Math.floor(ageMs / (24 * 60 * 60 * 1000))
        setStaleInfo({ isStale: days >= 30, cacheAgeDays: days })
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [rmpId])

  useEffect(() => { loadData() }, [loadData])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
          <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
        </div>
        <div className="text-center">
          <p className="text-white font-semibold">Analyzing professor...</p>
          <p className="text-zinc-500 text-sm mt-1">Fetching reviews & running AI analysis</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-6">
        <div className="text-5xl">😬</div>
        <h1 className="text-xl font-bold text-white">Something went wrong</h1>
        <p className="text-zinc-500 text-sm">{error ?? 'Professor not found'}</p>
        <Link href="/" className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: '#CC0033' }}>
          ← Back to Search
        </Link>
      </div>
    )
  }

  const analysis = data.ai_analysis
  const ratings = (data.ratings ?? []) as Rating[]
  const tagCounts = data.tag_counts ?? null

  const sortedRatings = [...ratings].sort((a, b) => {
    if (rmpSort === 'helpful') return (b.thumbsUpTotal ?? 0) - (a.thumbsUpTotal ?? 0)
    if (rmpSort === 'quality_desc') return (b.qualityRating ?? 0) - (a.qualityRating ?? 0)
    if (rmpSort === 'quality_asc') return (a.qualityRating ?? 0) - (b.qualityRating ?? 0)
    return new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
  })
  const visibleReviews = showAllReviews ? sortedRatings : sortedRatings.slice(0, 8)
return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8 pb-28">
        {/* Hero block */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8"
        >
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">{data.department}</div>
              <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
                {data.first_name} {data.last_name}
              </h1>
              <p className="text-zinc-400 mt-2">{data.school_name}</p>
              <p className="text-sm text-zinc-600 mt-1">{data.num_ratings} student ratings</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge>RateMyProfessors data</Badge>
                {rmpId && (
                  <CompareButton
                    rmpId={rmpId}
                    slug={data.slug}
                    name={`${data.first_name} ${data.last_name}`}
                    department={data.department}
                  />
                )}
              </div>
            </div>

            {data.num_ratings > 0 ? (
              <div className="flex gap-6 shrink-0">
                <RatingCircle value={data.avg_rating ?? 0} label="Quality" />
                <RatingCircle value={data.avg_difficulty ?? 0} label="Difficulty" />
                {data.would_take_again != null && (
                  <RatingCircle value={data.would_take_again} label="Again" pct />
                )}
              </div>
            ) : (
              <div className="shrink-0 flex items-center justify-center bg-zinc-800/50 border border-zinc-700 rounded-xl px-6 py-4 text-center">
                <div>
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">RMP Rating</div>
                  <div className="text-sm text-zinc-400 mt-1">No ratings yet</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* Stale cache notice */}
        {staleInfo?.isStale && (
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-amber-950/30 border border-amber-900/50 text-xs text-amber-400">
            <span>⚠</span>
            <span className="flex-1">RMP data last refreshed {staleInfo.cacheAgeDays} days ago — ratings may be outdated.</span>
            <button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="shrink-0 px-2.5 py-1 rounded-lg bg-amber-900/40 hover:bg-amber-900/70 transition-colors font-semibold disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh now'}
            </button>
          </div>
        )}

        {/* Verdict */}
        {analysis && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.08 }}>
            <VerdictBox analysis={analysis} />
          </motion.div>
        )}

        {/* Analysis grid */}
        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: 'Teaching Style', content: analysis.teaching_style },
              { title: 'Workload', content: analysis.workload },
              { title: 'Grading', content: analysis.grading },
            ].map(({ title, content }, i) => (
              <motion.div
                key={title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: 0.12 + i * 0.05 }}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-5"
              >
                <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">{title}</h3>
                <p className="text-sm text-zinc-300 leading-relaxed">{content}</p>
              </motion.div>
            ))}
          </div>
        )}

        {/* Praise / Complaints */}
        {analysis && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> Common Praise
              </h3>
              <ul className="space-y-2">
                {(analysis.common_praise ?? []).map((item, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex gap-2">
                    <span className="text-green-600 mt-0.5 shrink-0">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <h3 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> Common Complaints
              </h3>
              <ul className="space-y-2">
                {(analysis.common_complaints ?? []).map((item, i) => (
                  <li key={i} className="text-sm text-zinc-300 flex gap-2">
                    <span className="text-red-600 mt-0.5 shrink-0">−</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Tips */}
        {analysis?.tips && analysis.tips.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-zinc-300 mb-4 flex items-center gap-2">
              <span style={{ color: '#CC0033' }}>★</span> Student Tips
            </h3>
            <TipsList tips={analysis.tips} />
          </div>
        )}

        {/* Tag cloud */}
        {ratings.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-4">Common Tags</h3>
            <TagCloud ratings={ratings} tagCounts={tagCounts} />
          </div>
        )}

        {/* Grade distribution */}
        {ratings.length > 0 && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <GradeChart ratings={ratings} />
          </div>
        )}

        {/* Teaching history + courses taught (Rutgers SOC) */}
        {rmpId && <SocDataForRmpProfessor rmpId={rmpId} />}

        {/* Native reviews (RU Rate) — above RMP reviews */}
        {rmpId && <NativeReviewsSection rmpId={rmpId} />}

        {/* RMP Reviews */}
        {ratings.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-zinc-300">
                RateMyProfessors Reviews
                <span className="ml-2 text-zinc-600 font-normal">({ratings.length})</span>
              </h3>
              {ratings.length > 1 && (
                <div className="flex items-center gap-1">
                  {([
                    { value: 'newest', label: 'Newest' },
                    { value: 'helpful', label: 'Helpful' },
                    { value: 'quality_desc', label: 'Best' },
                    { value: 'quality_asc', label: 'Worst' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setRmpSort(opt.value)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        rmpSort === opt.value
                          ? 'border-zinc-600 bg-zinc-800 text-white font-semibold'
                          : 'border-zinc-800 text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-3">
              {visibleReviews.map((r) => (
                <ReviewCard key={r.id} rating={r} />
              ))}
            </div>
            {ratings.length > 8 && !showAllReviews && (
              <button
                onClick={() => setShowAllReviews(true)}
                className="mt-4 w-full py-3 rounded-xl border border-zinc-800 text-sm text-zinc-400 hover:text-white hover:border-zinc-600 transition-colors"
              >
                Show all {ratings.length} reviews
              </button>
            )}
          </div>
        )}

        {/* Related professors */}
        {rmpId && <RelatedProfessorsSection rmpId={rmpId} />}
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  )
}

function ProfessorRouter() {
  const searchParams = useSearchParams()
  const socId = searchParams.get('socId')
  if (socId) return <SocProfessorContent socId={socId} />
  return <ProfessorContent />
}

function PageLoading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-[#0a0a0a]">
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
      </div>
      <div className="text-center">
        <p className="text-white font-semibold">Loading...</p>
        <p className="text-zinc-500 text-sm mt-1">Fetching professor data</p>
      </div>
    </div>
  )
}

export default function ProfessorPage({ params }: { params: Promise<{ slug: string }> }) {
  void use(params)
  return (
    <Suspense fallback={<PageLoading />}>
      <ProfessorRouter />
    </Suspense>
  )
}
