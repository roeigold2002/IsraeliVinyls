import type { VinylRecord } from './types'
import { getApiBase } from './api'

/**
 * Client for the real-time layer:
 *  - fetchLiveRefresh: revalidates price/stock for the records currently on
 *    screen (server fetches the store pages live, ~10-min server-side cache).
 *  - fetchLiveSearch: federated fresh listings for a query from every
 *    adapter-enabled store, deduped server-side against cached results.
 *
 * Both are fire-after-render: the UI shows instant cached results first and
 * patches in live data as it arrives.
 */

export interface LiveRefreshUpdate {
  id: string
  status: 'ok' | 'no_url' | 'unreachable'
  cached?: boolean
  price?: number | null
  in_stock?: boolean | null
  checked_at?: string
}

export interface LiveStoreStatus {
  store: string
  status: 'ok' | 'blocked' | 'no_results' | 'skipped_budget'
  cached: boolean
  count: number
}

export interface LiveSearchResult {
  records: VinylRecord[]
  stores: LiveStoreStatus[]
  elapsedMs: number
}

async function getJson<T>(path: string, signal?: AbortSignal, timeoutMs = 15000): Promise<T> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const onOuterAbort = () => controller.abort()
  signal?.addEventListener('abort', onOuterAbort)

  try {
    const res = await fetch(`${getApiBase()}${path}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`live request failed (${res.status})`)
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', onOuterAbort)
  }
}

export async function fetchLiveRefresh(
  ids: string[],
  signal?: AbortSignal
): Promise<LiveRefreshUpdate[]> {
  if (ids.length === 0) return []
  try {
    const raw = await getJson<{ updates: LiveRefreshUpdate[] }>(
      `/api/live-refresh?ids=${encodeURIComponent(ids.slice(0, 12).join(','))}`,
      signal
    )
    return raw.updates || []
  } catch {
    return [] // live refresh is best-effort; cached data remains
  }
}

export async function fetchLiveSearch(
  query: string,
  signal?: AbortSignal
): Promise<LiveSearchResult | null> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return null
  try {
    const raw = await getJson<{
      records: Record<string, unknown>[]
      stores: LiveStoreStatus[]
      elapsed_ms: number
    }>(`/api/live-search?q=${encodeURIComponent(trimmed)}`, signal, 20000)

    const records: VinylRecord[] = (raw.records || []).map((r) => ({
      id: String(r.id || ''),
      artist: String(r.artist || ''),
      album: String(r.album || ''),
      price: Number(r.price || 0),
      currency: 'ILS',
      genre: null,
      format: null,
      condition: null,
      year: null,
      cover_url: (r.cover_url as string) || null,
      product_url: (r.product_url as string) || null,
      store_url: (r.store_url as string) || null,
      store_name: String(r.store_name || ''),
      in_stock: r.in_stock === true ? true : r.in_stock === false ? false : null,
    }))

    return {
      records,
      stores: raw.stores || [],
      elapsedMs: Number(raw.elapsed_ms || 0),
    }
  } catch {
    return null // federation is progressive enhancement; never break search
  }
}

/** Applies live price/stock updates onto a list of records (immutable). */
export function applyLiveUpdates(
  records: VinylRecord[],
  updates: LiveRefreshUpdate[]
): { records: VinylRecord[]; changed: number } {
  if (updates.length === 0) return { records, changed: 0 }

  const byId = new Map(updates.filter((u) => u.status === 'ok').map((u) => [u.id, u]))
  if (byId.size === 0) return { records, changed: 0 }

  let changed = 0
  const next = records.map((record) => {
    const update = byId.get(record.id)
    if (!update) return record

    const freshPrice = update.price != null && update.price > 0 ? update.price : record.price
    const freshStock = update.in_stock != null ? update.in_stock : record.in_stock
    if (freshPrice === record.price && freshStock === record.in_stock) return record

    changed += 1
    return { ...record, price: freshPrice, in_stock: freshStock }
  })

  return { records: next, changed }
}
