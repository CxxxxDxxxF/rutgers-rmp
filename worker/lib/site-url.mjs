export const PRODUCTION_SITE_URL = 'https://ru-rate.com'

export function resolveAppBaseUrl(value) {
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
