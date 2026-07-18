// ==========================================================================
// AI analysis collector — one-shot backlog drainer.
//
// Processes a batch of professors that have RMP data but no AI write-up yet,
// then exits — so it can run as a Railway cron service instead of living inside
// the always-on sniper worker. This decouples professor-verdict generation from
// the worker: in history-only mode (no alerts) the worker is off, but the AI
// backlog still needs draining, and this cron does it on its own schedule.
//
// Per professor: fetch the RMP profile + recent reviews, ask OpenRouter (Haiku)
// for a structured verdict, and upsert it into professor_cache.ai_analysis.
// Highest num_ratings first, so the most-searched professors get verdicts soonest.
//
// Once the backlog is empty, each run is a cheap no-op (fetch returns nothing),
// so it safely stays scheduled to pick up newly RMP-enriched professors.
//
// Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY.
// Plain ESM, no bundler — must pass `node --check`.
// ==========================================================================

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY
const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? process.env.RAILWAY_PUBLIC_DOMAIN
// Professors to process per run. At 25 with an 800ms pause between items a run
// takes ~75s; a ~10-min cron drains a ~900-professor backlog in roughly a day.
const BATCH_SIZE = Math.min(100, Math.max(1, parseInt(process.env.AI_BATCH_SIZE ?? '25', 10) || 25))
const ITEM_DELAY_MS = Math.max(0, parseInt(process.env.AI_ITEM_DELAY_MS ?? '800', 10) || 800)

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(JSON.stringify({ event: 'ai_collector_config_error', message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }))
  process.exit(1)
}
if (!OPENROUTER_API_KEY) {
  console.error(JSON.stringify({ event: 'ai_collector_config_error', message: 'Missing OPENROUTER_API_KEY' }))
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(JSON.stringify({ event: 'ai_collector_fatal_error', message: errorMessage(error) }))
    process.exit(1)
  })

async function main() {
  const startedAt = Date.now()

  const { data: batch, error } = await supabase
    .from('professor_cache')
    .select('rmp_id, first_name, last_name, department, avg_rating, avg_difficulty, would_take_again, num_ratings')
    .is('ai_analysis', null)
    .not('rmp_id', 'is', null)
    .order('num_ratings', { ascending: false, nullsFirst: false })
    .limit(BATCH_SIZE)

  if (error) throw new Error(`Analysis batch fetch: ${error.message}`)

  const rows = batch ?? []
  if (rows.length === 0) {
    console.log(JSON.stringify({ event: 'ai_collector_idle', reason: 'backlog_empty' }))
    return
  }

  // Report remaining backlog so progress is visible in logs across runs.
  const { count: remaining } = await supabase
    .from('professor_cache')
    .select('rmp_id', { count: 'exact', head: true })
    .is('ai_analysis', null)
    .not('rmp_id', 'is', null)

  console.log(JSON.stringify({ event: 'ai_collector_start', batch: rows.length, backlog_remaining: remaining ?? null }))

  let ok = 0
  let errors = 0
  for (const row of rows) {
    try {
      const professor = await rmpGetProfessorById(row.rmp_id)
      if (!professor) { errors++; continue }

      const ai_analysis = await openRouterAnalyze(
        `${professor.firstName} ${professor.lastName}`,
        professor.department,
        professor.avgRating,
        professor.avgDifficulty,
        professor.wouldTakeAgainPercent,
        professor.ratings
      )

      const { error: updErr } = await supabase
        .from('professor_cache')
        .update({ ai_analysis, cached_at: new Date().toISOString() })
        .eq('rmp_id', row.rmp_id)
      if (updErr) throw new Error(`Upsert: ${updErr.message}`)

      ok++
    } catch (err) {
      errors++
      console.error(JSON.stringify({ event: 'ai_collector_item_error', rmp_id: row.rmp_id, message: errorMessage(err) }))
    }
    await sleep(ITEM_DELAY_MS)
  }

  console.log(JSON.stringify({
    event: 'ai_collector_complete',
    ok, errors, total: rows.length,
    backlog_remaining_before: remaining ?? null,
    ms: Date.now() - startedAt,
  }))
}

async function rmpGetProfessorById(id) {
  const RMP_GRAPHQL_URL = 'https://www.ratemyprofessors.com/graphql'
  const RMP_AUTH = 'Basic dGVzdDp0ZXN0'
  const RMP_TIMEOUT_MS = 8000
  const query = `
    query GetProfessor($id: ID!, $cursor: String) {
      node(id: $id) {
        ... on Teacher {
          id firstName lastName department
          avgRating avgDifficulty wouldTakeAgainPercent numRatings
          ratings(first: 100, after: $cursor) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id class comment qualityRating difficultyRatingRounded
                thumbsUpTotal thumbsDownTotal date grade
                isForOnlineClass attendanceMandatory wouldTakeAgain ratingTags
              }
            }
          }
        }
      }
    }
  `
  const doFetch = async (vars) => {
    const res = await fetchWithTimeout(RMP_GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: RMP_AUTH },
      body: JSON.stringify({ query, variables: vars }),
    }, RMP_TIMEOUT_MS)
    if (!res.ok) throw new Error(`RMP API error: ${res.status}`)
    const data = await res.json()
    const errs = Array.isArray(data?.errors) ? data.errors : []
    if (errs.length > 0) throw new Error(`RMP GraphQL: ${errs[0]?.message ?? 'unknown'}`)
    return data
  }

  const data = await doFetch({ id, cursor: null })
  const teacher = data?.data?.node
  if (!teacher) return null

  const parseEdges = (edges) => (edges ?? []).map(e => ({
    id: e.node.id,
    class: e.node.class ?? null,
    comment: e.node.comment,
    qualityRating: e.node.qualityRating,
    difficultyRatingRounded: e.node.difficultyRatingRounded,
    grade: e.node.grade,
    wouldTakeAgain: e.node.wouldTakeAgain,
    tags: e.node.ratingTags ? e.node.ratingTags.split('--') : [],
  }))

  const ratings = parseEdges(teacher.ratings?.edges)
  const pageInfo = teacher.ratings?.pageInfo
  if (pageInfo?.hasNextPage && pageInfo.endCursor && ratings.length < 200) {
    try {
      const page2 = await doFetch({ id, cursor: pageInfo.endCursor })
      ratings.push(...parseEdges(page2?.data?.node?.ratings?.edges))
    } catch { /* non-fatal */ }
  }

  return {
    id: teacher.id,
    firstName: teacher.firstName,
    lastName: teacher.lastName,
    department: teacher.department,
    avgRating: teacher.avgRating,
    avgDifficulty: teacher.avgDifficulty,
    wouldTakeAgainPercent: teacher.wouldTakeAgainPercent,
    numRatings: teacher.numRatings,
    ratings,
  }
}

async function openRouterAnalyze(name, department, avgRating, avgDifficulty, wouldTakeAgainPercent, ratings) {
  const recentReviews = ratings
    .filter(r => r.comment && r.comment.length > 20)
    .slice(0, 40)
    .map(r => `[${r.qualityRating}/5, Diff: ${r.difficultyRatingRounded}/5, Grade: ${r.grade || 'N/A'}]: ${r.comment}`)
    .join('\n')

  const prompt = `You are analyzing a Rutgers University professor for a student-facing Rate My Professor tool.

Professor: ${name}
Department: ${department}
Average Rating: ${avgRating}/5
Average Difficulty: ${avgDifficulty}/5
Would Take Again: ${wouldTakeAgainPercent?.toFixed(0) ?? 'N/A'}%
Total Ratings: ${ratings.length}

Recent student reviews:
${recentReviews}

Rutgers students care most about: grading leniency, attendance policies, exam difficulty, workload per week, whether the textbook is required, and how much the professor affects final grade vs curved exams.

Return a JSON object with these exact fields:
{
  "verdict": "take" | "avoid" | "depends",
  "verdict_reason": "One punchy sentence explaining the verdict (max 20 words)",
  "teaching_style": "2-3 sentences describing how this prof teaches",
  "workload": "2-3 sentences on workload, homework, assignments",
  "grading": "2-3 sentences on grading style, curves, exams",
  "tips": ["tip1", "tip2", "tip3", "tip4"],
  "best_for": "One sentence: what type of student thrives with this prof",
  "worst_for": "One sentence: what type of student struggles",
  "common_complaints": ["complaint1", "complaint2", "complaint3"],
  "common_praise": ["praise1", "praise2", "praise3"]
}

Be direct and honest. Rutgers students want real talk, not sugarcoating. Use student-friendly language.`

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'HTTP-Referer': APP_BASE_URL ?? 'https://rurate-web-production.up.railway.app',
      'X-Title': 'RU Rate',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash-lite',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!res.ok) throw new Error(`OpenRouter error: ${res.status}`)
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content ?? ''
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('No JSON in AI response')
  return JSON.parse(jsonMatch[0])
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch (error) {
    if (controller.signal.aborted) throw new Error(`Request timed out after ${timeoutMs}ms`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
