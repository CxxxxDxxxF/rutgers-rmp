// Single source of truth for the primary navigation. Order is by product
// importance: Course Sniper first, then discovery paths (Courses, Professors),
// the Ranker decision tool, and Departments as a secondary browsing method.
// Compare remains last while its workflow awaits a focused redesign.
// Every surface that renders
// main navigation (desktop header, mobile strip, homepage tool grid) must
// derive from this list rather than hardcoding its own copy.

export interface NavItem {
  href: string
  label: string
  /** Compact label for the mobile nav strip; falls back to `label`. */
  shortLabel?: string
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/watchlist', label: 'Course Sniper', shortLabel: 'Sniper' },
  { href: '/courses', label: 'Courses' },
  { href: '/professors', label: 'Professors', shortLabel: 'Profs' },
  { href: '/schedule', label: 'Ranker' },
  { href: '/departments', label: 'Departments', shortLabel: 'Depts' },
  { href: '/compare', label: 'Compare' },
]

/** True when `pathname` should light up the nav item at `href`. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
