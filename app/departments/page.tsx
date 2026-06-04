import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface DepartmentRow {
  id: string
  code: string
  name: string
  full_name: string
  school: string
  slug: string
  professor_count: number
  avg_rating: number | null
}

async function getDepartments(): Promise<DepartmentRow[]> {
  if (!supabase) return []

  try {
    const { data: departments, error: deptError } = await supabase
      .from('departments')
      .select('id, code, name, full_name, school, slug')
      .order('school')
      .order('name')

    if (deptError || !departments) return []

    // Fetch professor counts and ratings per department
    const { data: profData } = await supabase
      .from('professor_departments')
      .select(`
        department_id,
        professors!inner(
          professor_cache(avg_rating)
        )
      `)

    const deptStats: Record<string, { count: number; ratings: number[] }> = {}

    for (const row of profData ?? []) {
      const deptId = row.department_id as string
      if (!deptStats[deptId]) deptStats[deptId] = { count: 0, ratings: [] }
      deptStats[deptId].count += 1

      const prof = row.professors as unknown as {
        professor_cache: { avg_rating: number } | null
      }
      if (prof?.professor_cache?.avg_rating != null) {
        deptStats[deptId].ratings.push(Number(prof.professor_cache.avg_rating))
      }
    }

    return departments.map((d) => {
      const stats = deptStats[d.id]
      const avg =
        stats && stats.ratings.length > 0
          ? stats.ratings.reduce((a, b) => a + b, 0) / stats.ratings.length
          : null

      return {
        id: d.id,
        code: d.code,
        name: d.name,
        full_name: d.full_name ?? d.name,
        school: d.school ?? 'Rutgers University',
        slug: d.slug,
        professor_count: stats?.count ?? 0,
        avg_rating: avg != null ? Math.round(avg * 10) / 10 : null,
      }
    })
  } catch {
    return []
  }
}

function ratingColor(rating: number | null): string {
  if (rating == null) return '#71717a'
  if (rating >= 4) return '#22c55e'
  if (rating >= 3) return '#f59e0b'
  return '#ef4444'
}

function DepartmentCard({ dept }: { dept: DepartmentRow }) {
  return (
    <Link
      href={`/department/${dept.slug}`}
      className="block bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all group"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-mono text-zinc-500 mb-1">{dept.code}</div>
          <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors leading-snug">
            {dept.name}
          </div>
        </div>
        {dept.avg_rating != null && (
          <div
            className="shrink-0 text-lg font-black"
            style={{ color: ratingColor(dept.avg_rating) }}
          >
            {dept.avg_rating.toFixed(1)}
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500">
        <span>
          {dept.professor_count > 0
            ? `${dept.professor_count} professor${dept.professor_count !== 1 ? 's' : ''}`
            : 'No professors yet'}
        </span>
        {dept.avg_rating != null && (
          <>
            <span className="w-1 h-1 rounded-full bg-zinc-700" />
            <span style={{ color: ratingColor(dept.avg_rating) }}>
              avg {dept.avg_rating.toFixed(1)} rating
            </span>
          </>
        )}
      </div>
    </Link>
  )
}

export default async function DepartmentsPage() {
  const departments = await getDepartments()

  // Group by school
  const grouped: Record<string, DepartmentRow[]> = {}
  for (const dept of departments) {
    const school = dept.school || 'Other'
    if (!grouped[school]) grouped[school] = []
    grouped[school].push(dept)
  }

  const schools = Object.keys(grouped).sort()

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
        <div className="max-w-5xl mx-auto flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <div
              className="w-6 h-6 rounded flex items-center justify-center font-black text-white text-xs"
              style={{ backgroundColor: '#CC0033' }}
            >
              RU
            </div>
            <span className="font-bold text-white text-sm">RU Rate</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-10">
        {/* Page header */}
        <div className="mb-10">
          <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-[#CC0033]" />
            {departments.length} Departments
          </div>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white">
            Browse by{' '}
            <span style={{ color: '#CC0033' }}>Department</span>
          </h1>
          <p className="mt-3 text-zinc-400 text-lg max-w-xl">
            Explore professors and courses organized by department across all Rutgers schools.
          </p>
        </div>

        {departments.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">🏛️</div>
            <p className="text-zinc-400">No departments found.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {schools.map((school) => (
              <section key={school}>
                <div className="flex items-center gap-3 mb-5">
                  <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    {school}
                  </h2>
                  <div className="flex-1 h-px bg-zinc-800" />
                  <span className="text-xs text-zinc-600">
                    {grouped[school].length} dept{grouped[school].length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {grouped[school].map((dept) => (
                    <DepartmentCard key={dept.id} dept={dept} />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      <footer className="border-t border-zinc-900 px-6 py-6 mt-10">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  )
}
