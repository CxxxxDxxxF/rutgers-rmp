// Single source of truth for the primary navigation. Order is by product
// importance: discovery paths first (Courses, Professors), decision tools
// next (Compare, Ranker), then the specialized Sniper utility, with
// Departments last as a secondary browsing method. Every surface that renders
// main navigation (desktop header, mobile strip, homepage tool grid) must
// derive from this list rather than hardcoding its own copy.

export interface NavItem {
  href: string
  label: string
  /** Compact label for the mobile nav strip; falls back to `label`. */
  shortLabel?: string
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/courses', label: 'Courses' },
  { href: '/professors', label: 'Professors', shortLabel: 'Profs' },
  { href: '/compare', label: 'Compare' },
  { href: '/schedule', label: 'Ranker' },
  { href: '/watchlist', label: 'Sniper' },
  { href: '/departments', label: 'Departments', shortLabel: 'Depts' },
]

/** True when `pathname` should light up the nav item at `href`. */
export function isNavItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
