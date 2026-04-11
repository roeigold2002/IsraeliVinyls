import { useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { RecordGrid } from '../components/RecordGrid'
import { Pagination } from '../components/Pagination'
import { searchRecords, fetchStores, fetchGenres } from '../lib/api'
import { FORMATS, SORT_OPTIONS } from '../lib/constants'
import { buildStoreSearchUrl } from '../lib/storeCatalog'
import type { SearchFilters, SearchResult, Store, SortOption } from '../lib/types'

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)

  const getFilters = useCallback(
    (): SearchFilters => ({
      query: searchParams.get('q') ?? '',
      storeIds: searchParams.getAll('store'),
      genres: searchParams.getAll('genre'),
      formats: searchParams.getAll('format'),
      onlyInStock: searchParams.get('in_stock') === '1',
      priceMin: searchParams.get('pmin') ? Number(searchParams.get('pmin')) : null,
      priceMax: searchParams.get('pmax') ? Number(searchParams.get('pmax')) : null,
      yearMin: searchParams.get('ymin') ? Number(searchParams.get('ymin')) : null,
      yearMax: searchParams.get('ymax') ? Number(searchParams.get('ymax')) : null,
      sortBy: (searchParams.get('sort') as SortOption) ?? 'newest',
      page: Number(searchParams.get('page') ?? '1'),
    }),
    [searchParams]
  )

  const filters = getFilters()
  const hasQuery = filters.query.trim().length > 0

  useEffect(() => {
    if (!hasQuery) return
    if (stores.length > 0 && genres.length > 0) return

    Promise.all([fetchStores(), fetchGenres()])
      .then(([s, g]) => {
        setStores(s)
        setGenres(g)
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to load filter metadata'
        setLoadError(message)
        console.error(err)
      })
  }, [hasQuery, stores.length, genres.length])

  useEffect(() => {
    if (!hasQuery) {
      setResult(null)
      setLoadError(null)
      setLoading(false)
      return
    }

    async function load() {
      setLoading(true)
      try {
        const res = await searchRecords(getFilters())
        setResult(res)
        setLoadError(null)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load search results'
        setLoadError(message)
        setResult(null)
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [getFilters, hasQuery])

  const updateParam = (key: string, value: string | null, options?: { resetPage?: boolean }) => {
    const params = new URLSearchParams(searchParams)
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }

    const shouldResetPage = options?.resetPage ?? key !== 'page'
    if (shouldResetPage) {
      params.delete('page')
    }

    setSearchParams(params)
  }

  const toggleArrayParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams)
    const current = params.getAll(key)
    params.delete(key)
    if (current.includes(value)) {
      current.filter((v) => v !== value).forEach((v) => params.append(key, v))
    } else {
      [...current, value].forEach((v) => params.append(key, v))
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

  const selectedStores = stores.filter((store) => filters.storeIds.includes(store.id))
  const selectedStoresWithoutLocalCatalog = selectedStores.filter((store) => store.record_count === 0)
  const externalSearchTargets = selectedStoresWithoutLocalCatalog
    .map((store) => ({
      store,
      url: buildStoreSearchUrl(store.id, filters.query),
    }))
    .filter((entry): entry is { store: Store; url: string } => Boolean(entry.url))

  const hasActiveFilters =
    filters.storeIds.length > 0 ||
    filters.genres.length > 0 ||
    filters.formats.length > 0 ||
    filters.onlyInStock ||
    filters.priceMin !== null ||
    filters.priceMax !== null

  const activeFilterCount =
    filters.storeIds.length +
    filters.genres.length +
    filters.formats.length +
    (filters.onlyInStock ? 1 : 0) +
    (filters.priceMin !== null ? 1 : 0) +
    (filters.priceMax !== null ? 1 : 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-10">
      <div className="max-w-4xl mx-auto mb-8">
        <SearchBar
          large
          autoFocus
          initialQuery={filters.query}
          onSearch={(q) => updateParam('q', q || null)}
        />
      </div>

      {!hasQuery ? (
        <div className="max-w-2xl mx-auto text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/10 text-accent mb-4">
            <Search size={28} />
          </div>
          <h2 className="text-2xl font-bold text-text-primary mb-2">התחילו לחפש</h2>
          <p className="text-text-secondary">התוצאות עם העטיפות יופיעו מיד אחרי שתקלידו חיפוש</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              {result && !loading && (
                <span className="text-text-secondary text-sm">{result.total} תוצאות</span>
              )}
            </div>

            <div className="flex items-center gap-3">
              <select
                value={filters.sortBy}
                onChange={(e) => updateParam('sort', e.target.value)}
                className="bg-bg-card border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
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
                    {activeFilterCount}
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

              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
                <div>
                  <label className="text-xs text-text-muted font-medium mb-2 block">חנויות</label>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {stores.map((s) => (
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
                        {s.record_count === 0 ? ' · אתר' : ''}
                      </button>
                    ))}
                    {stores.length === 0 && (
                      <div className="text-xs text-text-muted">אין חנויות להצגה כרגע</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs text-text-muted font-medium mb-2 block">ז'אנר</label>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                    {genres.map((g) => (
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
                    {FORMATS.map((f) => (
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
                      onChange={(e) => updateParam('pmin', e.target.value || null)}
                      className="w-full bg-white/5 border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50"
                    />
                    <span className="text-text-muted">-</span>
                    <input
                      type="number"
                      placeholder="עד"
                      value={filters.priceMax ?? ''}
                      onChange={(e) => updateParam('pmax', e.target.value || null)}
                      className="w-full bg-white/5 border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-text-muted font-medium mb-2 block">זמינות</label>
                  <button
                    onClick={() => updateParam('in_stock', filters.onlyInStock ? null : '1')}
                    className={`w-full text-sm px-3 py-2 rounded-lg border transition-all ${
                      filters.onlyInStock
                        ? 'bg-accent/15 border-accent/30 text-accent'
                        : 'bg-white/5 border-border text-text-secondary hover:text-text-primary hover:bg-white/10'
                    }`}
                  >
                    רק במלאי
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 mb-6">
              שגיאה בטעינת הנתונים: {loadError}
            </div>
          )}

          {selectedStoresWithoutLocalCatalog.length > 0 && (
            <div className="rounded-xl border border-accent/30 bg-accent/10 px-4 py-3 mb-6">
              <p className="text-sm text-text-primary mb-2">
                לחלק מהחנויות שבחרתם אין עדיין קטלוג מקומי. אפשר לבצע חיפוש ישיר באתר החנות:
              </p>
              <div className="flex flex-wrap gap-2">
                {externalSearchTargets.map(({ store, url }) => (
                  <a
                    key={store.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-full bg-white/10 text-text-secondary hover:text-text-primary hover:bg-white/15 transition-all"
                  >
                    {store.logo_emoji} {store.name_he}
                  </a>
                ))}
                {externalSearchTargets.length === 0 && (
                  <span className="text-xs text-text-secondary">הקלידו חיפוש כדי ליצור קישורי חיפוש לאתרי החנויות</span>
                )}
              </div>
            </div>
          )}

          <RecordGrid
            records={result?.records ?? []}
            loading={loading}
            emptyMessage={
              selectedStoresWithoutLocalCatalog.length > 0
                ? `לא נמצאו תוצאות בקטלוג המקומי עבור "${filters.query}". נסו חיפוש ישיר באתרי החנויות למעלה.`
                : `לא נמצאו תוצאות עבור "${filters.query}"`
            }
          />

          {result && (
            <Pagination
              page={result.page}
              totalPages={result.totalPages}
              onPageChange={(p) => updateParam('page', String(p), { resetPage: false })}
            />
          )}
        </>
      )}
    </div>
  )
}
