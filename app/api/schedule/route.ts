import { NextRequest, NextResponse } from 'next/server'
import { makeSlug } from '@/lib/rmp'
import { lookupProfessorCandidates } from '@/lib/rmp/matching'
import { supabase } from '@/lib/supabase'
import type { AIAnalysis } from '@/lib/supabase'
import {
  buildProfessorGrade,
  summarizeNativeReviews,
  type NativeReviewStats,
  type ProfessorGrade,
} from '@/lib/professor-grade'

export const maxDuration = 60

export interface ScheduleProfResult {
  searchedName: string
  id: string
  firstName: string
  lastName: string
  department: string
  avgRating: number
  avgDifficulty: number
  wouldTakeAgainPercent: number | null
  numRatings: number
  slug: string
  ai_analysis: AIAnalysis | null
  student_grade: ProfessorGrade | null
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const names: string[] = body.names ?? []

  if (!Array.isArray(names) || !names.length) {
    return NextResponse.json({ error: 'names array required' }, { status: 400 })
  }

  const unique = [...new Set(
    names.slice(0, 12).map((n: string) => n.trim()).filter(Boolean)
  )]

  const settled = await Promise.allSettled(
    unique.map(async (name): Promise<ScheduleProfResult | null> => {
      try {
        const candidates = await lookupProfessorCandidates(name)
        const top = candidates.find(c => c.matchLevel !== 'weak_candidate')
        if (!top) return null
        const prof = top.professor
        return {
          searchedName: name,
          id: prof.id,
          firstName: prof.firstName,
          lastName: prof.lastName,
          department: prof.department ?? 'Unknown Department',
          avgRating: prof.avgRating ?? 0,
          avgDifficulty: prof.avgDifficulty ?? 0,
          wouldTakeAgainPercent: prof.wouldTakeAgainPercent,
          numRatings: prof.numRatings ?? 0,
          slug: makeSlug(prof.firstName, prof.lastName, prof.id),
          ai_analysis: null,
          student_grade: null,
        }
      } catch {
        return null
      }
    })
  )

  const found: ScheduleProfResult[] = settled
    .filter((r): r is PromiseFulfilledResult<ScheduleProfResult> =>
      r.status === 'fulfilled' && r.value !== null
    )
    .map(r => r.value)

  if (supabase && found.length > 0) {
    const ids = found.map(f => f.id)
    const [{ data }, { data: socProfessors }] = await Promise.all([
      supabase
        .from('professor_cache')
        .select('rmp_id, ai_analysis, avg_rating, avg_difficulty, would_take_again, num_ratings')
        .in('rmp_id', ids),
      supabase
        .from('professors')
        .select('id, rmp_id')
        .in('rmp_id', ids),
    ])

    const professorIdByRmp = new Map((socProfessors ?? []).map(p => [p.rmp_id, p.id]))
    const nativeStats = await loadNativeReviewStats([...professorIdByRmp.values()])

    if (data) {
      const map = new Map(data.map(d => [d.rmp_id, d]))
      for (const prof of found) {
        const cached = map.get(prof.id)
        if (cached?.ai_analysis) {
          prof.ai_analysis = cached.ai_analysis as AIAnalysis
        }
        if (cached?.avg_rating) prof.avgRating = cached.avg_rating
        if (cached?.avg_difficulty) prof.avgDifficulty = cached.avg_difficulty
        prof.student_grade = buildProfessorGrade({
          rmpAvgRating: cached?.avg_rating ?? prof.avgRating,
          rmpAvgDifficulty: cached?.avg_difficulty ?? prof.avgDifficulty,
          rmpWouldTakeAgainPct: cached?.would_take_again ?? prof.wouldTakeAgainPercent,
          rmpNumRatings: cached?.num_ratings ?? prof.numRatings,
          native: nativeStats.get(professorIdByRmp.get(prof.id) ?? '') ?? null,
        })
      }
    }
  }

  const verdictOrder: Record<string, number> = { take: 0, depends: 1, avoid: 2 }
  found.sort((a, b) => {
    const ao = a.ai_analysis ? (verdictOrder[a.ai_analysis.verdict] ?? 3) : 3
    const bo = b.ai_analysis ? (verdictOrder[b.ai_analysis.verdict] ?? 3) : 3
    if (ao !== bo) return ao - bo
    if ((b.student_grade?.score ?? 0) !== (a.student_grade?.score ?? 0)) {
      return (b.student_grade?.score ?? 0) - (a.student_grade?.score ?? 0)
    }
    return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  })

  const foundNames = new Set(found.map(f => f.searchedName.toLowerCase()))
  const notFound = unique.filter(n => !foundNames.has(n.toLowerCase()))

  return NextResponse.json({ results: found, notFound })
}

async function loadNativeReviewStats(professorIds: string[]) {
  const stats = new Map<string, NativeReviewStats>()
  if (!supabase || professorIds.length === 0) return stats

  const { data, error } = await supabase
    .from('reviews')
    .select('professor_id, quality_rating, difficulty_rating, would_take_again, grade_received')
    .in('professor_id', professorIds)
    .eq('source', 'native')
    .eq('is_removed', false)

  if (error) return stats

  const grouped = new Map<string, NativeReviewStatRow[]>()
  for (const row of (data ?? []) as NativeReviewStatRow[]) {
    const rows = grouped.get(row.professor_id) ?? []
    rows.push(row)
    grouped.set(row.professor_id, rows)
  }

  for (const [professorId, rows] of grouped) {
    stats.set(professorId, summarizeNativeReviews(rows))
  }
  return stats
}

interface NativeReviewStatRow {
  professor_id: string
  quality_rating: number | null
  difficulty_rating: number | null
  would_take_again: boolean | null
  grade_received: string | null
}
