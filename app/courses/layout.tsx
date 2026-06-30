import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Find Rutgers Courses | RU Rate',
  description: 'Search Rutgers course sections by department, credits, campus, professor, open seats, and professor rating signals.',
  path: '/courses',
})

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return children
}
