export const PRODUCTION_SITE_URL = 'https://ru-rate.com'

export function resolveSiteUrl(value = process.env.NEXT_PUBLIC_APP_URL) {
  const candidate = value?.trim()
  if (!candidate) return PRODUCTION_SITE_URL

  try {
    const url = new URL(candidate)
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.origin
      : PRODUCTION_SITE_URL
  } catch {
    return PRODUCTION_SITE_URL
  }
}

export const SITE_URL = resolveSiteUrl()

export function absoluteUrl(path = '/') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${SITE_URL}${normalizedPath}`
}
