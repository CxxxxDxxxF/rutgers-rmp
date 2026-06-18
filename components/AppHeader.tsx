'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/courses', label: 'Courses', short: 'Courses' },
  { href: '/departments', label: 'Departments', short: 'Depts' },
  { href: '/watchlist', label: 'Sniper', short: 'Sniper' },
  { href: '/compare', label: 'Compare', short: 'Compare' },
  { href: '/schedule', label: 'Ranker', short: 'Ranker' },
]

export default function AppHeader() {
  const pathname = usePathname()

  return (
    <header className="border-b border-zinc-900 px-4 sm:px-6 py-3 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/92">
      <div className="max-w-6xl mx-auto flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-black text-white text-xs shadow-[0_0_24px_rgba(204,0,51,0.24)]"
            style={{ backgroundColor: '#CC0033' }}
          >
            RU
          </div>
          <span className="font-bold text-white tracking-tight text-sm sm:text-base">RU Rate</span>
        </Link>

        <nav className="ml-auto hidden md:flex items-center gap-1">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  active
                    ? 'text-white bg-zinc-800'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <Link
          href="/pro"
          className={`ml-auto md:ml-2 rounded-lg border px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors ${
            pathname === '/pro'
              ? 'border-[#CC0033]/60 bg-[#CC0033]/15 text-[#ff4d6d]'
              : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-zinc-500 hover:text-white'
          }`}
        >
          Pro
        </Link>
      </div>

      <nav className="md:hidden mt-3 -mx-1 flex items-center gap-1 overflow-x-auto px-1">
        {NAV.map(item => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 min-w-fit px-3 py-2 rounded-lg text-center text-xs font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'text-white bg-zinc-800'
                  : 'text-zinc-400 bg-zinc-950 hover:text-white'
              }`}
            >
              {item.short}
            </Link>
          )
        })}
      </nav>
    </header>
  )
}
