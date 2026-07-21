import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { createServiceClient } from '@/lib/supabase-server'
import { getProfessorById, makeSlug } from '@/lib/rmp'
import { analyzeProfessor } from '@/lib/ai'
import { log } from '@/lib/logger'

const CACHE_DAYS = 30
const hasOpenRouterKey = Boolean(process.env.OPENROUTER_API_KEY)

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
  let rmpId: unknown, force: unknown
  try {
    ;({ rmpId, force } = await req.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!rmpId || typeof rmpId !== 'string') {
    return NextResponse.json({ error: 'rmpId required' }, { status: 400 })
  }
  const forceRefresh = force === true

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

    if (cached && !forceRefresh) {
      const age = Date.now() - new Date(cached.cached_at).getTime()
      // A cached row can lack the individual RMP reviews (e.g. an aggregate-only
      // enrichment). Treat a missing/empty ratings array as stale so the reviews
      // self-heal on the next view — independent of AI availability. Missing AI
      // only self-heals when an OpenRouter key is configured.
      const missingReviews = !Array.isArray(cached.ratings) || cached.ratings.length === 0
      const isStale =
        age > CACHE_DAYS * 24 * 60 * 60 * 1000 ||
        missingReviews ||
        (hasOpenRouterKey && !cached.ai_analysis)

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

    // AI is optional. Preserve prior analysis if the provider is unavailable or fails.
    let ai_analysis = cached?.ai_analysis ?? null
    if (hasOpenRouterKey) {
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
    }

    const slug = makeSlug(professor.firstName, professor.lastName, professor.id)

    // Pre-aggregate tag counts so the profile page avoids re-scanning all ratings
    const tagCounts: Record<string, number> = {}
    for (const r of professor.ratings ?? []) {
      for (const tag of r.tags ?? []) {
        if (tag?.trim()) tagCounts[tag.trim()] = (tagCounts[tag.trim()] ?? 0) + 1
      }
    }

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
      tag_counts: Object.keys(tagCounts).length > 0 ? tagCounts : null,
      cached_at: new Date().toISOString(),
      search_count: (cached?.search_count ?? 0) + 1,
    }

    if (!serviceClient) {
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
