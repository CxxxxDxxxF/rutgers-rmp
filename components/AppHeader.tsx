'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import { useWatchlistSync } from '@/lib/watchlist-client'

// Order: discovery (Courses, Professors) → decision tools (Compare, Ranker)
// → utilities (Sniper) → secondary browsing (Departments). Single source of
// truth — desktop and mobile nav both render from this array.
const NAV = [
  { href: '/courses', label: 'Courses' },
  { href: '/professors', label: 'Professors' },
  { href: '/compare', label: 'Compare' },
  { href: '/schedule', label: 'Ranker' },
  { href: '/watchlist', label: 'Sniper' },
  { href: '/departments', label: 'Departments' },
]

export default function AppHeader() {
  const pathname = usePathname()
  const { user, loading } = useAuth()
  useWatchlistSync()

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

          {/* Brand lockup — icon + wordmark read as one clickable unit */}
          <Link
            href="/"
            aria-label="RU Rate home"
            className="shrink-0 flex items-center gap-3"
          >
            <span
              aria-hidden="true"
              className="flex h-8 w-8 items-center justify-center rounded-lg sm:h-9 sm:w-9"
              style={{
                background: 'linear-gradient(135deg, #CC0033 0%, #990026 100%)',
                boxShadow: '0 2px 6px rgba(204,0,51,0.25)',
              }}
            >
              <span className="text-base font-black leading-none text-white sm:text-lg">R</span>
            </span>
            <span className="text-lg font-black leading-none tracking-tight">
              <span style={{ color: '#CC0033' }}>RU</span>
              <span className="ml-1 text-white">Rate</span>
            </span>
          </Link>

          {/* Desktop nav — centered in the space between lockup and actions */}
          <nav className="hidden lg:flex flex-1 items-center justify-center gap-0.5">
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
          <div className="ml-auto lg:ml-0 flex shrink-0 items-center gap-2">
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
                <div className="hidden lg:flex items-center gap-2 pl-2 border-l border-white/[0.07]">
                  <Link
                    href="/account"
                    className="text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors max-w-[100px] truncate"
                    title={user.email}
                  >
                    {user.email}
                  </Link>
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
                  className="hidden lg:block text-xs font-medium text-zinc-400 hover:text-white transition-colors"
                >
                  Sign in
                </Link>
              )
            )}
          </div>
        </div>

        {/* Mobile / tablet nav — same NAV order as desktop */}
        <nav className="lg:hidden flex gap-0.5 pb-2.5 -mx-1 px-1 overflow-x-auto">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`)
            const short = label === 'Departments' ? 'Depts' : label === 'Professors' ? 'Profs' : label
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
          {!loading && (
            user ? (
              <Link
                href="/account"
                className={`relative flex-1 min-w-fit px-3 py-1.5 rounded-lg text-center text-xs font-semibold whitespace-nowrap transition-colors ${
                  pathname === '/account' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                style={pathname === '/account' ? { background: 'rgba(255,255,255,0.05)' } : {}}
              >
                Account
                {pathname === '/account' && (
                  <span
                    className="absolute left-2 right-2 bottom-0 h-[2px] rounded-t"
                    style={{ background: '#CC0033' }}
                  />
                )}
              </Link>
            ) : (
              <Link
                href="/login"
                className="flex-1 min-w-fit px-3 py-1.5 rounded-lg text-center text-xs font-semibold whitespace-nowrap text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Sign in
              </Link>
            )
          )}
        </nav>
      </div>
    </header>
  )
}
