import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'RU Rate Pro Waitlist | Rutgers Registration Tools',
  description: 'Join the RU Rate Pro waitlist for priority Rutgers open-seat alerts, watchlists, and schedule decision tools as checkout becomes available.',
  path: '/pro',
})

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return children
}
