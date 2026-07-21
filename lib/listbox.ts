// Pure keyboard-navigation logic for AppSelect (WAI-ARIA select-only
// combobox). Kept framework-free so the arrow/Home/End behavior can be
// unit-tested without React.

export type ListNavKey = 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'

export function isListNavKey(key: string): key is ListNavKey {
  return key === 'ArrowDown' || key === 'ArrowUp' || key === 'Home' || key === 'End'
}

/**
 * Next active option index for a navigation key. Clamps at the ends (no
 * wrap) so holding an arrow key parks on the first/last option, matching
 * native <select> behavior.
 */
export function moveActiveIndex(current: number, key: ListNavKey, count: number): number {
  if (count <= 0) return -1
  switch (key) {
    case 'ArrowDown':
      return current < 0 ? 0 : Math.min(current + 1, count - 1)
    case 'ArrowUp':
      return current < 0 ? count - 1 : Math.max(current - 1, 0)
    case 'Home':
      return 0
    case 'End':
      return count - 1
  }
}

/** Where the highlight starts when the menu opens: the selection, else the top. */
export function initialActiveIndex(selectedIndex: number, count: number): number {
  if (count <= 0) return -1
  return selectedIndex >= 0 && selectedIndex < count ? selectedIndex : 0
}
