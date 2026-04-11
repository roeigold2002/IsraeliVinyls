import { fetchRecordById } from './api'
import { DEFAULT_COVER } from './constants'

const MAX_CONCURRENT_REQUESTS = 4

const resolvedCoverCache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()
const queue: Array<{ id: string; resolve: (value: string | null) => void }> = []

let activeRequests = 0

function isRealCover(url: string | null | undefined): url is string {
  const value = String(url || '').trim()
  if (!value) return false
  if (value === DEFAULT_COVER) return false
  if (value.startsWith('data:image/svg+xml;utf8,')) return false
  if (/^https?:\/\//i.test(value)) return true
  if (value.startsWith('data:image/')) return true
  return false
}

function pumpQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
    const next = queue.shift()
    if (!next) break

    activeRequests += 1

    void fetchRecordById(next.id)
      .then((record) => {
        const cover = isRealCover(record?.cover_url) ? record.cover_url : null
        resolvedCoverCache.set(next.id, cover)
        next.resolve(cover)
      })
      .catch(() => {
        resolvedCoverCache.set(next.id, null)
        next.resolve(null)
      })
      .finally(() => {
        activeRequests -= 1
        inflight.delete(next.id)
        pumpQueue()
      })
  }
}

export function shouldHydrateCover(coverUrl: string | null | undefined): boolean {
  return !isRealCover(coverUrl)
}

export function hydrateCoverForRecord(id: string): Promise<string | null> {
  if (!id) {
    return Promise.resolve(null)
  }

  if (resolvedCoverCache.has(id)) {
    return Promise.resolve(resolvedCoverCache.get(id) ?? null)
  }

  const pending = inflight.get(id)
  if (pending) {
    return pending
  }

  const request = new Promise<string | null>((resolve) => {
    queue.push({ id, resolve })
    pumpQueue()
  })

  inflight.set(id, request)
  return request
}
