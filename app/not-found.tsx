import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

export default function NotFound() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />
      <main className="flex flex-col items-center justify-center px-4 py-32 text-center">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center font-black text-white text-xl mb-6 shadow-[0_0_40px_rgba(204,0,51,0.3)]"
          style={{ backgroundColor: '#CC0033' }}
        >
          404
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Page not found</h1>
        <p className="text-zinc-400 text-base max-w-md mb-8">
          That professor, course, or department might not be in our database yet — or the link is outdated.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/courses"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
            style={{ backgroundColor: '#CC0033' }}
          >
            Browse courses
          </Link>
          <Link
            href="/departments"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-200 hover:border-zinc-500 transition-colors" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            Find professors
          </Link>
          <Link
            href="/"
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-300 hover:border-zinc-500 transition-colors" style={{ border: '1px solid var(--border)' }}
          >
            Go home
          </Link>
        </div>
      </main>
    </div>
  )
}
