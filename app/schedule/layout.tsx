import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Rutgers Schedule Professor Checker | RU Rate',
  description: 'Paste a Rutgers schedule and quickly check professor ratings, difficulty, reviews, and fit before registration.',
  path: '/schedule',
})

export default function ScheduleLayout({ children }: { children: React.ReactNode }) {
  return children
}
