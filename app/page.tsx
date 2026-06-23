import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import SearchBar from '@/components/SearchBar'
import ProfessorCard from '@/components/ProfessorCard'
import type { ProfessorCache } from '@/lib/supabase'

export const revalidate = 120

interface TopProf {
  rmp_id: string
  slug: string
  first_name: string
  last_name: string
  department: string
  avg_rating: number
  num_ratings: number
  verdict: string | null
}

async function getTopRatedThisSemester(): Promise<TopProf[]> {
  if (!supabase) return []
  try {
    const { data: semData } = await supabase
      .from('semesters')
      .select('id')
      .eq('is_current', true)
      .single()
    if (!semData) return []

    const { data: rows } = await supabase
      .from('teaching_assignments')
      .select('professors ( rmp_id, slug, professor_cache ( first_name, last_name, department, avg_rating, num_ratings, ai_analysis ) )')
      .eq('semester_id', semData.id)
      .eq('status', 'active')
      .limit(800)

    const seen = new Set<string>()
    const profs: TopProf[] = []
    for (const row of rows ?? []) {
      const prof = Array.isArray(row.professors) ? row.professors[0] : row.professors
      if (!prof?.rmp_id || seen.has(prof.rmp_id)) continue
      const cache = Array.isArray(prof.professor_cache) ? prof.professor_cache[0] : prof.professor_cache
      if (!cache?.avg_rating || cache.num_ratings < 5) continue
      seen.add(prof.rmp_id)
      profs.push({
        rmp_id: prof.rmp_id,
        slug: prof.slug,
        first_name: cache.first_name,
        last_name: cache.last_name,
        department: cache.department ?? '',
        avg_rating: Number(cache.avg_rating),
        num_ratings: cache.num_ratings,
        verdict: (cache.ai_analysis as { verdict?: string } | null)?.verdict ?? null,
      })
    }
    return profs.sort((a, b) => b.avg_rating - a.avg_rating).slice(0, 6)
  } catch {
    return []
  }
}

async function getPopular(): Promise<ProfessorCache[]> {
  if (!supabase) return []
  try {
    const { data } = await supabase
      .from('professor_cache')
      .select('*')
      .order('search_count', { ascending: false })
      .limit(6)
    return data ?? []
  } catch {
    return []
  }
}

interface HotCourse {
  id: string
  course_number: string
  name: string
  slug: string
  credits: number | null
  open_count: number
  semester_name: string
}

async function getHotCourses(): Promise<HotCourse[]> {
  if (!supabase) return []
  try {
    const { data: semData } = await supabase
      .from('semesters')
      .select('id, name')
      .eq('is_current', true)
      .single()
    if (!semData) return []

    const { data } = await supabase
      .from('teaching_assignments')
      .select('course_id, courses ( id, course_number, name, slug, credits )')
      .eq('semester_id', semData.id)
      .eq('open_status', true)
      .eq('status', 'active')
      .limit(600)

    const courseMap = new Map<string, HotCourse>()
    for (const row of data ?? []) {
      const course = Array.isArray(row.courses) ? row.courses[0] : row.courses
      if (!course) continue
      const existing = courseMap.get(course.id)
      if (existing) {
        existing.open_count++
      } else {
        courseMap.set(course.id, {
          id: course.id,
          course_number: course.course_number,
          name: course.name,
          slug: course.slug,
          credits: course.credits ?? null,
          open_count: 1,
          semester_name: semData.name,
        })
      }
    }
    return Array.from(courseMap.values())
      .sort((a, b) => b.open_count - a.open_count)
      .slice(0, 6)
  } catch {
    return []
  }
}

const TOOLS: {
  href: string
  title: string
  description: string
  icon: React.ReactNode
}[] = [
  {
    href: '/courses',
    title: 'Find Courses',
    description: 'Search by semester, credits, building, section status, and top rated teachers',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: '/watchlist',
    title: 'Course Sniper',
    description: 'Track open and closed sections with index numbers ready for WebReg',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12C4.3 7.5 7.9 4.5 12 4.5s7.7 3 9.5 7.5c-1.8 4.5-5.4 7.5-9.5 7.5s-7.7-3-9.5-7.5z" />
      </svg>
    ),
  },
  {
    href: '/compare',
    title: 'Compare Professors',
    description: 'Stack Rutgers NB teachers by ratings, difficulty, reviews, and AI verdicts',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M15 4v16M4 9h5M4 15h5M15 9h5M15 15h5" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    title: 'Schedule Ranker',
    description: 'Rank possible schedules by professor quality and section fit',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
      </svg>
    ),
  },
  {
    href: '/professors',
    title: 'Browse Professors',
    description: 'Filter all rated Rutgers professors by AI verdict, department, and rating',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
]

export default async function HomePage() {
  const [popular, hotCourses, topRated] = await Promise.all([getPopular(), getHotCourses(), getTopRatedThisSemester()])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      {/* Hero */}
      <section className="relative flex flex-col items-center px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center overflow-hidden">
        {/* Scarlet radial bloom */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse 70% 50% at 50% 0%, rgba(204,0,51,0.13) 0%, transparent 70%)',
          }}
        />
        {/* Dot grid */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage: 'radial-gradient(circle, #444 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
            WebkitMaskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)',
          }}
        />
        <h1 className="relative text-4xl sm:text-5xl md:text-7xl font-black tracking-tight mb-4">
          <span className="text-white">Find the right</span>
          <br />
          <span style={{ color: '#CC0033' }}>Rutgers class.</span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg mb-10 max-w-lg">
          Search Rutgers New Brunswick courses by semester, credits, building, open seats,
          and teacher quality. Then read professor reviews, compare schedules, and track seats.
        </p>

        <SearchBar />

        <p className="mt-4 text-xs text-zinc-600">
          Try a course number like 198:111, a title like Data Structures, or a Rutgers NB professor
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/courses"
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#CC0033' }}
          >
            Browse courses
          </Link>
          <Link
            href="/professors"
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-zinc-200 transition-colors hover:border-zinc-500 hover:text-white"
            style={{ borderColor: 'var(--border)', background: 'var(--card-2)' }}
          >
            Browse professors
          </Link>
          <Link
            href="/watchlist"
            className="rounded-xl border px-4 py-2.5 text-sm font-semibold text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-300"
            style={{ borderColor: 'var(--border)', background: 'transparent' }}
          >
            Track a section
          </Link>
        </div>
      </section>

      {/* Tool cards */}
      <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
        <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
          Registration Tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {TOOLS.map(tool => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group card-warm rounded-2xl p-5"
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3"
                style={{ backgroundColor: '#CC0033' }}
              >
                {tool.icon}
              </div>
              <div className="font-bold text-white group-hover:text-[#ff4d6d] transition-colors">
                {tool.title}
              </div>
              <div className="text-sm text-zinc-500 mt-1 leading-snug">{tool.description}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* Hot courses — open seats right now */}
      {hotCourses.length > 0 && (
        <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
              Open Seats Right Now
              <span className="ml-2 font-normal text-zinc-700 normal-case tracking-normal">
                · {hotCourses[0]?.semester_name}
              </span>
            </h2>
            <Link
              href="/courses?sort=open&openonly=1"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {hotCourses.map(course => (
              <Link
                key={course.id}
                href={`/course/${course.slug}`}
                className="group relative card-warm rounded-xl overflow-hidden"
              >
                <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-green-500" />
                <div className="relative pl-5 pr-4 pt-3 pb-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span
                      className="shrink-0 text-xs font-black tracking-wider px-2 py-0.5 rounded text-white"
                      style={{ backgroundColor: '#CC0033' }}
                    >
                      {course.course_number}
                    </span>
                    <span className="text-xs font-bold text-green-400 shrink-0">
                      {course.open_count} open
                    </span>
                  </div>
                  <div className="font-semibold text-sm text-zinc-200 group-hover:text-white transition-colors leading-snug line-clamp-2">
                    {course.name}
                  </div>
                  {course.credits != null && (
                    <div className="mt-1 text-xs text-zinc-600">{course.credits} credits</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Top Rated This Semester */}
      {topRated.length > 0 && (
        <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
              Top Rated Teachers This Semester
            </h2>
            <Link
              href="/professors?sort=rating"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Browse all →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topRated.map(prof => {
              const color = prof.avg_rating >= 4 ? '#22c55e' : prof.avg_rating >= 3 ? '#f59e0b' : '#ef4444'
              const verdictStyles: Record<string, string> = {
                take: 'bg-green-950 border-green-800 text-green-400',
                depends: 'bg-amber-950 border-amber-800 text-amber-400',
                avoid: 'bg-red-950 border-red-900 text-red-400',
              }
              return (
                <Link
                  key={prof.rmp_id}
                  href={`/professor/${prof.slug}?rmpId=${prof.rmp_id}`}
                  className="relative block rounded-xl overflow-hidden hover:border-[#CC0033]/40 transition-all group"
                  style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                >
                  <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: color }} />
                  <div className="pl-4 pr-4 pt-3 pb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold text-white group-hover:text-[#CC0033] transition-colors text-sm leading-tight truncate">
                        {prof.first_name} {prof.last_name}
                      </div>
                      <div className="text-xs text-zinc-500 truncate mt-0.5">{prof.department}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <div className="text-center">
                        <div className="text-xl font-black leading-none tabular-nums" style={{ color }}>
                          {prof.avg_rating.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-zinc-600 mt-0.5">{prof.num_ratings} ratings</div>
                      </div>
                      {prof.verdict && verdictStyles[prof.verdict] && (
                        <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${verdictStyles[prof.verdict]}`}>
                          {prof.verdict.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      )}

      {/* Popular */}
      {popular.length > 0 && (
        <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider">
              Most Searched Professors
            </h2>
            <Link
              href="/professors"
              className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              All professors →
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {popular.map((prof) => (
              <ProfessorCard key={prof.id} professor={prof} compact />
            ))}
          </div>
        </section>
      )}

      {/* Rate a Professor CTA */}
      <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
        <div
          className="relative rounded-2xl overflow-hidden border p-8 text-center"
          style={{
            background: 'linear-gradient(135deg, #140f11 0%, #1a0a0e 100%)',
            borderColor: 'rgba(204,0,51,0.25)',
          }}
        >
          {/* Subtle bloom */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background: 'radial-gradient(ellipse 60% 70% at 50% 100%, rgba(204,0,51,0.10) 0%, transparent 70%)',
            }}
          />
          <div className="relative space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest px-3 py-1 rounded-full" style={{ color: '#ff4d6d', background: 'rgba(204,0,51,0.12)', border: '1px solid rgba(204,0,51,0.25)' }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
              RU Rate Reviews
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Taken a class? Rate your professor.
            </h2>
            <p className="text-zinc-400 text-sm max-w-md mx-auto">
              Your review helps Rutgers students pick better schedules. Find a professor and leave an honest rating — it takes under a minute.
            </p>
            <div className="pt-2">
              <Link
                href="/departments"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#CC0033' }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Find a professor to review
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-900 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers Registration Command Center</span>
          <div className="flex flex-wrap items-center gap-3">
            <span>Reviews from RateMyProfessors · Courses from Rutgers SOC · Not affiliated with Rutgers</span>
            <Link href="/privacy" className="hover:text-zinc-400 transition-colors underline underline-offset-2">Privacy</Link>
            <Link href="/terms" className="hover:text-zinc-400 transition-colors underline underline-offset-2">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
