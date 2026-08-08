import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Ranker — Coming Soon | RU Rate',
  description: 'RU Rate is rebuilding its Rutgers schedule ranking experience.',
  path: '/schedule',
})

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children
}
