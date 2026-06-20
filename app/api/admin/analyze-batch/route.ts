import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { isAdminAuthorized } from '@/lib/admin-auth'
import { getProfessorById } from '@/lib/rmp'
import { analyzeProfessor } from '@/lib/ai'
import { log } from '@/lib/logger'

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 100
const DELAY_MS = 800  // between requests — respect RMP rate limits

// POST /api/admin/analyze-batch
// Picks the next N professors with no AI analysis (highest num_ratings first),
// fetches their reviews from RMP, runs AI analysis, and upserts the verdict.
// Authorization: Bearer <ADMIN_SECRET>
// Body: { limit?: number }   default 20, max 100
export async function POST(req: NextRequest) {
  if (!isAdminAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let limit = DEFAULT_LIMIT
  try {
    const body = await req.json().catch(() => ({}))
    const parsed = parseInt(body.limit ?? '')
    if (!isNaN(parsed)) limit = Math.min(Math.max(parsed, 1), MAX_LIMIT)
  } catch {
    // default limit
  }

  const db = createServiceClient()

  // Find professors without AI analysis, ordered by most-rated first
  const { data: batch, error: fetchErr } = await db
    .from('professor_cache')
    .select('rmp_id, first_name, last_name, department, avg_rating, avg_difficulty, would_take_again, num_ratings')
    .or('ai_analysis.is.null,ai_analysis.eq.null')
    .order('num_ratings', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (fetchErr) {
    log.error('analyze-batch fetch error:', fetchErr)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  const results: { rmpId: string; name: string; status: 'ok' | 'error'; verdict?: string; error?: string }[] = []

  for (const row of (batch ?? [])) {
    try {
      const professor = await getProfessorById(row.rmp_id)
      if (!professor) {
        results.push({ rmpId: row.rmp_id, name: `${row.first_name} ${row.last_name}`, status: 'error', error: 'Not found on RMP' })
        continue
      }

      const ai_analysis = await analyzeProfessor(
        `${professor.firstName} ${professor.lastName}`,
        professor.department,
        professor.avgRating,
        professor.avgDifficulty,
        professor.wouldTakeAgainPercent,
        professor.ratings
      )

      await db
        .from('professor_cache')
        .update({ ai_analysis, cached_at: new Date().toISOString() })
        .eq('rmp_id', row.rmp_id)

      results.push({ rmpId: row.rmp_id, name: `${professor.firstName} ${professor.lastName}`, status: 'ok', verdict: ai_analysis.verdict })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log.error(`analyze-batch error for ${row.rmp_id}:`, msg)
      results.push({ rmpId: row.rmp_id, name: `${row.first_name} ${row.last_name}`, status: 'error', error: msg })
    }

    // rate-limit pause between RMP + OpenRouter calls
    await new Promise(r => setTimeout(r, DELAY_MS))
  }

  const ok = results.filter(r => r.status === 'ok').length
  const errors = results.filter(r => r.status === 'error').length

  return NextResponse.json({ processed: results.length, ok, errors, results })
}

// GET /api/admin/analyze-batch — returns stats on how many need analysis
export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createServiceClient()

  const [{ count: total }, { count: withAI }] = await Promise.all([
    db.from('professor_cache').select('*', { count: 'exact', head: true }),
    db.from('professor_cache').select('*', { count: 'exact', head: true }).not('ai_analysis', 'is', null),
  ])

  return NextResponse.json({
    total: total ?? 0,
    with_ai: withAI ?? 0,
    missing_ai: (total ?? 0) - (withAI ?? 0),
    hint: 'POST to this endpoint with { "limit": 20 } and Authorization: Bearer <ADMIN_SECRET> to batch-analyze',
  })
}
