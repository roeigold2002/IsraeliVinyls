const STORAGE_KEY = 'projectv_search_history'
const MAX_HISTORY = 10

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function addSearchToHistory(query: string): void {
  const trimmed = query.trim()
  if (!trimmed) return
  try {
    const history = getSearchHistory().filter((q) => q !== trimmed)
    const updated = [trimmed, ...history].slice(0, MAX_HISTORY)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
  } catch {
    // ignore storage errors (private browsing, etc.)
  }
}

export function clearSearchHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // ignore
  }
}
