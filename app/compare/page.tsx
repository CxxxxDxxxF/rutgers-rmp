'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import { SkeletonBlock } from '@/components/LoadingSkeleton'
import ProfessorGradeBadge from '@/components/ProfessorGradeBadge'
import { useCompareItems, removeCompareItem } from '@/lib/compare'
import type { AIAnalysis } from '@/lib/supabase'
import type { ProfessorGrade } from '@/lib/professor-grade'

interface CompareProfessor {
  rmp_id: string
  slug: string
  first_name: string
  last_name: string
  department: string | null
  avg_rating: number | null
  avg_difficulty: number | null
  would_take_again: number | null
  num_ratings: number
  ai_analysis: AIAnalysis | null
  student_grade: ProfessorGrade | null
  courses: { course_number: string; name: string; slug: string }[]
}

const VERDICT_CONFIG: Record<string, { tone: 'green' | 'red' | 'amber'; label: string }> = {
  take: { tone: 'green', label: 'TAKE' },
  avoid: { tone: 'red', label: 'AVOID' },
  depends: { tone: 'amber', label: 'DEPENDS' },
}

function ratingColor(r: number) {
  if (r >= 4) return '#22c55e'
  if (r >= 3) return '#f59e0b'
  return '#ef4444'
}

function ShareCompareButton({ ids }: { ids: string[] }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    const url = `${window.location.origin}/compare?ids=${encodeURIComponent(ids.join(','))}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard blocked
    }
  }, [ids])

  return (
    <button
      onClick={handleCopy}
      className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
        copied
          ? 'border-green-800 bg-green-950/30 text-green-400'
          : 'text-zinc-400 hover:border-zinc-500 hover:text-white border-[var(--border)] bg-[var(--card)]'
      }`}
    >
      {copied ? '✓ Copied' : '↗ Share link'}
    </button>
  )
}

function CompareContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const trayItems = useCompareItems()

  useEffect(() => {
    document.title = 'Compare Professors | RU Rate'
    return () => { document.title = 'RU Rate — Rutgers Registration Command Center' }
  }, [])

  // URL ids win (shareable links); otherwise use the tray
  const urlIds = useMemo(
    () => searchParams.get('ids')?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
    [searchParams]
  )
  const isUrlMode = urlIds.length > 0

  const ids = useMemo(() => {
    if (isUrlMode) return urlIds.slice(0, 4)
    return trayItems.map(i => i.rmpId)
  }, [isUrlMode, urlIds, trayItems])

  const [professors, setProfessors] = useState<CompareProfessor[]>([])
  const [missing, setMissing] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ids.length === 0) {
      setProfessors([])
      setMissing([])
      setLoading(false)
      return
    }
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/compare?ids=${encodeURIComponent(ids.join(','))}`)
        if (!res.ok) throw new Error('Failed to load comparison')
        const json = await res.json()
        if (cancelled) return
        setProfessors(Array.isArray(json.professors) ? json.professors : [])
        setMissing(Array.isArray(json.missing) ? json.missing : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Something went wrong')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [ids])

  const handleRemove = useCallback((rmpId: string) => {
    if (isUrlMode) {
      const next = ids.filter(id => id !== rmpId)
      if (next.length === 0) {
        router.push('/compare')
      } else {
        router.push(`/compare?ids=${encodeURIComponent(next.join(','))}`)
      }
    } else {
      removeCompareItem(rmpId)
    }
  }, [isUrlMode, ids, router])

  // Best-value highlighting
  const bestRating = Math.max(...professors.map(p => p.avg_rating ?? -1))
  const bestDifficulty = Math.min(...professors.map(p => p.avg_difficulty ?? 99))
  const bestWta = Math.max(...professors.map(p => p.would_take_again ?? -1))
  const bestGrade = Math.max(...professors.map(p => p.student_grade?.score ?? -1))

  // Courses taught by every professor being compared
  const commonCourses = useMemo(() => {
    if (professors.length < 2) return []
    return professors[0].courses.filter(c =>
      professors.slice(1).every(p => p.courses.some(pc => pc.slug === c.slug))
    )
  }, [professors])

  const missingFromTray = missing
    .map(id => trayItems.find(t => t.rmpId === id))
    .filter(Boolean)

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 pb-28">
        <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-black text-white tracking-tight">Compare Professors</h1>
            <p className="text-zinc-400 text-sm mt-1">
              Side-by-side RMP stats and AI analysis — pick the right professor for your section
            </p>
          </div>
          {professors.length > 0 && (
            <ShareCompareButton ids={ids} />
          )}
        </div>

        {loading && (
          <div className="space-y-3">
            <SkeletonBlock className="h-24 w-full" />
            <SkeletonBlock className="h-64 w-full" />
          </div>
        )}

        {!loading && error && (
          <EmptyState icon="⚠️" title={error} subtitle="Comparison data could not be loaded." />
        )}

        {!loading && !error && ids.length === 0 && (
          <EmptyState
            icon="⚖️"
            title="Nothing to compare yet"
            subtitle="Add professors with the “+ Compare” button on any professor or course page (2–4 at a time)."
            action={
              <Link
                href="/courses"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ backgroundColor: '#CC0033' }}
              >
                Browse Courses
              </Link>
            }
          />
        )}

        {!loading && !error && ids.length > 0 && professors.length === 0 && (
          <EmptyState
            icon="🔍"
            title="No analyzed data for these professors yet"
            subtitle="Open each professor's profile once — that runs the RMP + AI analysis and caches it for comparison."
          />
        )}

        {!loading && !error && professors.length > 0 && (
          <>
            {missing.length > 0 && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-900/50 text-xs text-amber-400">
                {missingFromTray.length > 0 ? (
                  <>
                    Not yet analyzed (open their profile once to include them):{' '}
                    {missingFromTray.map((t, i) => (
                      <span key={t!.rmpId}>
                        {i > 0 && ', '}
                        <Link href={`/professor/${t!.slug}?rmpId=${t!.rmpId}`} className="underline hover:text-amber-300">
                          {t!.name}
                        </Link>
                      </span>
                    ))}
                  </>
                ) : (
                  <>
                    {missing.length} professor{missing.length > 1 ? 's' : ''} not yet analyzed — open their profile once to include them in this comparison.
                  </>
                )}
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--border)' }}>
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr style={{ background: 'var(--card)' }}>
                    <th className="text-left px-4 py-4 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold w-36 sm:w-44">
                      Professor
                    </th>
                    {professors.map(p => (
                      <th key={p.rmp_id} className="px-4 py-4 text-left align-top">
                        <Link
                          href={`/professor/${p.slug}?rmpId=${p.rmp_id}`}
                          className="font-bold text-white hover:text-[#ff4d6d] transition-colors leading-tight block"
                        >
                          {p.first_name} {p.last_name}
                        </Link>
                        {p.department && (
                          <div className="text-xs text-zinc-500 font-normal mt-0.5">{p.department}</div>
                        )}
                        <button
                          onClick={() => handleRemove(p.rmp_id)}
                          className="mt-1.5 text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors font-normal"
                        >
                          Remove
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(255,255,255,0.07)]">
                  <Row label="Rating">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3">
                        {p.avg_rating != null ? (
                          <span
                            className="text-lg font-black"
                            style={{ color: ratingColor(p.avg_rating) }}
                          >
                            {p.avg_rating.toFixed(1)}
                            {p.avg_rating === bestRating && professors.length > 1 && (
                              <span className="ml-1.5 text-[10px] align-middle text-green-500">BEST</span>
                            )}
                          </span>
                        ) : '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="Teacher grade">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3">
                        {p.student_grade ? (
                          <div className="flex items-center gap-2">
                            <ProfessorGradeBadge grade={p.student_grade} compact />
                            {p.student_grade.score === bestGrade && professors.length > 1 && (
                              <span className="text-[10px] text-green-500">BEST</span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="Difficulty">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-200">
                        {p.avg_difficulty != null ? (
                          <>
                            {p.avg_difficulty.toFixed(1)}
                            {p.avg_difficulty === bestDifficulty && professors.length > 1 && (
                              <span className="ml-1.5 text-[10px] text-green-500">EASIEST</span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="Would take again">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-200">
                        {p.would_take_again != null && p.would_take_again >= 0 ? (
                          <>
                            {Math.round(p.would_take_again)}%
                            {p.would_take_again === bestWta && professors.length > 1 && (
                              <span className="ml-1.5 text-[10px] text-green-500">BEST</span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="# Ratings">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-200">{p.num_ratings}</td>
                    ))}
                  </Row>
                  <Row label="AI Verdict">
                    {professors.map(p => {
                      const vc = p.ai_analysis ? VERDICT_CONFIG[p.ai_analysis.verdict] : null
                      return (
                        <td key={p.rmp_id} className="px-4 py-3">
                          {vc ? <Badge tone={vc.tone}>{vc.label}</Badge> : '—'}
                        </td>
                      )
                    })}
                  </Row>
                  <Row label="Best for">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-300 text-xs leading-relaxed">
                        {p.ai_analysis?.best_for ?? '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="Worst for">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-300 text-xs leading-relaxed">
                        {p.ai_analysis?.worst_for ?? '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="Workload">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-300 text-xs leading-relaxed">
                        {p.ai_analysis?.workload ?? '—'}
                      </td>
                    ))}
                  </Row>
                  <Row label="Grading">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3 text-zinc-300 text-xs leading-relaxed">
                        {p.ai_analysis?.grading ?? '—'}
                      </td>
                    ))}
                  </Row>
                  {commonCourses.length > 0 && (
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold whitespace-nowrap align-top">
                        Taught by all
                      </td>
                      <td colSpan={professors.length} className="px-4 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {commonCourses.map(c => (
                            <Link
                              key={c.slug}
                              href={`/course/${c.slug}`}
                              title={c.name}
                              className="text-[11px] font-mono px-1.5 py-0.5 rounded border bg-[#CC0033]/10 border-[#CC0033]/40 text-[#ff4d6d] hover:bg-[#CC0033]/20 transition-colors"
                            >
                              {c.course_number}
                            </Link>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  <Row label="Courses taught">
                    {professors.map(p => (
                      <td key={p.rmp_id} className="px-4 py-3">
                        {p.courses.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {p.courses.map(c => (
                              <Link
                                key={c.slug}
                                href={`/course/${c.slug}`}
                                title={c.name}
                                className={`text-[11px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                                  commonCourses.some(cc => cc.slug === c.slug)
                                    ? 'bg-[#CC0033]/10 border-[#CC0033]/40 text-[#ff4d6d] hover:bg-[#CC0033]/20'
                                    : 'text-zinc-300 bg-[var(--card)] border-[var(--border)] hover:border-[#CC0033]/60 hover:text-white'
                                }`}
                              >
                                {c.course_number}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <span className="text-zinc-600 text-xs">No SOC data</span>
                        )}
                      </td>
                    ))}
                  </Row>
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-[11px] text-zinc-600">
              Ratings and analysis from RateMyProfessors reviews (AI-summarized). Courses taught from the
              Rutgers Schedule of Classes.
            </p>
          </>
        )}
      </main>

      <footer className="border-t px-6 py-6 mt-10" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Compare Rutgers Professors
        </div>
      </footer>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr style={{ background: 'rgba(20,15,17,0.4)' }}>
      <td className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold align-top">
        {label}
      </td>
      {children}
    </tr>
  )
}

function PageLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-[var(--border)]" />
        <div className="absolute inset-0 rounded-full border-4 border-t-[#CC0033] animate-spin" />
      </div>
    </div>
  )
}

export default function ComparePage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <CompareContent />
    </Suspense>
  )
}
