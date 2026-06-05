import { NextRequest, NextResponse } from 'next/server'
import { searchProfessors, makeSlug } from '@/lib/rmp'
import { supabase } from '@/lib/supabase'
import type { AIAnalysis } from '@/lib/supabase'

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
        const results = await searchProfessors(name)
        if (!results.length) return null
        const top = results[0]
        return {
          searchedName: name,
          id: top.id,
          firstName: top.firstName,
          lastName: top.lastName,
          department: top.department ?? 'Unknown Department',
          avgRating: top.avgRating ?? 0,
          avgDifficulty: top.avgDifficulty ?? 0,
          wouldTakeAgainPercent: top.wouldTakeAgainPercent === -1 ? null : top.wouldTakeAgainPercent,
          numRatings: top.numRatings ?? 0,
          slug: makeSlug(top.firstName, top.lastName, top.id),
          ai_analysis: null,
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
    const { data } = await supabase
      .from('professor_cache')
      .select('rmp_id, ai_analysis, avg_rating, avg_difficulty')
      .in('rmp_id', ids)

    if (data) {
      const map = new Map(data.map(d => [d.rmp_id, d]))
      for (const prof of found) {
        const cached = map.get(prof.id)
        if (cached?.ai_analysis) {
          prof.ai_analysis = cached.ai_analysis as AIAnalysis
        }
        if (cached?.avg_rating) prof.avgRating = cached.avg_rating
        if (cached?.avg_difficulty) prof.avgDifficulty = cached.avg_difficulty
      }
    }
  }

  const verdictOrder: Record<string, number> = { take: 0, depends: 1, avoid: 2 }
  found.sort((a, b) => {
    const ao = a.ai_analysis ? (verdictOrder[a.ai_analysis.verdict] ?? 3) : 3
    const bo = b.ai_analysis ? (verdictOrder[b.ai_analysis.verdict] ?? 3) : 3
    if (ao !== bo) return ao - bo
    return (b.avgRating ?? 0) - (a.avgRating ?? 0)
  })

  const foundNames = new Set(found.map(f => f.searchedName.toLowerCase()))
  const notFound = unique.filter(n => !foundNames.has(n.toLowerCase()))

  return NextResponse.json({ results: found, notFound })
}
