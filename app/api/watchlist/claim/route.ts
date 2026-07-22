import { NextResponse } from 'next/server'

// Legacy anonymous-owner migration is intentionally disabled. Accepting a
// browser-supplied watcher UUID would make ownership depend on untrusted client
// state instead of the authenticated Supabase session.
export async function POST() {
  return NextResponse.json(
    { error: 'Legacy watchlist claims are no longer supported' },
    { status: 410 },
  )
}
