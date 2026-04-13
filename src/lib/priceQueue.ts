type Callback = (price: number, productUrl?: string) => void

interface QueueItem {
  id: string
  cb: Callback
  cancelled: boolean
}

interface CacheEntry {
  price: number
  productUrl?: string
  expiresAt: number
}

const CONCURRENCY = 3
const SUCCESS_CACHE_TTL_MS = 30 * 60 * 1000
const FAILURE_CACHE_TTL_MS = 2 * 60 * 1000
const MAX_RETRIES = 2
const RETRY_BASE_DELAY_MS = 350

const cache = new Map<string, CacheEntry>()
const queue: QueueItem[] = []
let active = 0

function getValidCacheEntry(id: string): CacheEntry | null {
  const cached = cache.get(id)
  if (!cached) return null
  if (cached.expiresAt <= Date.now()) {
    cache.delete(id)
    return null
  }
  return cached
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function fetchLivePrice(id: string): Promise<{ price: number; productUrl?: string }> {
  const cached = getValidCacheEntry(id)
  if (cached) {
    return {
      price: cached.price,
      productUrl: cached.productUrl,
    }
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const res = await fetch(`/api/record?id=${encodeURIComponent(id)}`)
      if (!res.ok) throw new Error('bad response')

      const data = await res.json()
      const rec = data.record || {}
      const parsedPrice = Number(rec.price || 0)

      const result = {
        price: Number.isFinite(parsedPrice) ? parsedPrice : 0,
        productUrl: rec.product_url || undefined,
      }

      cache.set(id, {
        ...result,
        expiresAt: Date.now() + SUCCESS_CACHE_TTL_MS,
      })

      return result
    } catch {
      if (attempt < MAX_RETRIES) {
        await wait(RETRY_BASE_DELAY_MS * (attempt + 1))
      }
    }
  }

  cache.set(id, {
    price: 0,
    expiresAt: Date.now() + FAILURE_CACHE_TTL_MS,
  })
  return { price: 0 }
}

function processQueue() {
  while (active < CONCURRENCY && queue.length > 0) {
    const item = queue.shift()!
    active++
    fetchLivePrice(item.id)
      .then((result) => {
        if (!item.cancelled) {
          item.cb(result.price, result.productUrl)
        }
      })
      .catch(() => {
        if (!item.cancelled) {
          item.cb(0)
        }
      })
      .finally(() => {
        active--
        processQueue()
      })
  }
}

export function enqueuePriceFetch(id: string, cb: Callback): () => void {
  const cached = getValidCacheEntry(id)
  if (cached) {
    cb(cached.price, cached.productUrl)
    return () => {}
  }

  const item: QueueItem = { id, cb, cancelled: false }
  queue.push(item)
  processQueue()

  return () => {
    item.cancelled = true
  }
}
