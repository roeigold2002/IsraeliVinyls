import type { WishlistItem } from './types'

const KEY = 'vinyl-wishlist'
const WISHLIST_EVENT = 'vinyl-wishlist-changed'

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
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Ignore storage write failures (private mode / quota exceeded).
  }

  // Notify same-tab listeners; storage event only fires cross-tab.
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(WISHLIST_EVENT))
  }
}

export function getWishlist(): WishlistItem[] {
  try {
    return safeParse(localStorage.getItem(KEY))
  } catch {
    return []
  }
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

export function clearWishlist(): void {
  save([])
}

export function subscribeWishlist(onChange: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }

  const handleStorage = (event: StorageEvent) => {
    if (!event.key || event.key === KEY) {
      onChange()
    }
  }

  const handleCustom = () => onChange()

  window.addEventListener('storage', handleStorage)
  window.addEventListener(WISHLIST_EVENT, handleCustom)

  return () => {
    window.removeEventListener('storage', handleStorage)
    window.removeEventListener(WISHLIST_EVENT, handleCustom)
  }
}
