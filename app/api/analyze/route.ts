import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'
import { getProfessorById, makeSlug } from '@/lib/rmp'
import { analyzeProfessor } from '@/lib/ai'
import { log } from '@/lib/logger'

const CACHE_DAYS = 30

// Cache reads use the anon client (RLS allows SELECT on professor_cache) so
// cached profiles stay available even when the service role key isn't set.
// Writes (search_count bump, upsert) require the service role and are skipped
// without it rather than failing the request.
function getServiceClient() {
  try {
    return createServiceClient()
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  let rmpId: unknown
  try {
    ;({ rmpId } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!rmpId || typeof rmpId !== 'string') {
    return NextResponse.json({ error: 'rmpId required' }, { status: 400 })
  }

  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }
  const serviceClient = getServiceClient()

  try {
    // Check cache
    const { data: cached } = await supabase
      .from('professor_cache')
      .select('*')
      .eq('rmp_id', rmpId)
      .maybeSingle()

    if (cached) {
      const age = Date.now() - new Date(cached.cached_at).getTime()
      // Rows cached without an AI verdict count as stale so they self-heal
      // once an OpenRouter key is configured.
      const isStale = age > CACHE_DAYS * 24 * 60 * 60 * 1000 || !cached.ai_analysis

      if (!isStale) {
        if (serviceClient) {
          await serviceClient
            .from('professor_cache')
            .update({ search_count: (cached.search_count ?? 0) + 1 })
            .eq('rmp_id', rmpId)
        }
        return NextResponse.json(cached)
      }
    }

    // Fetch from RMP
    const professor = await getProfessorById(rmpId)
    if (!professor) return NextResponse.json({ error: 'Professor not found' }, { status: 404 })

    // Run AI analysis; a failure (e.g. missing OPENROUTER_API_KEY) degrades to
    // a profile without a verdict instead of failing the whole request.
    let ai_analysis = null
    try {
      ai_analysis = await analyzeProfessor(
        `${professor.firstName} ${professor.lastName}`,
        professor.department,
        professor.avgRating,
        professor.avgDifficulty,
        professor.wouldTakeAgainPercent,
        professor.ratings
      )
    } catch (err) {
      log.error('AI analysis error:', err)
    }

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

    // Only cache complete records — a null analysis shouldn't be served for 30 days.
    if (!serviceClient || !ai_analysis) {
      return NextResponse.json(record)
    }

    const { data, error } = await serviceClient
      .from('professor_cache')
      .upsert(record, { onConflict: 'rmp_id' })
      .select()
      .single()

    if (error) {
      log.error('Supabase upsert error:', error)
      return NextResponse.json(record)
    }

    return NextResponse.json(data)
  } catch (err) {
    log.error('Analyze error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
