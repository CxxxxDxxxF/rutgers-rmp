// Pure mapping that prevents legacy stored contact fields from influencing
// Course Sniper delivery. The account email resolved from Supabase Auth is the
// only recipient accepted by the worker.
export function emailOnlyNotificationPolicy(row, accountEmail) {
  const email = typeof accountEmail === 'string' && accountEmail.includes('@')
    ? accountEmail.trim().toLowerCase()
    : null
  return {
    notifyEmail: email,
    notifyEmailEnabled: email !== null,
    notifyOnOpen: row.notify_on_open !== false,
    notifyOnClose: false,
  }
}
