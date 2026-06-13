export function isAdminAuthorized(authHeader: string | null): boolean {
  const adminSecret = process.env.ADMIN_SECRET
  if (!adminSecret || !authHeader) return false
  const [scheme, token] = authHeader.split(' ')
  return scheme === 'Bearer' && token === adminSecret
}
