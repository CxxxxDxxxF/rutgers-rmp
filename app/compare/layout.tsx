import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Compare Rutgers Professors | RU Rate',
  description: 'Compare Rutgers professors side by side with ratings, difficulty, courses taught, student grade signals, and AI summaries.',
  path: '/compare',
})

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children
}
