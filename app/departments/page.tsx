import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import DepartmentsGrid from '@/components/DepartmentsGrid'

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

export default async function DepartmentsPage() {
  const departments = await getDepartments()

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex flex-col">
      <AppHeader />

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
          <DepartmentsGrid departments={departments} />
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
