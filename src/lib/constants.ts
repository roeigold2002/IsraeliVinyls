import type { SortOption } from './types'
import { STORE_VISUAL_MAP } from './storeCatalog'

export const DEFAULT_COVER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 600 600'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#16213e'/><stop offset='100%' stop-color='#0f3460'/></linearGradient></defs><rect width='600' height='600' fill='url(#g)'/><circle cx='300' cy='300' r='170' fill='none' stroke='#e94560' stroke-width='24'/><circle cx='300' cy='300' r='35' fill='#e94560'/><text x='300' y='520' fill='#ffffff' font-size='48' text-anchor='middle' font-family='Arial, sans-serif' letter-spacing='6'>VINYL</text></svg>"
  )

export const FORMATS = ['Vinyl', 'LP', 'EP', '7"', '12"', 'CD', 'Cassette']

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'חדש תחילה' },
  { value: 'price_asc', label: 'מחיר: נמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: גבוה לנמוך' },
]

export const STORE_MAP: Record<string, { emoji: string; color: string }> = {
  ...STORE_VISUAL_MAP,
  Discogs: { emoji: '🌍', color: '#2980b9' },
}
