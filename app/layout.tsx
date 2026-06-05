import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'RU Rate — Rutgers Professor Reviews',
  description: 'AI-powered professor ratings for Rutgers University students. Find out who to take and who to avoid.',
  keywords: ['Rutgers', 'professor', 'ratings', 'reviews', 'RMP', 'Rate My Professor'],
  openGraph: {
    title: 'RU Rate — Rutgers Professor Reviews',
    description: 'AI-powered professor ratings for Rutgers students.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#0a0a0a] text-white min-h-screen antialiased`}>
        {children}
      </body>
    </html>
  )
}
