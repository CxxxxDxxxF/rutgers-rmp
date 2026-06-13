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
    title: 'Course Browser',
    description: 'Browse real Rutgers courses with sections, professors, and credits',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    href: '/watchlist',
    title: 'Course Watchlist',
    description: 'Track sections you want — index numbers ready for WebReg',
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
    description: 'Stack 2–4 professors side by side — ratings, difficulty, AI verdicts',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v16M15 4v16M4 9h5M4 15h5M15 9h5M15 15h5" />
      </svg>
    ),
  },
  {
    href: '/schedule',
    title: 'Schedule Ranker',
    description: 'Paste your schedule — we rank every professor on it for you',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z" />
      </svg>
    ),
  },
  {
    href: '/departments',
    title: 'Departments',
    description: 'Browse all departments and find the best-rated professors in each',
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
        <div className="mb-4 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          Built for Rutgers registration
        </div>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight mb-4">
          <span className="text-white">Pick better</span>
          <br />
          <span style={{ color: '#CC0033' }}>Rutgers classes.</span>
        </h1>

        <p className="text-zinc-400 text-base sm:text-lg mb-10 max-w-lg">
          Real professor reviews, AI verdicts, live course sections, and a registration
          watchlist — everything you need before you touch WebReg.
        </p>

        <SearchBar />

        <p className="mt-4 text-xs text-zinc-600">
          Try a professor&apos;s name, a course number like 198:111, or a course title
        </p>
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

          <div className="bg-zinc-900/50 border border-dashed border-zinc-800 rounded-2xl p-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-zinc-500 bg-zinc-800 mb-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-4-5.7V5a2 2 0 10-4 0v.3A6 6 0 006 11v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <div className="font-bold text-zinc-400">
              Open-Section Alerts <span className="ml-1 text-[10px] font-black px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500 align-middle">SOON</span>
            </div>
            <div className="text-sm text-zinc-600 mt-1 leading-snug">
              Get notified when a watched section opens. Watchlist works today — alerts are next.
            </div>
          </div>
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
