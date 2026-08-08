import Link from 'next/link'
import AppHeader from '@/components/AppHeader'

export default function CompareComingSoonPage() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      <AppHeader />

      <main className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-4xl items-center px-4 py-16 sm:px-6">
        <section className="w-full border-y border-white/[0.08] py-14 sm:py-20">
          <div className="mb-7 flex items-center gap-3" aria-hidden="true">
            <span className="h-px w-10 bg-[#CC0033]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.24em] text-[#ff4d6d]">
              In development
            </span>
          </div>

          <h1 className="max-w-2xl text-4xl font-black tracking-[-0.04em] text-white sm:text-6xl">
            A better way to compare is coming.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-zinc-400 sm:text-lg">
            We&apos;re rebuilding Compare around the decisions Rutgers students actually make—not just putting ratings in columns.
          </p>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/professors" className="btn-primary rounded-lg px-5 py-2.5 text-sm">
              Browse professors
            </Link>
            <Link
              href="/courses"
              className="rounded-lg border border-white/[0.1] bg-white/[0.03] px-5 py-2.5 text-sm font-semibold text-zinc-300 transition-colors hover:border-white/20 hover:text-white"
            >
              Explore courses
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
