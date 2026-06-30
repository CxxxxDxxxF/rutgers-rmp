export interface SemesterLike {
  slug: string | null
  code?: string | null
  is_current?: boolean
}

const SOC_TERM_TO_SLUG_PREFIX: Record<string, string> = {
  '1': 's',
  '7': 'u',
  '9': 'f',
}

export function getSemesterLookupAliases(value: string | null | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) return []

  const aliases = new Set<string>([trimmed, trimmed.toLowerCase(), trimmed.toUpperCase()])
  const socMatch = trimmed.match(/^([179])(\d{4})$/)
  if (socMatch) {
    const [, term, year] = socMatch
    const prefix = SOC_TERM_TO_SLUG_PREFIX[term]
    if (prefix) {
      aliases.add(`${prefix}${year}`)
      aliases.add(`${prefix.toUpperCase()}${year}`)
    }
  }

  return [...aliases].filter(alias => /^[a-z0-9-]{1,32}$/i.test(alias))
}

export function resolveSemesterParam<T extends SemesterLike>(
  value: string | null | undefined,
  semesters: T[],
) {
  const aliases = getSemesterLookupAliases(value)
  if (aliases.length === 0) return null

  const slugAliases = new Set(aliases.map(alias => alias.toLowerCase()))
  const codeAliases = new Set(aliases.map(alias => alias.toUpperCase()))

  return semesters.find(semester => {
    const slug = semester.slug?.toLowerCase()
    const code = semester.code?.toUpperCase()
    return (slug != null && slugAliases.has(slug)) || (code != null && codeAliases.has(code))
  }) ?? null
}
