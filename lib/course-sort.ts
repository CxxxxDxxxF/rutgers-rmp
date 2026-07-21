// Sort options for the course browser. Values are stable — they deep-link
// via ?sort= — so only labels may change. 'number' is the API's default
// order and is treated as "no sort param" in the URL.

export type CourseSortKey = 'number' | 'open' | 'rating'

export const COURSE_SORT_OPTIONS: { value: CourseSortKey; label: string }[] = [
  { value: 'number', label: 'Course #' },
  { value: 'open', label: 'Most Open' },
  { value: 'rating', label: 'Best Professor' },
]
