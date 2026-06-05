import { NextRequest, NextResponse } from 'next/server'
import { searchProfessors, makeSlug } from '@/lib/rmp'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json([])

  try {
    const [cachedResult, socResult, rmpProfessors] = await Promise.allSettled([
      supabase
        ? supabase
            .from('professor_cache')
            .select('rmp_id, slug, first_name, last_name, department, school_name, avg_rating, avg_difficulty, would_take_again, num_ratings, ai_analysis')
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
            .order('search_count', { ascending: false })
            .limit(5)
        : Promise.resolve({ data: [] }),
      supabase
        ? supabase
            .from('professors')
            .select('id, first_name, last_name, slug, professor_departments(is_primary, departments(name))')
            .is('cache_id', null)
            .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%`)
            .limit(8)
        : Promise.resolve({ data: [] }),
      searchProfessors(q),
    ])

    const cached =
      cachedResult.status === 'fulfilled' && cachedResult.value?.data
        ? cachedResult.value.data
        : []

    const socRaw =
      socResult.status === 'fulfilled' && socResult.value?.data
        ? (socResult.value.data as SocProf[])
        : []

    const rmpRaw =
      rmpProfessors.status === 'fulfilled' ? (rmpProfessors.value as RMPProf[]) : []

    // Priority: cached (have AI) → SOC-only → RMP live
    const seenRmpIds = new Set<string>()
    const results = []

    for (const c of cached) {
      seenRmpIds.add(c.rmp_id)
      results.push({
        id: c.rmp_id,
        firstName: c.first_name,
        lastName: c.last_name,
        department: c.department,
        schoolName: c.school_name,
        avgRating: Number(c.avg_rating),
        numRatings: c.num_ratings,
        slug: c.slug,
        verdict: c.ai_analysis?.verdict ?? null,
        analyzed: true,
        isSocOnly: false,
      })
    }

    for (const p of socRaw) {
      const primaryDept = p.professor_departments?.find((pd: ProfDept) => pd.is_primary) ?? p.professor_departments?.[0]
      const deptName = (primaryDept?.departments as { name: string } | null)?.name ?? null
      results.push({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        department: deptName,
        schoolName: 'Rutgers University - New Brunswick',
        avgRating: null,
        numRatings: 0,
        slug: p.slug,
        verdict: null,
        analyzed: false,
        isSocOnly: true,
      })
    }

    for (const p of rmpRaw) {
      if (seenRmpIds.has(p.id)) continue
      seenRmpIds.add(p.id)
      results.push({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        department: p.department,
        schoolName: p.school?.name ?? 'Rutgers University',
        avgRating: p.avgRating,
        numRatings: p.numRatings,
        slug: makeSlug(p.firstName, p.lastName, p.id),
        verdict: null,
        analyzed: false,
        isSocOnly: false,
      })
    }

    return NextResponse.json(results.slice(0, 10))
  } catch (err) {
    log.error('Search error:', err)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
}

interface SocProf {
  id: string
  first_name: string
  last_name: string
  slug: string
  professor_departments: ProfDept[] | null
}

interface ProfDept {
  is_primary: boolean
  departments: { name: string } | null
}

interface RMPProf {
  id: string
  firstName: string
  lastName: string
  department: string
  school: { name: string }
  avgRating: number
  numRatings: number
}
