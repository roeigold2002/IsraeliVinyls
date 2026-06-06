type Callback = (price: number, productUrl?: string, inStock?: boolean | null) => void

interface QueueItem {
  id: string
  cb: Callback
  cancelled: boolean
}

interface CacheEntry {
  price: number
  productUrl?: string
  inStock?: boolean | null
  expiresAt: number
}

const FLUSH_DELAY_MS = 50
const BATCH_SIZE = 100
const SUCCESS_CACHE_TTL_MS = 30 * 60 * 1000
const FAILURE_CACHE_TTL_MS = 2 * 60 * 1000

const cache = new Map<string, CacheEntry>()

// id → list of pending callbacks waiting for this id
const pending = new Map<string, QueueItem[]>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function getValidCacheEntry(id: string): CacheEntry | null {
  const cached = cache.get(id)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    cache.delete(id)
    return null
  }
  return cached
}

async function fetchBatch(ids: string[]): Promise<void> {
  if (ids.length === 0) return

  // Chunk into BATCH_SIZE groups
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE)
    try {
      const res = await fetch(`/api/records?ids=${chunk.map(encodeURIComponent).join(',')}`)
      if (!res.ok) throw new Error('bad response')

      const data = await res.json()
      const records: Record<string, unknown>[] = Array.isArray(data.records) ? data.records : []

      // Build a lookup from id → record
      const byId = new Map<string, Record<string, unknown>>()
      for (const rec of records) {
        if (rec && rec.id) byId.set(String(rec.id), rec)
      }

      for (const id of chunk) {
        const rec = byId.get(id)
        const price = rec ? Number(rec.price || 0) : 0
        const productUrl = rec ? (rec.product_url as string | undefined) : undefined
        const inStock = rec
          ? rec.in_stock === true || rec.in_stock === false
            ? (rec.in_stock as boolean)
            : null
          : null

        const result: CacheEntry = {
          price: Number.isFinite(price) ? price : 0,
          productUrl,
          inStock,
          expiresAt: Date.now() + (rec ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
        }
        cache.set(id, result)

        const waiters = pending.get(id)
        if (waiters) {
          pending.delete(id)
          for (const item of waiters) {
            if (!item.cancelled) {
              item.cb(result.price, result.productUrl, result.inStock)
            }
          }
        }
      }
    } catch {
      // On failure, fire callbacks with zeros so UI doesn't hang
      for (const id of chunk) {
        cache.set(id, { price: 0, inStock: null, expiresAt: Date.now() + FAILURE_CACHE_TTL_MS })
        const waiters = pending.get(id)
        if (waiters) {
          pending.delete(id)
          for (const item of waiters) {
            if (!item.cancelled) item.cb(0, undefined, null)
          }
        }
      }
    }
  }
}

function flushPending() {
  flushTimer = null
  const ids = Array.from(pending.keys()).filter((id) => !getValidCacheEntry(id))
  // Ids that got cached between enqueue and flush — fire them immediately
  for (const id of Array.from(pending.keys())) {
    const cached = getValidCacheEntry(id)
    if (cached) {
      const waiters = pending.get(id)!
      pending.delete(id)
      for (const item of waiters) {
        if (!item.cancelled) item.cb(cached.price, cached.productUrl, cached.inStock)
      }
    }
  }
  if (ids.length > 0) {
    fetchBatch(ids)
  }
}

export function enqueuePriceFetch(id: string, cb: Callback): () => void {
  const cached = getValidCacheEntry(id)
  if (cached) {
    cb(cached.price, cached.productUrl, cached.inStock)
    return () => {}
  }

  const item: QueueItem = { id, cb, cancelled: false }
  const existing = pending.get(id)
  if (existing) {
    existing.push(item)
  } else {
    pending.set(id, [item])
  }

  if (!flushTimer) {
    flushTimer = setTimeout(flushPending, FLUSH_DELAY_MS)
  }

  return () => {
    item.cancelled = true
  }
}
