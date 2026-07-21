import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { log } from '@/lib/logger'

// Live operational health — never cached.
export const dynamic = 'force-dynamic'
export const revalidate = 0

// The status collector sweeps every ~5 min; allow slack for a slow run before
// calling the history feed stale.
const COLLECTOR_STALE_MINUTES = 20

// Presence-only view of the browser-facing Supabase configuration. The URL
// host and anon key already ship inside the client bundle, so naming the host
// leaks nothing — but no key material is ever included. Lets an operator
// confirm Railway supplied the NEXT_PUBLIC_* values without shell access.
function publicConfig() {
  let host: string | null = null
  try {
    host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').host || null
  } catch {
    host = null
  }
  return {
    supabase_url_host: host,
    anon_key_present: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  }
}

// Point a free uptime monitor (UptimeRobot, etc.) at this route. It returns:
//   200 { status: "ok" }        — database reachable, history feed fresh
//   200 { status: "degraded" }  — reachable but no status writer is running
//   503 { status: "down" }      — database unreachable
// The body carries non-sensitive operational metrics only (counts + freshness);
// no watcher, contact, or account data is ever exposed.
export async function GET() {
  const startedAt = Date.now()
  let db: ReturnType<typeof createServiceClient>
  try {
    db = createServiceClient()
  } catch {
    return NextResponse.json(
      { status: 'down', db: 'unconfigured', public_config: publicConfig(), checked_at: new Date().toISOString() },
      { status: 503 }
    )
  }

  try {
    const [latestEvent, aiBacklog, sections] = await Promise.all([
      db.from('section_status_events').select('observed_at').order('observed_at', { ascending: false }).limit(1).maybeSingle(),
      db.from('professor_cache').select('rmp_id', { count: 'exact', head: true }).is('ai_analysis', null).not('rmp_id', 'is', null),
      db.from('teaching_assignments').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    ])

    if (latestEvent.error) throw new Error(latestEvent.error.message)

    const lastEventAt = latestEvent.data?.observed_at ?? null
    const minutesSince = lastEventAt
      ? Math.round((Date.now() - new Date(lastEventAt).getTime()) / 60000)
      : null
    const collectorStale = minutesSince == null || minutesSince > COLLECTOR_STALE_MINUTES

    return NextResponse.json({
      status: collectorStale ? 'degraded' : 'ok',
      checked_at: new Date().toISOString(),
      response_ms: Date.now() - startedAt,
      status_history: {
        last_event_at: lastEventAt,
        minutes_since: minutesSince,
        // Stale means no status writer (collector or worker) is running — the
        // history feed and the "Just Opened"/reopen signals go cold.
        fresh: !collectorStale,
      },
      ai_analysis_backlog: aiBacklog.count ?? null,
      active_sections: sections.count ?? null,
      public_config: publicConfig(),
    })
  } catch (err) {
    log.error('Health check failed:', err)
    return NextResponse.json(
      { status: 'down', db: 'unreachable', checked_at: new Date().toISOString() },
      { status: 503 }
    )
  }
}
