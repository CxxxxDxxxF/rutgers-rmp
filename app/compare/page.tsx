'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import AppHeader from '@/components/AppHeader'
import Badge from '@/components/Badge'
import EmptyState from '@/components/EmptyState'
import { SkeletonBlock } from '@/components/LoadingSkeleton'
import { useCompareItems, removeCompareItem } from '@/lib/compare'
import type { AIAnalysis } from '@/lib/supabase'

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

function CompareContent() {
  const searchParams = useSearchParams()
  const trayItems = useCompareItems()

  // URL ids win (shareable links); otherwise use the tray
  const ids = useMemo(() => {
    const fromUrl = searchParams.get('ids')?.split(',').map(s => s.trim()).filter(Boolean) ?? []
    if (fromUrl.length > 0) return fromUrl.slice(0, 4)
    return trayItems.map(i => i.rmpId)
  }, [searchParams, trayItems])

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

  // Best-value highlighting
  const bestRating = Math.max(...professors.map(p => p.avg_rating ?? -1))
  const bestDifficulty = Math.min(...professors.map(p => p.avg_difficulty ?? 99))
  const bestWta = Math.max(...professors.map(p => p.would_take_again ?? -1))

  const missingFromTray = missing
    .map(id => trayItems.find(t => t.rmpId === id))
    .filter(Boolean)

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <AppHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 pb-28">
        <div className="mb-8">
          <h1 className="text-3xl font-black text-white tracking-tight">Compare Professors</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Side-by-side RMP stats and AI analysis — pick the right professor for your section
          </p>
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
            {missingFromTray.length > 0 && (
              <div className="mb-4 px-4 py-3 rounded-xl bg-amber-950/30 border border-amber-900/50 text-xs text-amber-400">
                Not yet analyzed (open their profile once to include them):{' '}
                {missingFromTray.map((t, i) => (
                  <span key={t!.rmpId}>
                    {i > 0 && ', '}
                    <Link href={`/professor/${t!.slug}?rmpId=${t!.rmpId}`} className="underline hover:text-amber-300">
                      {t!.name}
                    </Link>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-x-auto rounded-2xl border border-zinc-800">
              <table className="w-full text-sm min-w-[640px]">
                <thead>
                  <tr className="bg-zinc-900">
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
                          onClick={() => removeCompareItem(p.rmp_id)}
                          className="mt-1.5 text-[11px] text-zinc-600 hover:text-zinc-300 transition-colors font-normal"
                        >
                          Remove
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/70">
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
                                className="text-[11px] font-mono px-1.5 py-0.5 rounded border bg-zinc-800 border-zinc-700 text-zinc-300 hover:border-[#CC0033]/60 hover:text-white transition-colors"
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

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto text-xs text-zinc-700 text-center">
          RU Rate — Compare Rutgers Professors
        </div>
      </footer>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr className="bg-zinc-900/40">
      <td className="px-4 py-3 text-[11px] uppercase tracking-wider text-zinc-500 font-semibold align-top">
        {label}
      </td>
      {children}
    </tr>
  )
}

function PageLoading() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-4 border-zinc-800" />
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
