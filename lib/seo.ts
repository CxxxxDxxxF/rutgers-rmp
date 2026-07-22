import type { Metadata } from 'next'
import { absoluteUrl } from './site-url'

export { absoluteUrl, PRODUCTION_SITE_URL, resolveSiteUrl, SITE_URL } from './site-url'

export function createRouteMetadata({
  title,
  description,
  path,
  noIndex = false,
}: {
  title: string
  description: string
  path: string
  noIndex?: boolean
}): Metadata {
  const url = absoluteUrl(path)

  return {
    title,
    description,
    alternates: {
      canonical: url,
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'RU Rate',
      type: 'website',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
    ...(noIndex ? { robots: { index: false, follow: false } } : {}),
  }
}
