interface CoverCacheEntry {
  value: string | null
  expiresAt: number
}

const SUCCESS_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const FAILURE_CACHE_TTL_MS = 60 * 60 * 1000

const cache = new Map<string, CoverCacheEntry>()
const inflight = new Map<string, Promise<string | null>>()
const queue: Array<{ key: string; term: string; resolve: (v: string | null) => void }> = []
let active = 0
const MAX_CONCURRENT = 3

function getCachedValue(key: string): string | null | undefined {
  const cached = cache.get(key)
  if (!cached) return undefined
  if (cached.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return cached.value
}

function rememberCover(key: string, value: string | null): void {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (value ? SUCCESS_CACHE_TTL_MS : FAILURE_CACHE_TTL_MS),
  })
}

function normalizeArtworkUrl(url: string | undefined): string | null {
  if (!url) return null
  const upgraded = url
    .replace('100x100bb', '600x600bb')
    .replace('/100x100/', '/600x600/')
    .replace(/^http:\/\//i, 'https://')
  return /^https?:\/\//i.test(upgraded) ? upgraded : null
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  return fetch(url, { signal: controller.signal }).finally(() => {
    clearTimeout(timeout)
  })
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!
    active++

    const url =
      `https://itunes.apple.com/search?term=${encodeURIComponent(next.term)}&media=music&entity=album&limit=3&country=il`

    fetchWithTimeout(url, 6000)
      .then(r => r.json())
      .then((data: { results?: Array<{ artworkUrl100?: string }> }) => {
        const cover = normalizeArtworkUrl(data.results?.[0]?.artworkUrl100)
        rememberCover(next.key, cover)
        next.resolve(cover)
      })
      .catch(() => {
        rememberCover(next.key, null)
        next.resolve(null)
      })
      .finally(() => {
        active--
        inflight.delete(next.key)
        pump()
      })
  }
}

function cleanForSearch(s: string): string {
  return s
    .replace(/\(יד שנייה\)/gi, '')
    .replace(/\(used\)/gi, '')
    .replace(/\(second hand\)/gi, '')
    .replace(/:\s*\d{4}[^)]*press[^)]*$/i, '')
    .replace(/\s*[-–]\s*(lp|2lp|ep|single|vinyl|remaster|reissue).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function fetchItunesCoverForRecord(
  artist: string,
  album: string,
): Promise<string | null> {
  const cleanArtist = cleanForSearch(artist || '')
  const cleanAlbum = cleanForSearch(album || '')

  if (!cleanArtist && !cleanAlbum) return Promise.resolve(null)

  // Build a targeted search term — artist + first significant part of album title
  const shortAlbum = (cleanAlbum.split(':')[0] ?? cleanAlbum).split('(')[0]?.trim().slice(0, 60) ?? ''
  const term = [cleanArtist, shortAlbum].filter(Boolean).join(' ').slice(0, 100)

  if (term.length < 3) return Promise.resolve(null)

  const key = term.toLowerCase()

  const cached = getCachedValue(key)
  if (cached !== undefined) return Promise.resolve(cached)
  const pending = inflight.get(key)
  if (pending) return pending

  const promise = new Promise<string | null>(resolve => {
    queue.push({ key, term, resolve })
    pump()
  })

  inflight.set(key, promise)
  return promise
}
