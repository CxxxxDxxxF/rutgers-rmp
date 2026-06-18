import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import AppHeader from '@/components/AppHeader'
import SearchBar from '@/components/SearchBar'
import ProfessorCard from '@/components/ProfessorCard'
import type { ProfessorCache } from '@/lib/supabase'

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
    href: '/departments',
    title: 'Departments',
    description: 'Browse Rutgers departments and drill into courses by subject',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V8l8-5 8 5v13M9 21v-6h6v6M4 21h16" />
      </svg>
    ),
  },
]

export default async function HomePage() {
  const popular = await getPopular()

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0a0a]">
      <AppHeader />

      {/* Hero */}
      <section className="flex flex-col items-center px-4 sm:px-6 pt-16 sm:pt-24 pb-12 text-center">
        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight mb-4">
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
            className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: '#CC0033' }}
          >
            Browse courses
          </Link>
          <Link
            href="/watchlist"
            className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500"
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
              className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
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

          <Link
            href="/departments"
            className="group bg-zinc-900 border border-zinc-800 rounded-2xl p-5 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white mb-3"
              style={{ backgroundColor: '#CC0033' }}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
              </svg>
            </div>
            <div className="font-bold text-white group-hover:text-[#ff4d6d] transition-colors">
              Professor Reviews
            </div>
            <div className="text-sm text-zinc-500 mt-1 leading-snug">
              Browse by department to find professors, read AI summaries, and leave RU Rate reviews.
            </div>
          </Link>
        </div>
      </section>

      {/* Popular */}
      {popular.length > 0 && (
        <section className="px-4 sm:px-6 pb-16 max-w-5xl mx-auto w-full">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Most Searched Professors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {popular.map((prof) => (
              <ProfessorCard key={prof.id} professor={prof} compact />
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="mt-auto border-t border-zinc-900 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers Registration Command Center</span>
          <span>Reviews from RateMyProfessors · Courses from Rutgers SOC · Not affiliated with Rutgers</span>
        </div>
      </footer>
    </div>
  )
}
