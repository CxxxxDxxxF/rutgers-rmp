'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/courses', label: 'Courses' },
  { href: '/compare', label: 'Compare' },
  { href: '/watchlist', label: 'Watchlist' },
  { href: '/schedule', label: 'Schedule' },
]

export default function AppHeader() {
  const pathname = usePathname()

  return (
    <header className="border-b border-zinc-900 px-4 sm:px-6 py-3 sticky top-0 z-40 backdrop-blur bg-[#0a0a0a]/90">
      <div className="max-w-5xl mx-auto flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center font-black text-white text-xs"
            style={{ backgroundColor: '#CC0033' }}
          >
            RU
          </div>
          <span className="font-bold text-white tracking-tight text-sm hidden xs:inline sm:inline">
            RU Rate
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-0.5 sm:gap-1 overflow-x-auto">
          {NAV.map(item => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors ${
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
      </div>
    </header>
  )
}
