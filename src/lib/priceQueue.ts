type Callback = (price: number, productUrl?: string) => void

interface QueueItem {
  id: string
  cb: Callback
  cancelled: boolean
}

const CONCURRENCY = 3
const cache = new Map<string, { price: number; productUrl?: string }>()
const queue: QueueItem[] = []
let active = 0

async function fetchLivePrice(id: string): Promise<{ price: number; productUrl?: string }> {
  if (cache.has(id)) return cache.get(id)!
  try {
    const res = await fetch(`/api/record?id=${encodeURIComponent(id)}`)
    if (!res.ok) throw new Error('bad response')
    const data = await res.json()
    const rec = data.record || {}
    const result = {
      price: Number(rec.price || 0),
      productUrl: rec.product_url || undefined,
    }
    cache.set(id, result)
    return result
  } catch {
    cache.set(id, { price: 0 })
    return { price: 0 }
  }
}

function processQueue() {
  while (active < CONCURRENCY && queue.length > 0) {
    const item = queue.shift()!
    active++
    fetchLivePrice(item.id).then(result => {
      active--
      if (!item.cancelled) {
        item.cb(result.price, result.productUrl)
      }
      processQueue()
    })
  }
}

export function enqueuePriceFetch(id: string, cb: Callback): () => void {
  if (cache.has(id)) {
    const cached = cache.get(id)!
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
