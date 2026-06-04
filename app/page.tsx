import Link from 'next/link'
import { supabase } from '@/lib/supabase'
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

export default async function HomePage() {
  const popular = await getPopular()

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-zinc-900 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-sm"
              style={{ backgroundColor: '#CC0033' }}
            >
              RU
            </div>
            <span className="font-bold text-white tracking-tight">RU Rate</span>
          </div>
          <div className="text-xs text-zinc-600">Rutgers University</div>
        </div>
      </header>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="mb-3 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-xs text-zinc-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          AI-Powered · Rutgers Only
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-4">
          <span className="text-white">Know Before</span>
          <br />
          <span style={{ color: '#CC0033' }}>You Enroll.</span>
        </h1>

        <p className="text-zinc-400 text-lg mb-10 max-w-md">
          Real reviews. AI analysis. No fluff. Find out if your Rutgers prof is worth it.
        </p>

        <SearchBar />

        <p className="mt-4 text-xs text-zinc-600">
          Type a professor&apos;s name to get started
        </p>

        <div className="mt-8 flex items-center gap-3 w-full max-w-2xl mx-auto">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs text-zinc-700">or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <Link
          href="/schedule"
          className="mt-4 group flex items-center gap-4 w-full max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
        >
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
            style={{ backgroundColor: '#CC0033' }}
          >
            📋
          </div>
          <div className="text-left">
            <div className="font-bold text-white group-hover:text-[#CC0033] transition-colors">
              Schedule Ranker
            </div>
            <div className="text-sm text-zinc-500">
              Paste your Rutgers schedule — we&apos;ll rank every professor for you
            </div>
          </div>
          <svg
            className="ml-auto w-5 h-5 text-zinc-600 group-hover:text-[#CC0033] transition-colors shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>

        <Link
          href="/departments"
          className="mt-3 group flex items-center gap-4 w-full max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-4 hover:border-[#CC0033]/50 hover:bg-zinc-800/50 transition-all"
        >
          <div
            className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg"
            style={{ backgroundColor: '#CC0033' }}
          >
            🏛️
          </div>
          <div className="text-left">
            <div className="font-bold text-white group-hover:text-[#CC0033] transition-colors">
              Browse Departments
            </div>
            <div className="text-sm text-zinc-500">
              Browse all 41 departments and find the best professors
            </div>
          </div>
          <svg
            className="ml-auto w-5 h-5 text-zinc-600 group-hover:text-[#CC0033] transition-colors shrink-0"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </section>

      {/* Popular */}
      {popular.length > 0 && (
        <section className="px-6 pb-16 max-w-5xl mx-auto w-full">
          <h2 className="text-sm font-semibold text-zinc-500 uppercase tracking-wider mb-4">
            Most Searched
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {popular.map((prof) => (
              <ProfessorCard key={prof.id} professor={prof} compact />
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t border-zinc-900 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-zinc-700">
          <span>RU Rate — Rutgers University Professor Reviews</span>
          <span>Data sourced from RateMyProfessors · Powered by Claude AI</span>
        </div>
      </footer>
    </div>
  )
}
