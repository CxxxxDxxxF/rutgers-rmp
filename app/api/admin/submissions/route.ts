import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-server'
import { isAdminAuthorized } from '@/lib/admin-auth'

export async function GET(req: NextRequest) {
  if (!isAdminAuthorized(req.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const status = req.nextUrl.searchParams.get('status')

  let query = supabase
    .from('user_submissions')
    .select('id, professor_name, course_id, semester_code, section_number, evidence, status, upvotes, downvotes, created_at')
    .order('created_at', { ascending: false })

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.eq('status', status)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch submissions' }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}
