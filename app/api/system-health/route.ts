import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import type { PublicSystemHealth } from '@/lib/system-health'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const db = createServiceClient()
    const { data, error } = await db
      .from('system_health')
      .select('healthy, checked_at, last_success_at')
      .eq('service', 'rutgers_soc')
      .maybeSingle()

    if (error) throw new Error(error.message)

    const body: PublicSystemHealth = {
      rutgers_soc: data ? {
        available: data.healthy,
        checked_at: data.checked_at,
        last_success_at: data.last_success_at,
      } : null,
    }

    return NextResponse.json(body, {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch {
    return NextResponse.json(
      { rutgers_soc: null } satisfies PublicSystemHealth,
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
