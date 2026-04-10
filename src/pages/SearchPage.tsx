import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { RecordGrid } from '../components/RecordGrid'
import { Pagination } from '../components/Pagination'
import { searchRecords, fetchStores, fetchGenres } from '../lib/api'
import { FORMATS, SORT_OPTIONS } from '../lib/constants'
import type { SearchFilters, SearchResult, Store, SortOption } from '../lib/types'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [stores, setStores] = useState<Store[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const getFilters = useCallback((): SearchFilters => ({
    query: searchParams.get('q') ?? '',
    storeIds: searchParams.getAll('store'),
    genres: searchParams.getAll('genre'),
    formats: searchParams.getAll('format'),
    priceMin: searchParams.get('pmin') ? Number(searchParams.get('pmin')) : null,
    priceMax: searchParams.get('pmax') ? Number(searchParams.get('pmax')) : null,
    yearMin: searchParams.get('ymin') ? Number(searchParams.get('ymin')) : null,
    yearMax: searchParams.get('ymax') ? Number(searchParams.get('ymax')) : null,
    sortBy: (searchParams.get('sort') as SortOption) ?? 'newest',
    page: Number(searchParams.get('page') ?? '1'),
  }), [searchParams])

  useEffect(() => {
    Promise.all([fetchStores(), fetchGenres()]).then(([s, g]) => {
      setStores(s)
      setGenres(g)
    })
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const res = await searchRecords(getFilters())
        setResult(res)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [getFilters])

  const updateParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams)
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    params.delete('page')
    setSearchParams(params)
  }

  const toggleArrayParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    const current = params.getAll(key)
    params.delete(key)
    if (current.includes(value)) {
      current.filter(v => v !== value).forEach(v => params.append(key, v))
    } else {
      [...current, value].forEach(v => params.append(key, v))
    }
    params.delete('page')
    setSearchParams(params)
  }

  const clearFilters = () => {
    const q = searchParams.get('q')
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    setSearchParams(params)
  }

  const filters = getFilters()
  const hasActiveFilters =
    filters.storeIds.length > 0 ||
    filters.genres.length > 0 ||
    filters.formats.length > 0 ||
    filters.priceMin !== null ||
    filters.priceMax !== null

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="max-w-3xl mx-auto mb-8">
        <SearchBar
          initialQuery={filters.query}
          onSearch={q => updateParam('q', q || null)}
        />
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {result && !loading && (
            <span className="text-text-secondary text-sm">
              {result.total} תוצאות
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filters.sortBy}
            onChange={e => updateParam('sort', e.target.value)}
            className="bg-bg-card border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              showFilters || hasActiveFilters
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'bg-bg-card border border-border text-text-secondary hover:text-text-primary'
            }`}
          >
            <SlidersHorizontal size={16} />
            סינון
            {hasActiveFilters && (
              <span className="bg-accent text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center">
                {filters.storeIds.length + filters.genres.length + filters.formats.length + (filters.priceMin !== null ? 1 : 0) + (filters.priceMax !== null ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="bg-bg-card border border-border rounded-2xl p-6 mb-8 animate-fade-in">
          <div className="flex items-center justify-between mb-5">
            <h3 className="font-semibold text-text-primary">סינון תוצאות</h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-sm text-accent hover:text-accent-hover"
              >
                <X size={14} />
                נקה הכל
              </button>
            )}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="text-xs text-text-muted font-medium mb-2 block">חנויות</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {stores.map(s => (
                  <button
                    key={s.id}
                    onClick={() => toggleArrayParam('store', s.id)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all ${
                      filters.storeIds.includes(s.id)
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-text-secondary hover:text-text-primary hover:bg-white/10'
                    }`}
                  >
                    {s.logo_emoji} {s.name_he}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted font-medium mb-2 block">ז'אנר</label>
              <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                {genres.map(g => (
                  <button
                    key={g}
                    onClick={() => toggleArrayParam('genre', g)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all latin-text ${
                      filters.genres.includes(g)
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-text-secondary hover:text-text-primary hover:bg-white/10'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted font-medium mb-2 block">פורמט</label>
              <div className="flex flex-wrap gap-1.5">
                {FORMATS.map(f => (
                  <button
                    key={f}
                    onClick={() => toggleArrayParam('format', f)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-all latin-text ${
                      filters.formats.includes(f)
                        ? 'bg-accent text-white'
                        : 'bg-white/5 text-text-secondary hover:text-text-primary hover:bg-white/10'
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted font-medium mb-2 block">טווח מחירים (₪)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder="מ-"
                  value={filters.priceMin ?? ''}
                  onChange={e => updateParam('pmin', e.target.value || null)}
                  className="w-full bg-white/5 border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50"
                />
                <span className="text-text-muted">-</span>
                <input
                  type="number"
                  placeholder="עד"
                  value={filters.priceMax ?? ''}
                  onChange={e => updateParam('pmax', e.target.value || null)}
                  className="w-full bg-white/5 border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <RecordGrid
        records={result?.records ?? []}
        loading={loading}
        emptyMessage={filters.query ? `לא נמצאו תוצאות עבור "${filters.query}"` : 'לא נמצאו תקליטים'}
      />

      {result && (
        <Pagination
          page={result.page}
          totalPages={result.totalPages}
          onPageChange={p => updateParam('page', String(p))}
        />
      )}
    </div>
  )
}
