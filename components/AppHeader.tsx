'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'

const NAV = [
  { href: '/courses', label: 'Courses' },
  { href: '/departments', label: 'Departments' },
  { href: '/watchlist', label: 'Sniper' },
  { href: '/compare', label: 'Compare' },
  { href: '/schedule', label: 'Ranker' },
]

export default function AppHeader() {
  const pathname = usePathname()
  const { user, loading } = useAuth()

  async function handleSignOut() {
    if (!supabase) return
    await supabase.auth.signOut()
    window.location.href = '/'
  }

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-xl"
      style={{
        background: 'rgba(9,8,10,0.95)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        boxShadow: '0 1px 0 rgba(204,0,51,0.15)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center h-14 gap-3">

          {/* Wordmark */}
          <Link href="/" className="shrink-0 flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #CC0033 0%, #990026 100%)',
                boxShadow: '0 0 14px rgba(204,0,51,0.35)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <text
                  x="8" y="13"
                  textAnchor="middle"
                  fill="white"
                  fontSize="13"
                  fontWeight="900"
                  fontFamily="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif"
                >
                  R
                </text>
              </svg>
            </div>
            <span className="font-black tracking-tight text-base leading-none">
              <span style={{ color: '#CC0033' }}>RU</span>
              <span className="text-white"> Rate</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center ml-3">
            {NAV.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`relative px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors rounded-lg ${
                    active ? 'text-white' : 'text-zinc-500 hover:text-zinc-200'
                  }`}
                >
                  {label}
                  {active && (
                    <span
                      className="absolute left-1.5 right-1.5 -bottom-[1px] h-[2px] rounded-t"
                      style={{ background: '#CC0033' }}
                    />
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Right side */}
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/pro"
              className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-all"
              style={{
                background: pathname === '/pro' ? 'rgba(204,0,51,0.2)' : 'rgba(204,0,51,0.08)',
                border: '1px solid rgba(204,0,51,0.45)',
                color: '#ff4d6d',
              }}
            >
              <span style={{ fontSize: '9px' }}>✦</span>
              Pro
            </Link>

            {!loading && (
              user ? (
                <div className="hidden md:flex items-center gap-2 pl-2 border-l border-white/[0.07]">
                  <span className="text-[11px] text-zinc-600 max-w-[100px] truncate">{user.email}</span>
                  <button
                    onClick={handleSignOut}
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="hidden md:block text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Sign in
                </Link>
              )
            )}
          </div>
        </div>

        {/* Mobile nav */}
        <nav className="md:hidden flex gap-0.5 pb-2.5 -mx-1 px-1 overflow-x-auto">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            const short = label === 'Departments' ? 'Depts' : label
            return (
              <Link
                key={href}
                href={href}
                className={`relative flex-1 min-w-fit px-3 py-1.5 rounded-lg text-center text-xs font-semibold whitespace-nowrap transition-colors ${
                  active ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                style={active ? { background: 'rgba(255,255,255,0.05)' } : {}}
              >
                {short}
                {active && (
                  <span
                    className="absolute left-2 right-2 bottom-0 h-[2px] rounded-t"
                    style={{ background: '#CC0033' }}
                  />
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </header>
  )
}
