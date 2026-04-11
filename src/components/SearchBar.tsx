import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, Keyboard } from 'lucide-react'

interface Props {
  initialQuery?: string
  large?: boolean
  autoFocus?: boolean
  onSearch?: (query: string) => void
}

export function SearchBar({ initialQuery = '', large, autoFocus, onSearch }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = query.trim()
    if (onSearch) {
      onSearch(trimmed)
    } else {
      if (!trimmed) {
        navigate('/')
      } else {
        navigate(`/?q=${encodeURIComponent(trimmed)}`)
      }
    }
  }

  const handleClear = () => {
    setQuery('')
    inputRef.current?.focus()
    if (onSearch) onSearch('')
  }

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
          onChange={e => setQuery(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="חפשו אמן, אלבום, ז'אנר..."
          className={`w-full h-full bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted ${
            large ? 'text-lg pr-12 pl-24' : 'text-sm pr-11 pl-20'
          } ${query ? (large ? 'pl-32' : 'pl-28') : ''}`}
          dir="auto"
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
    </form>
  )
}
