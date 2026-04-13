import { fetchRecordById } from './api'
import { DEFAULT_COVER } from './constants'

const MAX_CONCURRENT_REQUESTS = 4

interface CoverCacheEntry {
  value: string | null
  expiresAt: number
}

const SUCCESS_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000

const resolvedCoverCache = new Map<string, CoverCacheEntry>()
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

function readCachedCover(id: string): string | null | undefined {
  const cached = resolvedCoverCache.get(id)
  if (!cached) return undefined
  if (cached.expiresAt <= Date.now()) {
    resolvedCoverCache.delete(id)
    return undefined
  }
  return cached.value
}

function rememberCover(id: string, value: string | null): void {
  resolvedCoverCache.set(id, {
    value,
    expiresAt: Date.now() + (value ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
  })
}

function pumpQueue() {
  while (activeRequests < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
    const next = queue.shift()
    if (!next) break

    activeRequests += 1

    void fetchRecordById(next.id)
      .then((record) => {
        const cover = isRealCover(record?.cover_url) ? record.cover_url : null
        rememberCover(next.id, cover)
        next.resolve(cover)
      })
      .catch(() => {
        rememberCover(next.id, null)
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
    const cached = readCachedCover(id)
    if (cached !== undefined) {
      return Promise.resolve(cached)
    }
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
