import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import CompareTray from '@/components/CompareTray'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'RU Rate — Rutgers Registration Command Center',
  description: 'Pick better Rutgers classes. Professor ratings, AI analysis, real course sections, and a registration watchlist for Rutgers University students.',
  keywords: ['Rutgers', 'professor', 'ratings', 'reviews', 'RMP', 'Rate My Professor', 'courses', 'registration', 'WebReg', 'schedule of classes'],
  openGraph: {
    title: 'RU Rate — Rutgers Registration Command Center',
    description: 'Pick better Rutgers classes. Professor ratings, course sections, and registration tools.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0a0a0a] text-white min-h-screen antialiased`}>
        {children}
        <CompareTray />
      </body>
    </html>
  )
}
