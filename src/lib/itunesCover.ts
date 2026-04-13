const cache = new Map<string, string | null>()
const inflight = new Map<string, Promise<string | null>>()
const queue: Array<{ key: string; term: string; resolve: (v: string | null) => void }> = []
let active = 0
const MAX_CONCURRENT = 3

function pump() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    const next = queue.shift()!
    active++

    const url =
      `https://itunes.apple.com/search?term=${encodeURIComponent(next.term)}&media=music&entity=album&limit=3&country=il`

    fetch(url, { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then((data: { results?: Array<{ artworkUrl100?: string }> }) => {
        const artwork = data.results?.[0]?.artworkUrl100
        const cover = artwork
          ? artwork.replace('100x100bb', '600x600bb').replace('/100x100/', '/600x600/')
          : null
        cache.set(next.key, cover)
        next.resolve(cover)
      })
      .catch(() => {
        cache.set(next.key, null)
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

  if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null)
  const pending = inflight.get(key)
  if (pending) return pending

  const promise = new Promise<string | null>(resolve => {
    queue.push({ key, term, resolve })
    pump()
  })

  inflight.set(key, promise)
  return promise
}
