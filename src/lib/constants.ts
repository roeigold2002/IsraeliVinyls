import type { SortOption } from './types'

export const DEFAULT_COVER =
  'https://dummyimage.com/600x600/16213e/e94560&text=VINYL'

export const FORMATS = ['Vinyl', 'LP', 'EP', '7"', '12"', 'CD', 'Cassette']

export const SORT_OPTIONS: Array<{ value: SortOption; label: string }> = [
  { value: 'newest', label: 'חדש תחילה' },
  { value: 'price_asc', label: 'מחיר: נמוך לגבוה' },
  { value: 'price_desc', label: 'מחיר: גבוה לנמוך' },
]

export const STORE_MAP: Record<string, { emoji: string; color: string }> = {
  Beatnik: { emoji: '🎸', color: '#e94560' },
  Shablool: { emoji: '🎷', color: '#0abde3' },
  'Taklit House': { emoji: '💿', color: '#2ecc71' },
  'Third Ear': { emoji: '🎵', color: '#f39c12' },
  'Disc Center': { emoji: '📀', color: '#9b59b6' },
  Tav8: { emoji: '🎶', color: '#1abc9c' },
  'Giora Records': { emoji: '🎼', color: '#3498db' },
  HaSivoov: { emoji: '🌀', color: '#fd79a8' },
  'The Vinyl Room': { emoji: '🪩', color: '#f0c040' },
  'My Records': { emoji: '📚', color: '#00b894' },
  'Vinyl Stock': { emoji: '📦', color: '#e67e22' },
  'Rolling Dise': { emoji: '🎯', color: '#6c5ce7' },
  Discogs: { emoji: '🌍', color: '#2980b9' },
}
