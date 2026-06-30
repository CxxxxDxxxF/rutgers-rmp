import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Rutgers Professors | RU Rate',
  description: 'Browse Rutgers professors by rating, department, review count, and AI verdicts before choosing classes.',
  path: '/professors',
})

export default function ProfessorsLayout({ children }: { children: React.ReactNode }) {
  return children
}
