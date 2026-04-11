export type SortOption = 'newest' | 'price_asc' | 'price_desc'

export interface Store {
  id: string
  name: string
  name_he: string
  logo_emoji: string
  city: string
  platform: string
  url: string
  color?: string
  record_count: number
  avg_price: number
  priced_records: number
  unique_artists: number
  genres_represented: number
  min_price: number
  max_price: number
}

export interface VinylRecord {
  id: string
  artist: string
  album: string
  price: number
  currency?: string | null
  genre?: string | null
  format?: string | null
  condition?: string | null
  year?: number | null
  cover_url?: string | null
  product_url?: string | null
  store_url?: string | null
  store_name?: string
  in_stock?: boolean | null
  store?: Store
}

export interface SearchFilters {
  query: string
  storeIds: string[]
  genres: string[]
  formats: string[]
  onlyInStock: boolean
  priceMin: number | null
  priceMax: number | null
  yearMin: number | null
  yearMax: number | null
  sortBy: SortOption
  page: number
}

export interface SearchResult {
  records: VinylRecord[]
  total: number
  page: number
  totalPages: number
}

export interface WishlistItem {
  recordId: string
  addedAt: string
}
