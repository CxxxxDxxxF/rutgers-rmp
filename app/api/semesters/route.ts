import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { log } from '@/lib/logger'

export async function GET() {
  if (!supabase) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('semesters')
    .select('id, name, code, slug, year, term, is_current')
    .order('is_current', { ascending: false })
    .order('year', { ascending: false })
    .order('name', { ascending: false })

  if (error) {
    log.error('Semesters fetch error:', error)
    return NextResponse.json({ error: 'Failed to load semesters' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
