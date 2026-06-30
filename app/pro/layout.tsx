import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'RU Rate Pro | Priority Rutgers Registration Tools',
  description: 'Join RU Rate Pro for priority Rutgers open-seat alerts, watchlists, and schedule decision tools built for registration season.',
  path: '/pro',
})

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return children
}
