import type { SearchFilters, SearchResult, Store, VinylRecord, SortOption } from './types'
import { STORE_MAP } from './constants'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

const STORE_ID_TO_NAME: Record<string, string> = {
  beatnik: 'Beatnik',
  shablool: 'Shablool',
  taklit_house: 'Taklit House',
  third_ear: 'Third Ear',
  disc_center: 'Disc Center',
  tav8: 'Tav8',
  giora_records: 'Giora Records',
  hasivoov: 'HaSivoov',
  vinyl_room: 'The Vinyl Room',
  my_records: 'My Records',
  vinyl_stock: 'Vinyl Stock',
  rolling_dice: 'Rolling Dise',
  rolling_dise: 'Rolling Dise',
  discogs: 'Discogs',
}

function storeIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`)
  if (!res.ok) {
    throw new Error(`API request failed (${res.status}) for ${path}`)
  }
  return (await res.json()) as T
}

function toStore(name: string, recordCount = 0, avgPrice = 0): Store {
  const known = STORE_MAP[name]
  return {
    id: storeIdFromName(name),
    name,
    name_he: name,
    logo_emoji: known?.emoji || '🎵',
    city: 'Israel',
    platform: 'Web',
    url: '#',
    color: known?.color,
    record_count: recordCount,
    avg_price: Math.round(avgPrice),
  }
}

function mapRecord(raw: Record<string, unknown>): VinylRecord {
  const storeName = String(raw.store_name || 'Unknown')
  const numericPrice = Number(raw.price || 0)
  return {
    id: String(raw.id || ''),
    artist: String(raw.artist || 'Unknown artist'),
    album: String(raw.album || 'Untitled'),
    price: Number.isFinite(numericPrice) ? numericPrice : 0,
    currency: (raw.currency as string) || 'ILS',
    genre: (raw.genre as string) || null,
    format: (raw.format as string) || null,
    condition: (raw.condition as string) || null,
    year: raw.year ? Number(raw.year) : null,
    cover_url: (raw.cover_url as string) || null,
    product_url: (raw.product_url as string) || null,
    store_url: (raw.store_url as string) || null,
    store_name: storeName,
    store: toStore(storeName),
  }
}

function sortRecords(records: VinylRecord[], sortBy: SortOption): VinylRecord[] {
  const copy = [...records]
  if (sortBy === 'price_asc') {
    copy.sort((a, b) => a.price - b.price)
  } else if (sortBy === 'price_desc') {
    copy.sort((a, b) => b.price - a.price)
  }
  return copy
}

export async function searchRecords(filters: SearchFilters): Promise<SearchResult> {
  const params = new URLSearchParams()
  params.set('page', String(filters.page || 1))
  params.set('per_page', '50')

  if (filters.query) params.set('q', filters.query)
  if (filters.genres[0]) params.set('genre', filters.genres[0])

  const selectedStoreId = filters.storeIds[0]
  if (selectedStoreId) {
    const mappedStore = STORE_ID_TO_NAME[selectedStoreId] || selectedStoreId
    params.set('store_filter', mappedStore)
  }

  const raw = await fetchJson<{
    records: Record<string, unknown>[]
    total: number
    page: number
    total_pages: number
  }>(`/api/search?${params.toString()}`)

  let records = raw.records.map(mapRecord)

  if (filters.formats.length > 0) {
    const accepted = new Set(filters.formats.map((f) => f.toLowerCase()))
    records = records.filter((r) => (r.format || '').toLowerCase() && accepted.has((r.format || '').toLowerCase()))
  }

  if (filters.priceMin !== null) records = records.filter((r) => r.price >= (filters.priceMin || 0))
  if (filters.priceMax !== null) records = records.filter((r) => r.price <= (filters.priceMax || 0))
  if (filters.yearMin !== null) records = records.filter((r) => (r.year || 0) >= (filters.yearMin || 0))
  if (filters.yearMax !== null) records = records.filter((r) => (r.year || 0) <= (filters.yearMax || 0))

  records = sortRecords(records, filters.sortBy)

  return {
    records,
    total: raw.total,
    page: raw.page,
    totalPages: raw.total_pages || 1,
  }
}

export async function fetchStores(): Promise<Store[]> {
  const raw = await fetchJson<{ stores: Array<{ name: string; record_count: number }> }>('/api/stores')
  return (raw.stores || []).map((store) => toStore(store.name, Number(store.record_count || 0), 0))
}

export async function fetchGenres(): Promise<string[]> {
  const raw = await fetchJson<{ genres: string[] }>('/api/genres')
  return raw.genres || []
}

export async function fetchFeaturedRecords(): Promise<VinylRecord[]> {
  const raw = await fetchJson<{ records: Record<string, unknown>[] }>('/api/search?page=1&per_page=18')
  return (raw.records || []).map(mapRecord).slice(0, 12)
}

export async function fetchCheapestRecords(): Promise<VinylRecord[]> {
  const raw = await fetchJson<{ records: Record<string, unknown>[] }>('/api/search?page=1&per_page=120')
  return (raw.records || []).map(mapRecord).sort((a, b) => a.price - b.price).slice(0, 12)
}

export async function fetchRecordById(id: string): Promise<VinylRecord | null> {
  const pagesToCheck = 12
  for (let page = 1; page <= pagesToCheck; page += 1) {
    const raw = await fetchJson<{ records: Record<string, unknown>[] }>('/api/all-records?page=' + page + '&per_page=500')
    const match = (raw.records || []).find((r) => String(r.id) === id)
    if (match) return mapRecord(match)
    if (!raw.records || raw.records.length < 500) break
  }
  return null
}

export async function fetchSimilarRecords(record: VinylRecord): Promise<VinylRecord[]> {
  const query = encodeURIComponent(record.artist || record.album)
  const raw = await fetchJson<{ records: Record<string, unknown>[] }>(`/api/search?q=${query}&page=1&per_page=80`)
  return (raw.records || []).map(mapRecord).filter((item) => item.id !== record.id)
}

export async function fetchRecordsByIds(ids: string[]): Promise<VinylRecord[]> {
  if (!ids.length) return []
  const wanted = new Set(ids)
  const found: VinylRecord[] = []
  const pagesToCheck = 20

  for (let page = 1; page <= pagesToCheck; page += 1) {
    const raw = await fetchJson<{ records: Record<string, unknown>[] }>('/api/all-records?page=' + page + '&per_page=500')
    const rows = raw.records || []
    rows.forEach((r) => {
      const id = String(r.id || '')
      if (wanted.has(id)) {
        found.push(mapRecord(r))
        wanted.delete(id)
      }
    })
    if (wanted.size === 0 || rows.length < 500) break
  }

  return ids.map((id) => found.find((f) => f.id === id)).filter((x): x is VinylRecord => Boolean(x))
}

export async function fetchStats(): Promise<{
  totalRecords: number
  totalStores: number
  avgPrice: number
  genreCounts: Record<string, number>
  decadeCounts: Record<string, number>
  storeStats: Array<{ id: string; name: string; name_he: string; record_count: number; avg_price: number }>
}> {
  const [dbInfo, stores, allRecords] = await Promise.all([
    fetchJson<{
      total_records: number
      genres: Record<string, number>
      store_count: number
    }>('/api/database-info'),
    fetchJson<{ stores: Array<{ name: string; record_count: number }> }>('/api/stores'),
    fetchJson<{ records: Record<string, unknown>[] }>('/api/all-records?page=1&per_page=1000'),
  ])

  const records = (allRecords.records || []).map(mapRecord)
  const withPrice = records.filter((r) => r.price > 0)
  const avgPrice = withPrice.length
    ? Math.round(withPrice.reduce((sum, r) => sum + r.price, 0) / withPrice.length)
    : 0

  const decadeCounts: Record<string, number> = {}
  records.forEach((r) => {
    if (!r.year) return
    const decade = Math.floor(r.year / 10) * 10
    const key = `${decade}s`
    decadeCounts[key] = (decadeCounts[key] || 0) + 1
  })

  const storeStats = (stores.stores || []).map((store) => {
    const storeRecords = records.filter((r) => r.store_name === store.name && r.price > 0)
    const storeAvg = storeRecords.length
      ? Math.round(storeRecords.reduce((sum, r) => sum + r.price, 0) / storeRecords.length)
      : 0
    return {
      id: storeIdFromName(store.name),
      name: store.name,
      name_he: store.name,
      record_count: Number(store.record_count || 0),
      avg_price: storeAvg,
    }
  })

  return {
    totalRecords: Number(dbInfo.total_records || 0),
    totalStores: Number(dbInfo.store_count || 0),
    avgPrice,
    genreCounts: dbInfo.genres || {},
    decadeCounts,
    storeStats,
  }
}
