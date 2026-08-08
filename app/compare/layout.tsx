import { createRouteMetadata } from '@/lib/seo'

export const metadata = createRouteMetadata({
  title: 'Compare — Coming Soon | RU Rate',
  description: 'RU Rate is rebuilding its Rutgers professor comparison experience.',
  path: '/compare',
})

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children
}
