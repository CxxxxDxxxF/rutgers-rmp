import type { Metadata } from 'next'
import Script from 'next/script'
import { Space_Grotesk } from 'next/font/google'
import CompareTray from '@/components/CompareTray'
import { SITE_URL } from '@/lib/seo'
import './globals.css'

const spaceGrotesk = Space_Grotesk({ subsets: ['latin'], weight: ['300', '400', '500', '600', '700'] })

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'RU Rate — Rutgers Registration Command Center',
  description: 'Pick better Rutgers classes. Professor ratings, AI analysis, real course sections, and a registration watchlist for Rutgers University students.',
  keywords: ['Rutgers', 'professor', 'ratings', 'reviews', 'RMP', 'Rate My Professor', 'courses', 'registration', 'WebReg', 'schedule of classes'],
  openGraph: {
    title: 'RU Rate — Rutgers Registration Command Center',
    description: 'Pick better Rutgers classes. Professor ratings, course sections, and registration tools.',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'RU Rate — Rutgers Registration Command Center',
    description: 'Pick better Rutgers classes with professor ratings, course sections, and registration tools.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.className} text-white min-h-screen antialiased`} style={{ background: 'var(--bg)' }}>
        {/* Public runtime config (Supabase URL + anon key) served fresh from
            /api/public-env and loaded before the app bundle, so the browser
            Supabase client works even if the image was built without
            NEXT_PUBLIC_* build args. See lib/public-env.ts / docs/signup.md. */}
        <Script src="/api/public-env" strategy="beforeInteractive" />
        {children}
        <CompareTray />
      </body>
    </html>
  )
}
