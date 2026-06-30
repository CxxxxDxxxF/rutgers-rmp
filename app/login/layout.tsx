import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Sign In | RU Rate',
  description: 'Sign in to RU Rate to save professor comparisons, manage course watchlists, and access Rutgers registration tools.',
  path: '/login',
  noIndex: true,
})

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children
}
