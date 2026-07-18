import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Clock, Music, User } from 'lucide-react'
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
        className={`relative flex items-center bg-bg-card border transition-colors duration-150 ${
          focused ? 'border-accent' : 'border-border hover:border-border-light'
        } ${large ? 'h-14' : 'h-11'}`}
      >
        <Search
          size={large ? 18 : 16}
          strokeWidth={2}
          className={`absolute right-4 pointer-events-none transition-colors duration-150 ${
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
            large ? 'text-base pr-11 pl-28' : 'text-sm pr-10 pl-24'
          }`}
          dir="auto"
          autoComplete="off"
        />

        <div className="absolute left-1.5 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              aria-label="ניקוי"
              className="p-1.5 text-text-muted hover:text-text-primary transition-colors duration-150"
            >
              <X size={15} />
            </button>
          )}
          {!query && !focused && large && (
            <span className="mono hidden sm:inline text-[11px] text-text-muted px-2" dir="ltr">/</span>
          )}
          <button
            type="submit"
            className={`bg-accent hover:bg-accent-hover text-ink font-bold transition-colors duration-150 ${
              large ? 'px-6 h-11 text-sm' : 'px-4 h-8 text-xs'
            }`}
          >
            חיפוש
          </button>
        </div>
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute top-full w-full bg-bg-card border border-border border-t-0 z-50 overflow-hidden"
        >
          {dropdownItems.map((item, i) => (
            <button
              key={`${item.kind}-${item.value}`}
              type="button"
              onClick={() => {
                setQuery(item.value)
                submitQuery(item.value)
              }}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right transition-colors duration-150 ${
                i === activeIndex
                  ? 'bg-bg-card-hover text-text-primary'
                  : 'text-text-secondary hover:bg-bg-card-hover hover:text-text-primary'
              }`}
            >
              <span className="text-text-muted shrink-0">
                {item.kind === 'history' ? (
                  <Clock size={13} />
                ) : item.kind === 'artist' ? (
                  <User size={13} />
                ) : (
                  <Music size={13} />
                )}
              </span>
              <span className="truncate flex-1 text-right">{item.value}</span>
              <span className="eyebrow shrink-0">
                {item.kind === 'history' ? '' : item.kind === 'artist' ? 'אמן' : 'אלבום'}
              </span>
            </button>
          ))}
        </div>
      )}
    </form>
  )
}
