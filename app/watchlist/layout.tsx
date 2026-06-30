import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Rutgers Course Watchlist | RU Rate',
  description: 'Track Rutgers course sections, open-seat status, professor context, and registration alerts from one watchlist.',
  path: '/watchlist',
})

export default function WatchlistLayout({ children }: { children: React.ReactNode }) {
  return children
}
