import { useEffect, useState, useCallback, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { SlidersHorizontal, X, Radio, RefreshCw } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { RecordGrid } from '../components/RecordGrid'
import { Pagination } from '../components/Pagination'
import { searchRecords, fetchStores, fetchGenres } from '../lib/api'
import {
  fetchLiveRefresh,
  fetchLiveSearch,
  applyLiveUpdates,
  type LiveSearchResult,
} from '../lib/liveSearch'
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
    <section className="min-h-[calc(100vh-16rem)] flex items-center py-16">
      <div className="w-full max-w-2xl mx-auto">
        <p className="eyebrow mb-5">מנוע השוואת תקליטים · ישראל</p>

        <h1 className="text-[34px] sm:text-5xl font-bold tracking-tight text-text-primary leading-[1.12] mb-3">
          כל תקליט שנמכר בארץ.
          <br />
          המחיר האמיתי שלו, עכשיו.
        </h1>

        <p className="text-[15px] text-text-secondary leading-relaxed mb-10 max-w-md">
          חיפוש אחד סורק את כל חנויות הוויניל בישראל, מצליב מחירים
          ומאמת אותם מול החנות ברגע החיפוש.
        </p>

        <SearchBar large autoFocus onSearch={onSearch} />

        <div className="mono flex items-center gap-5 mt-6 text-[11px] text-text-muted" dir="ltr">
          <span>97,000+ records</span>
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          <span>20 stores</span>
          <span className="w-px h-3 bg-border" aria-hidden="true" />
          <span>live-verified prices</span>
        </div>
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
  // Real-time layer state
  const [refreshing, setRefreshing] = useState(false)
  const [refreshedCount, setRefreshedCount] = useState<number | null>(null)
  const [liveResult, setLiveResult] = useState<LiveSearchResult | null>(null)
  const [liveLoading, setLiveLoading] = useState(false)

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
    setLiveResult(null)
    setRefreshedCount(null)

    searchRecords(getFilters(), controller.signal)
      .then((res) => {
        setResult(res)
        setLoadError(null)

        // Tier 2 — live revalidation: re-fetch price/stock for the visible
        // page directly from the stores, then patch results in place.
        const visibleIds = res.records.slice(0, 12).map((r) => r.id)
        if (visibleIds.length > 0) {
          setRefreshing(true)
          void fetchLiveRefresh(visibleIds, controller.signal)
            .then((updates) => {
              if (controller.signal.aborted) return
              setResult((prev) => {
                if (!prev) return prev
                const { records, changed } = applyLiveUpdates(prev.records, updates)
                setRefreshedCount(changed)
                return changed > 0 ? { ...prev, records } : prev
              })
            })
            .finally(() => {
              if (!controller.signal.aborted) setRefreshing(false)
            })
        }
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

  // Tier 3 — live federation: query every store's own search endpoint for
  // fresh listings the catalog doesn't have yet. Progressive: cached results
  // render first, live finds stream in below.
  const liveQuery = filters.query.trim()
  useEffect(() => {
    if (liveQuery.length < 2) {
      setLiveResult(null)
      return
    }

    const controller = new AbortController()
    setLiveLoading(true)

    void fetchLiveSearch(liveQuery, controller.signal)
      .then((live) => {
        if (controller.signal.aborted) return
        setLiveResult(live)
        // Stores without a search endpoint return live verifications of
        // catalog records instead of new listings — patch those in place.
        if (live && live.verified.length > 0) {
          setResult((prev) => {
            if (!prev) return prev
            const { records, changed } = applyLiveUpdates(prev.records, live.verified)
            return changed > 0 ? { ...prev, records } : prev
          })
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLiveLoading(false)
      })

    return () => controller.abort()
  }, [liveQuery])

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
                  <span className="text-text-secondary text-sm">
                    <span className="mono text-text-primary font-semibold">{result.total.toLocaleString('he-IL')}</span> תוצאות
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
              {!loading && refreshing && (
                <span className="flex items-center gap-1.5 text-[11px] text-text-muted" title="בודק מחירים עדכניים מהחנויות">
                  <RefreshCw size={11} className="animate-spin" />
                  מעדכן מחירים…
                </span>
              )}
              {!loading && !refreshing && refreshedCount !== null && (
                <span className="flex items-center gap-1.5 text-[11px] text-accent" title="המחירים והמלאי אומתו מול אתרי החנויות">
                  <span className="w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
                  {refreshedCount > 0 ? `${refreshedCount} מחירים עודכנו` : 'המחירים מאומתים'}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={filters.perPage}
                onChange={(e) => updateParam('per_page', e.target.value)}
                className="bg-transparent border border-border text-text-secondary text-[13px] px-3 py-2 outline-none focus:border-accent cursor-pointer hover:text-text-primary hover:border-border-light transition-colors duration-150"
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
                className="bg-transparent border border-border text-text-secondary text-[13px] px-3 py-2 outline-none focus:border-accent cursor-pointer hover:text-text-primary hover:border-border-light transition-colors duration-150"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-2 border text-[13px] font-medium transition-colors duration-150 ${
                  showFilters || hasActiveFilters
                    ? 'border-accent text-accent'
                    : 'border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                }`}
              >
                <SlidersHorizontal size={14} />
                סינון
                {hasActiveFilters && (
                  <span className="mono bg-accent text-ink text-[10px] min-w-4 h-4 px-1 flex items-center justify-center font-semibold" dir="ltr">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {showFilters && (
            <div className="bg-bg-secondary border border-border p-5 mb-8 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="eyebrow">סינון תוצאות</h3>
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
                  <label className="eyebrow mb-2 block">חנויות</label>
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
                          className={`text-[11.5px] px-2.5 py-1 transition-colors duration-150 border ${
                            isBlocked
                              ? 'text-text-muted border-border cursor-not-allowed line-through'
                              : filters.storeIds.includes(s.id)
                                ? 'bg-accent text-ink border-accent font-semibold'
                                : 'text-text-secondary border-border hover:text-text-primary hover:border-border-light'
                          }`}
                        >
                          {s.name_he}
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
                  <label className="eyebrow mb-2 block">ז'אנר</label>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto">
                    {genres.map((g) => (
                      <button
                        key={g}
                        onClick={() => toggleArrayParam('genre', g)}
                        className={`text-[11.5px] px-2.5 py-1 transition-colors duration-150 border latin-text ${
                          filters.genres.includes(g)
                            ? 'bg-accent text-ink border-accent font-semibold'
                            : 'text-text-secondary border-border hover:text-text-primary hover:border-border-light'
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
                  <label className="eyebrow mb-2 block">פורמט</label>
                  <div className="flex flex-wrap gap-1.5">
                    {FORMATS.map((f) => (
                      <button
                        key={f}
                        onClick={() => toggleArrayParam('format', f)}
                        className={`text-[11.5px] px-2.5 py-1 transition-colors duration-150 border latin-text ${
                          filters.formats.includes(f)
                            ? 'bg-accent text-ink border-accent font-semibold'
                            : 'text-text-secondary border-border hover:text-text-primary hover:border-border-light'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="eyebrow mb-2 block">מחיר (₪)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      placeholder="מ-"
                      value={filters.priceMin ?? ''}
                      onChange={(e) => updateParam('pmin', e.target.value || null)}
                      className="mono w-full bg-transparent border border-border text-text-primary text-sm px-3 py-2 outline-none focus:border-accent placeholder:text-text-muted"
                    />
                    <span className="text-text-muted text-sm">-</span>
                    <input
                      type="number"
                      placeholder="עד"
                      value={filters.priceMax ?? ''}
                      onChange={(e) => updateParam('pmax', e.target.value || null)}
                      className="mono w-full bg-transparent border border-border text-text-primary text-sm px-3 py-2 outline-none focus:border-accent placeholder:text-text-muted"
                    />
                  </div>
                </div>

                <div>
                  <label className="eyebrow mb-2 block">זמינות</label>
                  <button
                    onClick={() => updateParam('in_stock', filters.onlyInStock ? null : '1')}
                    className={`w-full text-[13px] px-3 py-2 border transition-colors duration-150 font-medium ${
                      filters.onlyInStock
                        ? 'bg-accent text-ink border-accent font-semibold'
                        : 'border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                    }`}
                  >
                    {filters.onlyInStock ? '✓ ' : ''} רק במלאי
                  </button>
                </div>
              </div>
            </div>
          )}

          {loadError && (
            <div className="border border-error/40 border-r-2 border-r-error px-4 py-3 text-sm text-error mb-6">
              שגיאה בטעינת הנתונים: {loadError}
            </div>
          )}

          {selectedStoresWithoutLocalCatalog.length > 0 && (
            <div className="border border-border px-4 py-3 mb-8">
              <p className="text-[13px] text-text-secondary mb-2.5">
                חפשו ישירות באתרי החנויות שנבחרו:
              </p>
              <div className="flex flex-wrap gap-2">
                {externalSearchTargets.map(({ store, url }) => (
                  <a
                    key={store.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 text-text-secondary hover:text-accent transition-colors duration-150 border border-border hover:border-accent"
                  >
                    {store.name_he} ↗
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

          {/* Real-time federation: fresh finds from the stores' own search */}
          {liveQuery.length >= 2 && (liveLoading || (liveResult && liveResult.records.length > 0)) && (
            <section className="mt-14 hairline-t pt-8">
              <div className="flex items-baseline justify-between gap-3 mb-6">
                <div className="flex items-center gap-2.5">
                  <Radio size={14} className={`text-accent ${liveLoading ? 'animate-pulse' : ''}`} />
                  <h2 className="text-[15px] font-bold text-text-primary tracking-tight">
                    {liveLoading ? 'סורק את החנויות בזמן אמת…' : 'נמצאו עכשיו בחנויות'}
                  </h2>
                </div>
                {liveResult && !liveLoading && (
                  <span className="mono text-[11px] text-text-muted shrink-0" dir="ltr">
                    {liveResult.records.length} new · {liveResult.stores.filter((s) => s.status === 'ok' || s.status === 'verified').length} stores
                  </span>
                )}
              </div>

              {liveLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-8">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="aspect-square shimmer" />
                  ))}
                </div>
              )}

              {!liveLoading && liveResult && liveResult.records.length > 0 && (
                <RecordGrid records={liveResult.records} />
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
