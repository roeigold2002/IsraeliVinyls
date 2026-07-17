import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X, Music2, Disc3 } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { RecordGrid } from '../components/RecordGrid'
import { Pagination } from '../components/Pagination'
import { searchRecords, fetchStores, fetchGenres } from '../lib/api'
import { FORMATS, SORT_OPTIONS } from '../lib/constants'
import { buildStoreSearchUrl } from '../lib/storeCatalog'
import type { SearchFilters, SearchResult, Store, SortOption } from '../lib/types'

const PAGE_SIZE_OPTIONS = [24, 50, 100]

function normalizePerPage(value: number): number {
  if (PAGE_SIZE_OPTIONS.includes(value)) {
    return value
  }
  return 50
}

function HomeView({ onSearch }: { onSearch: (q: string) => void }) {
  return (
    <section className="min-h-[calc(100vh-12rem)] flex items-center justify-center py-6">
      <div className="w-full max-w-3xl text-center">
        <div className="mb-8 flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 rounded-full bg-accent/25 blur-2xl" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl border border-accent/35 bg-gradient-to-br from-accent/20 via-bg-card to-bg-secondary shadow-xl shadow-accent/10">
              <Disc3
                className="h-10 w-10 text-accent"
                style={{ animation: 'spin 9s linear infinite' }}
              />
              <span className="absolute -top-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white shadow-lg shadow-accent/40">
                V
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="latin-text text-3xl md:text-4xl font-black tracking-tight text-text-primary">
              Project V Vinyl Finder
            </h1>
            <p className="mx-auto max-w-xl text-sm md:text-base text-text-secondary">
              המחט יורדת, הגילוי מתחיל. מצאו תקליטים חמים מכל החנויות במקום אחד.
            </p>
          </div>
        </div>

        <SearchBar large autoFocus onSearch={onSearch} />
      </div>
    </section>
  )
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [stores, setStores] = useState<Store[]>([])
  const [genres, setGenres] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const metadataLoadedRef = useRef(false)

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
      // Queries default to relevance ranking; browsing defaults to newest.
      sortBy:
        (searchParams.get('sort') as SortOption) ??
        ((searchParams.get('q') ?? '').trim() ? 'relevance' : 'newest'),
      page: Number(searchParams.get('page') ?? '1'),
      perPage: normalizePerPage(Number(searchParams.get('per_page') ?? '50')),
    }),
    [searchParams]
  )

  const filters = getFilters()
  const hasSearchIntent =
    filters.query.trim().length > 0 ||
    filters.storeIds.length > 0 ||
    filters.genres.length > 0 ||
    filters.formats.length > 0 ||
    filters.onlyInStock ||
    filters.priceMin !== null ||
    filters.priceMax !== null ||
    filters.yearMin !== null ||
    filters.yearMax !== null

  useEffect(() => {
    if (!hasSearchIntent || metadataLoadedRef.current) return
    metadataLoadedRef.current = true
    Promise.all([fetchStores(), fetchGenres()])
      .then(([s, g]) => {
        setStores(s)
        setGenres(g)
      })
      .catch((err) => {
        metadataLoadedRef.current = false
        setLoadError(err instanceof Error ? err.message : 'Failed to load filters')
        console.error(err)
      })
  }, [hasSearchIntent])

  useEffect(() => {
    if (!hasSearchIntent) {
      setResult(null)
      setLoadError(null)
      setLoading(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)

    searchRecords(getFilters(), controller.signal)
      .then((res) => {
        setResult(res)
        setLoadError(null)
      })
      .catch((err) => {
        if (err instanceof Error && err.name === 'AbortError') return
        setLoadError(err instanceof Error ? err.message : 'Failed to load results')
        setResult(null)
        console.error(err)
      })
      .finally(() => {
        setLoading(false)
      })

    return () => controller.abort()
  }, [getFilters, hasSearchIntent])

  const updateParam = (key: string, value: string | null, options?: { resetPage?: boolean }) => {
    const params = new URLSearchParams(searchParams)
    if (value === null || value === '') {
      params.delete(key)
    } else {
      params.set(key, value)
    }
    if (options?.resetPage ?? key !== 'page') params.delete('page')
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
    filters.priceMax !== null ||
    filters.yearMin !== null ||
    filters.yearMax !== null

  const activeFilterCount =
    filters.storeIds.length +
    filters.genres.length +
    filters.formats.length +
    (filters.onlyInStock ? 1 : 0) +
    (filters.priceMin !== null ? 1 : 0) +
    (filters.priceMax !== null ? 1 : 0) +
    (filters.yearMin !== null ? 1 : 0) +
    (filters.yearMax !== null ? 1 : 0)

  const emptyMessage = filters.query
    ? `לא נמצאו תוצאות עבור "${filters.query}"`
    : 'לא נמצאו תוצאות לפי הסינון שנבחר'

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {!hasSearchIntent ? (
        <HomeView onSearch={(q) => updateParam('q', q || null)} />
      ) : (
        <>
          <div className="max-w-3xl mx-auto mb-8">
            <SearchBar
              large
              autoFocus
              instant
              initialQuery={filters.query}
              onSearch={(q) => updateParam('q', q || null)}
            />
          </div>

          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              {result && !loading && (
                <div className="flex items-center gap-2">
                  <Music2 size={15} className="text-text-muted" />
                  <span className="text-text-secondary text-sm">
                    <span className="text-text-primary font-semibold">{result.total.toLocaleString('he-IL')}</span> תוצאות
                    {filters.query && (
                      <span className="text-text-muted"> עבור "<span className="latin-text">{filters.query}</span>"</span>
                    )}
                    {result.total > 0 && (
                      <span className="text-text-muted">
                        {' '}
                        · מציג {(((result.page - 1) * result.perPage) + 1).toLocaleString('he-IL')}-
                        {Math.min(result.page * result.perPage, result.total).toLocaleString('he-IL')}
                      </span>
                    )}
                  </span>
                </div>
              )}
              {loading && (
                <div className="flex items-center gap-2 text-text-muted text-sm">
                  <div className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                  מחפש...
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filters.perPage}
                onChange={(e) => updateParam('per_page', e.target.value)}
                className="bg-bg-card border border-border rounded-xl text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50 cursor-pointer hover:border-border-light transition-colors"
                title="כמות תוצאות בעמוד"
              >
                {PAGE_SIZE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option} / עמוד
                  </option>
                ))}
              </select>

              <select
                value={filters.sortBy}
                onChange={(e) => updateParam('sort', e.target.value)}
                className="bg-bg-card border border-border rounded-xl text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50 cursor-pointer hover:border-border-light transition-colors"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                  showFilters || hasActiveFilters
                    ? 'bg-accent/15 text-accent border border-accent/30'
                    : 'bg-bg-card border border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                }`}
              >
                <SlidersHorizontal size={15} />
                סינון
                {hasActiveFilters && (
                  <span className="bg-accent text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="bg-bg-card border border-border rounded-2xl p-5 mb-6 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-text-primary text-sm">סינון תוצאות</h3>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 text-xs text-accent hover:text-accent-hover transition-colors"
                  >
                    <X size={13} />
                    נקה הכל
                  </button>
                )}
              </div>

              <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-5">
                <div>
                  <label className="text-[11px] text-text-muted font-semibold mb-2 block uppercase tracking-wide">חנויות</label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {stores.map((s) => {
                      const isBlocked = s.connectivity_status === 'blocked'
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            if (!isBlocked) toggleArrayParam('store', s.id)
                          }}
                          disabled={isBlocked}
                          className={`text-[11px] px-2.5 py-1 rounded-full transition-all border ${
                            isBlocked
                              ? 'bg-red-500/10 text-red-300 border-red-500/30 cursor-not-allowed'
                              : filters.storeIds.includes(s.id)
                                ? 'bg-accent text-white border-accent'
                                : 'bg-white/4 text-text-secondary border-transparent hover:text-text-primary hover:bg-white/8'
                          }`}
                        >
                          {s.logo_emoji} {s.name_he}
                          {isBlocked ? ' (חסום)' : s.record_count === 0 ? ' ↗' : ''}
                        </button>
                      )
                    })}
                    {stores.length === 0 && (
                      <div className="text-xs text-text-muted">טוען חנויות...</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-text-muted font-semibold mb-2 block uppercase tracking-wide">ז'אנר</label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {genres.map((g) => (
                      <button
                        key={g}
                        onClick={() => toggleArrayParam('genre', g)}
                        className={`text-[11px] px-2.5 py-1 rounded-full transition-all border latin-text ${
                          filters.genres.includes(g)
                            ? 'bg-accent text-white border-accent'
                            : 'bg-white/4 text-text-secondary border-transparent hover:text-text-primary hover:bg-white/8'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                    {genres.length === 0 && (
                      <div className="text-xs text-text-muted">טוען ז'אנרים...</div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-text-muted font-semibold mb-2 block uppercase tracking-wide">פורמט</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMATS.map((f) => (
                      <button
                        key={f}
                        onClick={() => toggleArrayParam('format', f)}
                        className={`text-[11px] px-2.5 py-1 rounded-full transition-all border latin-text ${
                          filters.formats.includes(f)
                            ? 'bg-accent text-white border-accent'
                            : 'bg-white/4 text-text-secondary border-transparent hover:text-text-primary hover:bg-white/8'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-text-muted font-semibold mb-2 block uppercase tracking-wide">מחיר (₪)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="מ-"
                      value={filters.priceMin ?? ''}
                      onChange={(e) => updateParam('pmin', e.target.value || null)}
                      className="w-full bg-white/4 border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50 placeholder:text-text-muted"
                    />
                    <span className="text-text-muted text-sm">-</span>
                    <input
                      type="number"
                      placeholder="עד"
                      value={filters.priceMax ?? ''}
                      onChange={(e) => updateParam('pmax', e.target.value || null)}
                      className="w-full bg-white/4 border border-border rounded-lg text-text-primary text-sm px-3 py-2 outline-none focus:border-accent/50 placeholder:text-text-muted"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-text-muted font-semibold mb-2 block uppercase tracking-wide">זמינות</label>
                  <button
                    onClick={() => updateParam('in_stock', filters.onlyInStock ? null : '1')}
                    className={`w-full text-sm px-3 py-2 rounded-xl border transition-all font-medium ${
                      filters.onlyInStock
                        ? 'bg-success/15 border-success/30 text-success'
                        : 'bg-white/4 border-border text-text-secondary hover:text-text-primary hover:bg-white/8'
                    }`}
                  >
                    {filters.onlyInStock ? '✓ ' : ''} רק במלאי
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-sm text-red-300 mb-6 flex items-center gap-2">
              <X size={16} className="shrink-0" />
              שגיאה בטעינת הנתונים: {loadError}
            </div>
          )}

          {selectedStoresWithoutLocalCatalog.length > 0 && (
            <div className="rounded-xl border border-accent/25 bg-accent/8 px-4 py-3 mb-6">
              <p className="text-sm text-text-primary mb-2">
                חפשו ישירות באתרי החנויות שנבחרו:
              </p>
              <div className="flex flex-wrap gap-2">
                {externalSearchTargets.map(({ store, url }) => (
                  <a
                    key={store.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-full bg-white/8 text-text-secondary hover:text-accent hover:bg-accent/10 transition-all border border-border hover:border-accent/30"
                  >
                    {store.logo_emoji} {store.name_he} ↗
                  </a>
                ))}
              </div>
            </div>
          )}

          <RecordGrid
            records={result?.records ?? []}
            loading={loading}
            emptyMessage={emptyMessage}
          />

          {result && result.totalPages > 1 && (
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
