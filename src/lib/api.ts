import type { SearchFilters, SearchResult, Store, VinylRecord } from './types'
import { STORE_MAP } from './constants'
import { STORE_CATALOG, getStoreById, getStoreByName, getStoreFilterNameById } from './storeCatalog'

const API_BASE_STORAGE_KEY = 'projectv_api_base_url'
const PRODUCTION_SITE_BASE_URL = 'https://israeli-vinyls-projectv.netlify.app'

function normalizeApiBase(value: string | null | undefined): string {
  if (!value) return ''
  return value.trim().replace(/\/$/, '')
}

function getRuntimeApiOverride(): string {
  if (typeof window === 'undefined') return ''

  const queryValue = new URLSearchParams(window.location.search).get('api')
  if (queryValue) {
    const normalized = normalizeApiBase(queryValue)
    try {
      window.localStorage.setItem(API_BASE_STORAGE_KEY, normalized)
    } catch {
      // Ignore storage write errors and keep the override for this request.
    }
    return normalized
  }

  try {
    const saved = window.localStorage.getItem(API_BASE_STORAGE_KEY)
    return normalizeApiBase(saved)
  } catch {
    return ''
  }
}

export function getApiBase(): string {
  const runtimeOverride = getRuntimeApiOverride()
  if (runtimeOverride) return runtimeOverride

  const envBase = normalizeApiBase(import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL || '')
  if (envBase) return envBase

  if (typeof window !== 'undefined') {
    const protocol = String(window.location.protocol || '').toLowerCase()
    if (protocol === 'file:' || protocol === 'content:') {
      // Android wrappers often load static assets from local file/content URLs.
      return PRODUCTION_SITE_BASE_URL
    }

    const host = String(window.location.hostname || '').toLowerCase()
    if (host === 'appassets.androidplatform.net' || host.endsWith('.androidplatform.net')) {
      return PRODUCTION_SITE_BASE_URL
    }
    if (host === 'israeli-vinyls-projectv.netlify.app') {
      return PRODUCTION_SITE_BASE_URL
    }
    if (host.endsWith('.netlify.app')) {
      return normalizeApiBase(window.location.origin)
    }
  }

  return ''
}

type ApiStoreSummary = {
  name: string
  record_count: number
  unique_artists?: number
  genres_represented?: number
  priced_records?: number
  avg_price?: number
  min_price?: number
  max_price?: number
  pricing_coverage_percent?: number
  pricing_status?: 'healthy' | 'degraded' | 'missing' | 'blocked' | 'no_data'
  connectivity_status?: 'enabled' | 'blocked' | 'pending'
  connectivity_note?: string
}

const storeFilterNameById = new Map<string, string>()

function storeIdFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function normalizeStoreLookup(value: string): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/["'`’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function rememberStoreFilterName(storeId: string, filterName: string): void {
  if (!storeId || !filterName) return
  storeFilterNameById.set(storeId, filterName)
}

function buildSearchNoEnrichFallbackPath(path: string): string | null {
  if (!path.startsWith('/api/search')) {
    return null
  }

  const [pathname, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  if (params.has('no_enrich')) {
    return null
  }

  params.set('no_enrich', '1')
  params.set('enrich', '0')
  return `${pathname}?${params.toString()}`
}

async function fetchJson<T>(path: string, retries = 3, delayMs = 800, signal?: AbortSignal): Promise<T> {
  let requestPath = path
  let appliedSearchFallback = false
  let lastError: Error | null = null

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    if (attempt > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs * attempt))
    }

    try {
      const requestUrl = `${getApiBase()}${requestPath}`
      const res = await fetch(requestUrl, { signal })

      const contentType = res.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')

      if (!res.ok) {
        if (!appliedSearchFallback && res.status === 504) {
          const fallbackPath = buildSearchNoEnrichFallbackPath(requestPath)
          if (fallbackPath) {
            requestPath = fallbackPath
            appliedSearchFallback = true
            continue
          }
        }

        const details = isJson
          ? JSON.stringify(await res.json())
          : (await res.text()).slice(0, 120)
        throw new Error(`API request failed (${res.status}) for ${requestPath}. ${details}`)
      }

      if (!isJson) {
        const body = await res.text()
        if (body.trimStart().startsWith('<!DOCTYPE') || body.trimStart().startsWith('<html')) {
          throw new Error(
            `API returned HTML for ${requestPath}. Configure VITE_API_BASE_URL (or VITE_API_URL) to your backend origin, or open the site with ?api=https://your-backend.example.com`
          )
        }
        throw new Error(`API response for ${requestPath} is not JSON (content-type: ${contentType || 'unknown'})`)
      }

      return (await res.json()) as T
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') throw err
      lastError = err as Error
      // Only retry network-level errors (Failed to fetch), not API errors
      if (err instanceof Error && err.message.includes('API request failed')) {
        throw err
      }
      if (attempt === retries) throw lastError
    }
  }

  throw lastError!
}

function toStore(
  name: string,
  recordCount = 0,
  avgPrice = 0,
  sourceName?: string,
  stats?: {
    unique_artists?: number
    genres_represented?: number
    priced_records?: number
    min_price?: number
    max_price?: number
    pricing_coverage_percent?: number
    pricing_status?: 'healthy' | 'degraded' | 'missing' | 'blocked' | 'no_data'
    connectivity_status?: 'enabled' | 'blocked' | 'pending'
    connectivity_note?: string
  }
): Store {
  const source = sourceName || name
  const catalogStore = getStoreByName(source) || getStoreByName(name)
  const known = STORE_MAP[catalogStore?.name || source] || STORE_MAP[source] || STORE_MAP[name]
  const id = catalogStore?.id || storeIdFromName(source)
  const filterName = catalogStore?.store_filter_name || catalogStore?.snapshot_names?.[0] || source

  rememberStoreFilterName(id, filterName)

  return {
    id,
    name: catalogStore?.name || name,
    name_he: catalogStore?.name_he || name,
    logo_emoji: catalogStore?.emoji || known?.emoji || '🎵',
    city: catalogStore?.city || 'Israel',
    platform: catalogStore?.platform || 'Web',
    url: catalogStore?.url || '#',
    color: catalogStore?.color || known?.color,
    record_count: recordCount,
    avg_price: Math.round(avgPrice),
    priced_records: Number(stats?.priced_records || 0),
    unique_artists: Number(stats?.unique_artists || 0),
    genres_represented: Number(stats?.genres_represented || 0),
    min_price: Number(stats?.min_price || 0),
    max_price: Number(stats?.max_price || 0),
    pricing_coverage_percent: Number(stats?.pricing_coverage_percent || 0),
    pricing_status: stats?.pricing_status || 'no_data',
    connectivity_status: stats?.connectivity_status || 'enabled',
    connectivity_note: stats?.connectivity_note || '',
  }
}

function mergeStoresWithCatalog(stores: ApiStoreSummary[]): Store[] {
  const merged = new Map<string, Store>()

  for (const catalogStore of STORE_CATALOG) {
    const base = toStore(catalogStore.name, 0, 0, catalogStore.name)
    merged.set(base.id, base)
  }

  for (const store of stores) {
    const sourceName = String(store.name || '').trim()
    if (!sourceName) continue

    const recordCount = Number(store.record_count || 0)
    const mappedStore = toStore(sourceName, recordCount, Number(store.avg_price || 0), sourceName, {
      unique_artists: Number(store.unique_artists || 0),
      genres_represented: Number(store.genres_represented || 0),
      priced_records: Number(store.priced_records || 0),
      min_price: Number(store.min_price || 0),
      max_price: Number(store.max_price || 0),
      pricing_coverage_percent: Number(store.pricing_coverage_percent || 0),
      pricing_status: store.pricing_status,
      connectivity_status: store.connectivity_status,
      connectivity_note: store.connectivity_note,
    })
    const previous = merged.get(mappedStore.id)

    merged.set(mappedStore.id, {
      ...(previous || mappedStore),
      ...mappedStore,
      record_count: recordCount,
    })
  }

  return [...merged.values()].sort((a, b) => {
    if (b.record_count !== a.record_count) {
      return b.record_count - a.record_count
    }
    return a.name.localeCompare(b.name)
  })
}

function buildStoreMatchKeys(store: Store): Set<string> {
  const catalogStore = getStoreById(store.id)
  const labels = [
    store.name,
    store.name_he,
    ...(catalogStore?.aliases || []),
    ...(catalogStore?.snapshot_names || []),
  ]

  return new Set(labels.map((value) => normalizeStoreLookup(value)).filter(Boolean))
}

function parseInStockValue(value: unknown): boolean | null {
  if (value === true || value === false) {
    return value
  }

  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value === 'number') {
    if (value === 1) return true
    if (value === 0) return false
    return null
  }

  const lowered = String(value).trim().toLowerCase()
  if (lowered === 'true' || lowered === '1' || lowered === 'yes') {
    return true
  }
  if (lowered === 'false' || lowered === '0' || lowered === 'no') {
    return false
  }

  return null
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
    in_stock: parseInStockValue(raw.in_stock),
    store: toStore(storeName),
  }
}

function prioritizeDisplayRecords(records: VinylRecord[]): VinylRecord[] {
  const withPriceAndCover = records.filter((r) => r.price > 0 && Boolean(r.cover_url))
  const withCoverOnly = records.filter((r) => r.price <= 0 && Boolean(r.cover_url))
  const withPriceOnly = records.filter((r) => r.price > 0 && !r.cover_url)
  const remaining = records.filter((r) => r.price <= 0 && !r.cover_url)
  return [...withPriceAndCover, ...withCoverOnly, ...withPriceOnly, ...remaining]
}

const _searchCache = new Map<string, { data: SearchResult; expiresAt: number }>()
const SEARCH_CACHE_TTL_MS = 2 * 60 * 1000

export async function searchRecords(filters: SearchFilters, signal?: AbortSignal): Promise<SearchResult> {
  const params = new URLSearchParams()
  params.set('page', String(filters.page || 1))
  params.set('per_page', String(filters.perPage || 50))

  if (filters.query) params.set('q', filters.query)
  filters.genres.filter(Boolean).forEach((genre) => params.append('genre', genre))
  filters.formats.filter(Boolean).forEach((format) => params.append('format', format))
  if (filters.onlyInStock) params.set('in_stock', '1')
  if (filters.priceMin !== null) params.set('price_min', String(filters.priceMin))
  if (filters.priceMax !== null) params.set('price_max', String(filters.priceMax))
  if (filters.yearMin !== null) params.set('year_min', String(filters.yearMin))
  if (filters.yearMax !== null) params.set('year_max', String(filters.yearMax))
  if (filters.sortBy) params.set('sort', filters.sortBy)

  const selectedStores = filters.storeIds
    .map(
      (storeId) =>
        getStoreFilterNameById(storeId) ||
        storeFilterNameById.get(storeId) ||
        storeId
    )
    .filter((storeName): storeName is string => Boolean(storeName))

  const uniqueStoreFilters = [...new Set(selectedStores)]
  uniqueStoreFilters.forEach((storeName) => {
    params.append('store_filter', storeName)
  })

  const cacheKey = params.toString()
  const cached = _searchCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data
  }

  const raw = await fetchJson<{
    records: Record<string, unknown>[]
    total: number
    page: number
    per_page: number
    total_pages: number
    has_next?: boolean
    has_prev?: boolean
  }>(`/api/search?${cacheKey}`, 3, 800, signal)

  const records = raw.records.map(mapRecord)

  const result: SearchResult = {
    records,
    total: raw.total,
    page: raw.page,
    perPage: raw.per_page || filters.perPage || 50,
    totalPages: raw.total_pages || 1,
    hasNext: Boolean(raw.has_next),
    hasPrev: Boolean(raw.has_prev),
  }

  _searchCache.set(cacheKey, { data: result, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS })
  return result
}

export async function fetchStores(): Promise<Store[]> {
  const raw = await fetchJson<{ stores: ApiStoreSummary[] }>('/api/stores')
  return mergeStoresWithCatalog(raw.stores || [])
}

export async function fetchSnapshotMeta(): Promise<{
  generated_at: string | null
  freshness_hours: number | null
  is_stale: boolean | null
  stale_after_hours: number
  pricing_integrity: {
    target_percent: number
    enabled_store_count: number
    enabled_coverage_percent: number
    meets_target: boolean
    stores_below_target: string[]
    stores_missing_prices: string[]
  } | null
  connectivity: {
    enabled_stores: number
    blocked_stores: number
    pending_stores: number
    blocked_store_names: string[]
  } | null
  asset_integrity: {
    records_with_cover: number
    coverage_percent_covers: number
  }
}> {
  return fetchJson('/api/snapshot-meta')
}

export async function verifyProductLink(url: string): Promise<{
  ok: boolean
  status: number | null
  final_url: string | null
  checked_at: string
  cached: boolean
  error?: string
}> {
  return fetchJson(`/api/link-health?url=${encodeURIComponent(url)}`, 1, 400)
}

export async function fetchGenres(): Promise<string[]> {
  const raw = await fetchJson<{ genres: string[] }>('/api/genres')
  return raw.genres || []
}

export async function fetchFeaturedRecords(): Promise<VinylRecord[]> {
  const raw = await fetchJson<{ records: Record<string, unknown>[] }>('/api/search?page=1&per_page=60')
  const mapped = (raw.records || []).map(mapRecord)
  return prioritizeDisplayRecords(mapped).slice(0, 12)
}

export async function fetchCheapestRecords(): Promise<VinylRecord[]> {
  // Server sorts by price ascending, priced records bubble to top
  const raw = await fetchJson<{ records: Record<string, unknown>[] }>('/api/search?sort=price_asc&per_page=20')
  const mapped = (raw.records || []).map(mapRecord)
  const priced = mapped.filter((r) => r.price > 0)
  if (priced.length > 0) return priced.slice(0, 12)
  // Fallback if no priced records found
  return prioritizeDisplayRecords(mapped).slice(0, 12)
}

export async function fetchRecordById(id: string, signal?: AbortSignal): Promise<VinylRecord | null> {
  try {
    const direct = await fetchJson<{ record?: Record<string, unknown> }>(`/api/record?id=${encodeURIComponent(id)}`, 2, 800, signal)
    return direct.record ? mapRecord(direct.record) : null
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    return null
  }
}

export async function fetchSimilarRecords(record: VinylRecord, signal?: AbortSignal): Promise<VinylRecord[]> {
  const query = encodeURIComponent(record.artist || record.album)
  const raw = await fetchJson<{ records: Record<string, unknown>[] }>(`/api/search?q=${query}&page=1&per_page=80`, 3, 800, signal)
  return (raw.records || []).map(mapRecord).filter((item) => item.id !== record.id)
}

export async function fetchRecordsByIds(ids: string[]): Promise<VinylRecord[]> {
  if (!ids.length) return []

  // Fast path: use the batch endpoint (single request for up to 200 IDs at a time)
  try {
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += 200) chunks.push(ids.slice(i, i + 200))
    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        fetchJson<{ records: Record<string, unknown>[]; total: number }>(
          `/api/records?ids=${encodeURIComponent(chunk.join(','))}`
        )
      )
    )
    const found = chunkResults.flatMap((r) => (r.records || []).map(mapRecord))
    return ids.map((id) => found.find((f) => f.id === id)).filter((x): x is VinylRecord => Boolean(x))
  } catch {
    // fall through to legacy pagination path
  }

  // Legacy fallback: paginate all-records
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

export async function fetchSuggestions(
  q: string,
  signal?: AbortSignal
): Promise<Array<{ type: string; value: string }>> {
  if (!q || q.trim().length < 2) return []
  try {
    const raw = await fetchJson<{ suggestions: Array<{ type: string; value: string }> }>(
      `/api/suggest?q=${encodeURIComponent(q.trim())}&limit=6`,
      1,
      200,
      signal
    )
    return raw.suggestions || []
  } catch {
    return []
  }
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
    fetchJson<{ stores: ApiStoreSummary[] }>('/api/stores'),
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

  const mergedStores = mergeStoresWithCatalog(stores.stores || [])

  const storeStats = mergedStores.map((store) => {
    const matchKeys = buildStoreMatchKeys(store)
    const storeRecords = records.filter((r) => {
      const storeName = normalizeStoreLookup(r.store_name || '')
      return matchKeys.has(storeName) && r.price > 0
    })

    const storeAvg = storeRecords.length
      ? Math.round(storeRecords.reduce((sum, r) => sum + r.price, 0) / storeRecords.length)
      : 0

    return {
      id: store.id,
      name: store.name,
      name_he: store.name_he,
      record_count: Number(store.record_count || 0),
      avg_price: storeAvg,
    }
  })

  return {
    totalRecords: Number(dbInfo.total_records || 0),
    totalStores: mergedStores.length,
    avgPrice,
    genreCounts: dbInfo.genres || {},
    decadeCounts,
    storeStats,
  }
}
