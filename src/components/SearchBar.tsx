import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Keyboard, Clock, Music, User } from 'lucide-react'
import { fetchSuggestions } from '../lib/api'
import { getSearchHistory, addSearchToHistory } from '../lib/searchHistory'

interface Props {
  initialQuery?: string
  large?: boolean
  autoFocus?: boolean
  onSearch?: (query: string) => void
  instant?: boolean
  debounceMs?: number
}

type DropdownItem =
  | { kind: 'history'; value: string }
  | { kind: 'artist'; value: string }
  | { kind: 'album'; value: string }

export function SearchBar({ initialQuery = '', large, autoFocus, onSearch, instant = false, debounceMs = 220 }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [focused, setFocused] = useState(false)
  const [dropdownItems, setDropdownItems] = useState<DropdownItem[]>([])
  const [activeIndex, setActiveIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const lastSubmittedRef = useRef(initialQuery.trim())
  const suggestAbortRef = useRef<AbortController | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    setQuery(initialQuery)
  }, [initialQuery])

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus()
    }
  }, [autoFocus])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Instant search debounce
  useEffect(() => {
    if (!onSearch || !instant) return
    const trimmed = query.trim()
    if (trimmed === lastSubmittedRef.current) return
    const timeout = window.setTimeout(() => {
      lastSubmittedRef.current = trimmed
      onSearch(trimmed)
    }, Math.max(120, debounceMs))
    return () => window.clearTimeout(timeout)
  }, [query, onSearch, instant, debounceMs])

  // Suggestions / history dropdown
  const updateDropdown = useCallback((q: string, isFocused: boolean) => {
    if (!isFocused) {
      setDropdownItems([])
      setActiveIndex(-1)
      return
    }

    if (q.trim().length < 2) {
      // Show recent history
      const history = getSearchHistory().slice(0, 5)
      setDropdownItems(history.map((v) => ({ kind: 'history' as const, value: v })))
      setActiveIndex(-1)
      suggestAbortRef.current?.abort()
      return
    }

    // Fetch suggestions from API
    suggestAbortRef.current?.abort()
    const controller = new AbortController()
    suggestAbortRef.current = controller

    const timeout = window.setTimeout(async () => {
      try {
        const suggestions = await fetchSuggestions(q.trim(), controller.signal)
        if (!controller.signal.aborted) {
          setDropdownItems(
            suggestions.map((s) => ({
              kind: s.type as 'artist' | 'album',
              value: s.value,
            }))
          )
          setActiveIndex(-1)
        }
      } catch {
        // ignore AbortError and network errors
      }
    }, 200)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [])

  useEffect(() => {
    return updateDropdown(query, focused) ?? undefined
  }, [query, focused, updateDropdown])

  const submitQuery = (value: string) => {
    const trimmed = value.trim()
    addSearchToHistory(trimmed)
    setDropdownItems([])
    setActiveIndex(-1)
    if (onSearch) {
      lastSubmittedRef.current = trimmed
      onSearch(trimmed)
    } else {
      if (!trimmed) {
        navigate('/')
      } else {
        navigate(`/?q=${encodeURIComponent(trimmed)}`)
      }
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (activeIndex >= 0 && dropdownItems[activeIndex]) {
      const item = dropdownItems[activeIndex]
      setQuery(item.value)
      submitQuery(item.value)
    } else {
      submitQuery(query)
    }
  }

  const handleClear = () => {
    setQuery('')
    setDropdownItems([])
    setActiveIndex(-1)
    inputRef.current?.focus()
    if (onSearch) {
      lastSubmittedRef.current = ''
      onSearch('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!dropdownItems.length) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, dropdownItems.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, -1))
    } else if (e.key === 'Escape') {
      setDropdownItems([])
      setActiveIndex(-1)
    }
  }

  const handleBlur = () => {
    // Delay so click on dropdown item fires first
    setTimeout(() => {
      setFocused(false)
    }, 150)
  }

  const showDropdown = focused && dropdownItems.length > 0

  return (
    <form onSubmit={handleSubmit} className="relative w-full">
      <div
        className={`relative flex items-center bg-bg-card border rounded-2xl transition-all duration-300 ${
          focused
            ? 'border-accent/60 shadow-lg shadow-accent/10 bg-bg-card-hover'
            : 'border-border hover:border-border-light'
        } ${large ? 'h-16' : 'h-12'}`}
      >
        <Search
          size={large ? 22 : 18}
          className={`absolute right-4 pointer-events-none transition-colors duration-200 ${
            focused ? 'text-accent' : 'text-text-muted'
          }`}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setActiveIndex(-1) }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder="חפשו אמן, אלבום, ז'אנר..."
          className={`w-full h-full bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted ${
            large ? 'text-lg pr-12 pl-24' : 'text-sm pr-11 pl-20'
          } ${query ? (large ? 'pl-32' : 'pl-28') : ''}`}
          dir="auto"
          autoComplete="off"
        />

        <div className="absolute left-2 flex items-center gap-2">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-white/8 transition-all"
            >
              <X size={15} />
            </button>
          )}
          {!query && !focused && large && (
            <div className="hidden sm:flex items-center gap-1 text-text-muted/50 text-xs mr-1">
              <Keyboard size={12} />
              <span>/</span>
            </div>
          )}
          <button
            type="submit"
            className={`bg-accent hover:bg-accent-hover text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-accent/20 hover:shadow-accent/40 ${
              large ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-xs'
            }`}
          >
            חיפוש
          </button>
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full mt-2 w-full bg-bg-card border border-border rounded-2xl shadow-xl shadow-black/20 z-50 overflow-hidden"
        >
          {dropdownItems.map((item, i) => (
            <button
              key={`${item.kind}-${item.value}`}
              type="button"
              onClick={() => {
                setQuery(item.value)
                submitQuery(item.value)
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right transition-colors ${
                i === activeIndex
                  ? 'bg-accent/15 text-text-primary'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              <span className="text-text-muted shrink-0">
                {item.kind === 'history' ? (
                  <Clock size={14} />
                ) : item.kind === 'artist' ? (
                  <User size={14} />
                ) : (
                  <Music size={14} />
                )}
              </span>
              <span className="truncate flex-1 text-right">{item.value}</span>
              {item.kind !== 'history' && (
                <span className="text-xs text-text-muted shrink-0">
                  {item.kind === 'artist' ? 'אמן' : 'אלבום'}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
