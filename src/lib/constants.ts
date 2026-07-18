import type { SortOption } from './types'
import { STORE_VISUAL_MAP } from './storeCatalog'

// Placeholder sleeve: a quiet pressed record on ink — grooves as thin rings,
// chartreuse label dot. Deliberately unbranded so real covers stay the heroes.
export const DEFAULT_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'><rect width='600' height='600' fill='#16181d'/><g fill='none' stroke='#23262c' stroke-width='1.5'><circle cx='300' cy='300' r='210'/><circle cx='300' cy='300' r='180'/><circle cx='300' cy='300' r='150'/><circle cx='300' cy='300' r='120'/></g><circle cx='300' cy='300' r='58' fill='#1b1e24'/><circle cx='300' cy='300' r='7' fill='#c9e64f'/></svg>"
  )

export const FORMATS = ['Vinyl', 'LP', 'EP', '7"', '12"', 'CD', 'Cassette']

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'חדש תחילה' },
  { value: 'relevance', label: 'רלוונטיות' },
  { value: 'price_asc', label: 'מחיר: נמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: גבוה לנמוך' },
  { value: 'year_desc', label: 'שנה: חדש לישן' },
  { value: 'year_asc', label: 'שנה: ישן לחדש' },
  { value: 'in_stock', label: 'במלאי תחילה' },
]

export const STORE_MAP: Record<string, { emoji: string; color: string }> = {
  ...STORE_VISUAL_MAP,
  Discogs: { emoji: '🌍', color: '#2980b9' },
}
