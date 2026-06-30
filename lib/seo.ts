import type { Metadata } from 'next'

const FALLBACK_SITE_URL = 'https://rurate-web-production.up.railway.app'

export function resolveSiteUrl(value = process.env.NEXT_PUBLIC_APP_URL) {
  const trimmed = value?.trim().replace(/\/+$/, '')
  return trimmed && /^https?:\/\//.test(trimmed) ? trimmed : FALLBACK_SITE_URL
}

export const SITE_URL = resolveSiteUrl()

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalizedPath}`
}

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
