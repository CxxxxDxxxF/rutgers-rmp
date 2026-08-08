export interface PublicSystemHealth {
  rutgers_soc: {
    available: boolean
    checked_at: string
    last_success_at: string | null
  } | null
}

export function shouldShowRutgersStatusNotice(health: PublicSystemHealth | null) {
  return health?.rutgers_soc?.available === false
}
