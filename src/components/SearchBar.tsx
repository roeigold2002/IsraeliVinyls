import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X } from 'lucide-react'

interface Props {
  initialQuery?: string
  large?: boolean
  autoFocus?: boolean
  onSearch?: (query: string) => void
}

export function SearchBar({ initialQuery = '', large, autoFocus, onSearch }: Props) {
  const [query, setQuery] = useState(initialQuery)
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
    if (onSearch) {
      onSearch(query)
    } else {
      navigate(`/search?q=${encodeURIComponent(query)}`)
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
        className={`relative flex items-center bg-bg-card border border-border rounded-2xl transition-all duration-300 focus-within:border-accent/50 focus-within:shadow-lg focus-within:shadow-accent/5 ${
          large ? 'h-16' : 'h-12'
        }`}
      >
        <Search
          size={large ? 22 : 18}
          className="absolute right-4 text-text-muted pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="חפשו אמן, אלבום, ז'אנר..."
          className={`w-full h-full bg-transparent border-none outline-none text-text-primary placeholder:text-text-muted pr-12 ${
            large ? 'text-lg pl-24' : 'text-sm pl-20'
          } ${query ? 'pl-12' : ''}`}
          dir="auto"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute left-14 p-1.5 rounded-full text-text-muted hover:text-text-primary hover:bg-white/10 transition-all"
          >
            <X size={16} />
          </button>
        )}
        <button
          type="submit"
          className={`absolute left-2 bg-accent hover:bg-accent-hover text-white font-medium rounded-xl transition-all duration-200 ${
            large ? 'px-6 py-2.5 text-sm' : 'px-4 py-1.5 text-xs'
          }`}
        >
          חיפוש
        </button>
      </div>
    </form>
  )
}
