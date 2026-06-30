import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Rutgers Professor Reviews | RU Rate',
  description: 'Read recent RU Rate student reviews for Rutgers professors and courses, with quality, difficulty, grades, and take-again signals.',
  path: '/reviews',
})

export default function ReviewsLayout({ children }: { children: React.ReactNode }) {
  return children
}
