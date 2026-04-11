import type { WishlistItem } from './types'

const KEY = 'vinyl-wishlist'

function safeParse(raw: string | null): WishlistItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((item) => ({
        recordId: String(item?.recordId || ''),
        addedAt: String(item?.addedAt || ''),
      }))
      .filter((item) => item.recordId)
  } catch {
    return []
  }
}

function save(items: WishlistItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function getWishlist(): WishlistItem[] {
  return safeParse(localStorage.getItem(KEY))
}

export function isInWishlist(recordId: string): boolean {
  return getWishlist().some((item) => item.recordId === recordId)
}

export function toggleWishlist(recordId: string): boolean {
  const list = getWishlist()
  const index = list.findIndex((item) => item.recordId === recordId)
  if (index >= 0) {
    list.splice(index, 1)
    save(list)
    return false
  }
  list.unshift({ recordId, addedAt: new Date().toISOString() })
  save(list)
  return true
}
