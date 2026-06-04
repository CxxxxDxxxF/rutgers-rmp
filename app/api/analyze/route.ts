import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getProfessorById, makeSlug } from '@/lib/rmp'
import { analyzeProfessor } from '@/lib/ai'
import { log } from '@/lib/logger'

const CACHE_DAYS = 30

export async function POST(req: NextRequest) {
  const { rmpId } = await req.json()
  if (!rmpId) return NextResponse.json({ error: 'rmpId required' }, { status: 400 })

  // Check cache
  let cached = null
  if (supabase) {
    const { data } = await supabase
      .from('professor_cache')
      .select('*')
      .eq('rmp_id', rmpId)
      .single()
    cached = data
  }

  if (cached) {
    const age = Date.now() - new Date(cached.cached_at).getTime()
    const isStale = age > CACHE_DAYS * 24 * 60 * 60 * 1000

    if (!isStale) {
      await supabase!
        .from('professor_cache')
        .update({ search_count: (cached.search_count ?? 0) + 1 })
        .eq('rmp_id', rmpId)
      return NextResponse.json(cached)
    }
  }

  // Fetch from RMP
  const professor = await getProfessorById(rmpId)
  if (!professor) return NextResponse.json({ error: 'Professor not found' }, { status: 404 })

  // Run AI analysis
  const ai_analysis = await analyzeProfessor(
    `${professor.firstName} ${professor.lastName}`,
    professor.department,
    professor.avgRating,
    professor.avgDifficulty,
    professor.wouldTakeAgainPercent,
    professor.ratings
  )

  const slug = makeSlug(professor.firstName, professor.lastName, professor.id)

  const record = {
    rmp_id: professor.id,
    slug,
    first_name: professor.firstName,
    last_name: professor.lastName,
    department: professor.department,
    school_name: professor.schoolName,
    avg_rating: professor.avgRating,
    avg_difficulty: professor.avgDifficulty,
    would_take_again: professor.wouldTakeAgainPercent,
    num_ratings: professor.numRatings,
    ratings: professor.ratings,
    ai_analysis,
    cached_at: new Date().toISOString(),
    search_count: (cached?.search_count ?? 0) + 1,
  }

  if (!supabase) return NextResponse.json(record)

  const { data, error } = await supabase
    .from('professor_cache')
    .upsert(record, { onConflict: 'rmp_id' })
    .select()
    .single()

  if (error) {
    log.error('Supabase upsert error:', error)
    return NextResponse.json(record)
  }

  return NextResponse.json(data)
}
