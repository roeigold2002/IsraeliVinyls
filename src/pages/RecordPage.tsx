import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom'
import {
  ArrowRight,
  Heart,
  ExternalLink,
  Store,
  Calendar,
  Music,
  Disc3,
  Tag,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { fetchRecordById, fetchSimilarRecords } from '../lib/api'
import { verifyProductLink } from '../lib/api'
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { RecordGrid } from '../components/RecordGrid'
import { DEFAULT_COVER } from '../lib/constants'
import { fetchItunesCoverForRecord } from '../lib/itunesCover'
import type { VinylRecord } from '../lib/types'
import { buildStoreSearchUrl } from '../lib/storeCatalog'
import { Price } from '../components/Price'

type LinkState = 'unknown' | 'checking' | 'healthy' | 'stale'

function formatPrice(price: number): string {
  if (price <= 0) return ''
  return `₪${price.toLocaleString('he-IL')}`
}

export function RecordPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => { window.scrollTo(0, 0) }, [id])

  const [record, setRecord] = useState<VinylRecord | null>(null)
  const [similar, setSimilar] = useState<VinylRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [inWishlist, setInWishlist] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showAllSimilar, setShowAllSimilar] = useState(false)
  const [itunesCover, setItunesCover] = useState<string | null>(null)
  const [linkState, setLinkState] = useState<LinkState>('unknown')
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setImgError(false)
    setImgLoaded(false)
    setItunesCover(null)

    const controller = new AbortController()
    let cancelled = false

    const load = async () => {
      try {
        // /api/record live-refreshes price, stock, and cover server-side —
        // no additional hydration requests are needed here.
        const r = await fetchRecordById(id, controller.signal)
        if (cancelled) return

        setRecord(r)
        setInWishlist(isInWishlist(id))

        if (!r) return

        const isRealCover = r.cover_url && /^https?:\/\//i.test(r.cover_url) &&
          !r.cover_url.startsWith('data:image/svg+xml')

        const coverTask = (!isRealCover && (r.artist || r.album))
          ? fetchItunesCoverForRecord(r.artist || '', r.album || '').then((fallbackCover) => {
              if (!cancelled && fallbackCover) setItunesCover(fallbackCover)
            })
          : Promise.resolve()

        await Promise.allSettled([
          fetchSimilarRecords(r, controller.signal).then((items) => {
            if (!cancelled) setSimilar(items)
          }),
          coverTask,
        ])
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        console.error(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [id])

  useEffect(() => {
    if (!record?.product_url) {
      setLinkState('unknown')
      setLinkError(null)
      return
    }

    let cancelled = false
    setLinkState('checking')
    setLinkError(null)

    verifyProductLink(record.product_url)
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setLinkState('healthy')
          setLinkError(null)
        } else {
          setLinkState('stale')
          setLinkError(result.error || (result.status ? `HTTP ${result.status}` : 'קישור לא זמין'))
        }
      })
      .catch((error) => {
        if (cancelled) return
        // Fail-open on checker errors to avoid blocking purchase journey.
        setLinkState('healthy')
        setLinkError(error instanceof Error ? error.message : null)
      })

    return () => {
      cancelled = true
    }
  }, [record?.product_url])

  const handleWishlist = () => {
    if (!id) return
    setInWishlist(toggleWishlist(id))
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-5 w-28 shimmer rounded-lg mb-8" />
          <div className="grid md:grid-cols-2 gap-10">
            <div className="aspect-square shimmer rounded-2xl" />
            <div className="space-y-4 pt-2">
              <div className="h-9 shimmer rounded-xl w-4/5" />
              <div className="h-6 shimmer rounded-lg w-2/3" />
              <div className="flex gap-2 mt-6">
                {[1, 2, 3].map(i => <div key={i} className="h-8 w-20 shimmer rounded-lg" />)}
              </div>
              <div className="h-14 shimmer rounded-xl mt-6 w-1/3" />
              <div className="flex gap-3 mt-4">
                <div className="h-12 shimmer rounded-xl flex-1" />
                <div className="h-12 w-12 shimmer rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center">
        <div className="w-24 h-24 rounded-full bg-bg-card border border-border flex items-center justify-center mx-auto mb-5">
          <Disc3 size={48} className="text-text-muted opacity-30" />
        </div>
        <p className="text-text-primary text-xl font-semibold mb-2">התקליט לא נמצא</p>
        <p className="text-text-muted text-sm mb-8">ייתכן שהתקליט הוסר מהמלאי</p>
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-xl font-medium transition-all"
        >
          <ArrowRight size={16} />
          חזרה
        </button>
      </div>
    )
  }

  const hasStoreCover = record.cover_url && /^https?:\/\//i.test(record.cover_url) && !record.cover_url.startsWith('data:image/svg')
  const coverSrc = imgError
    ? (itunesCover || DEFAULT_COVER)
    : (hasStoreCover ? record.cover_url! : (itunesCover || DEFAULT_COVER))
  const isOutOfStock = record.in_stock === false
  const displayPrice = Number(record.price || 0)
  const hasPrice = displayPrice > 0
  const displayYear = record.year && record.year > 100 ? record.year : null
  const sourcePath = typeof location.state === 'object' && location.state && 'fromPath' in location.state
    ? String((location.state as { fromPath?: string }).fromPath || '')
    : ''

  const safeBackTarget = sourcePath.startsWith('/') ? sourcePath : '/'
  const storeKey = record.store?.id || record.store_name || ''
  const storeSearchQuery = `${record.artist || ''} ${record.album || ''}`.trim()
  const directStoreSearchUrl = buildStoreSearchUrl(storeKey, storeSearchQuery)

  const fallbackOutboundUrl = directStoreSearchUrl || record.store_url || null

  const handleBack = () => {
    if (safeBackTarget) {
      navigate(safeBackTarget)
      return
    }
    navigate('/')
  }

  const priceComparison = similar.filter(
    s =>
      s.album.toLowerCase() === record.album.toLowerCase() &&
      s.artist.toLowerCase() === record.artist.toLowerCase() &&
      s.id !== record.id,
  )

  const similarToShow = showAllSimilar ? similar.filter(s => s.id !== record.id) : similar.filter(s => s.id !== record.id).slice(0, 6)

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <button
        onClick={handleBack}
        className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary text-sm mb-8 transition-colors group"
      >
        <ArrowRight size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        חזרה
      </button>

      <div className="grid md:grid-cols-2 gap-10 mb-16">
        <div className="relative">
          <div className="aspect-square overflow-hidden bg-bg-card border border-border">
            {!imgLoaded && <div className="absolute inset-0 shimmer" />}
            <img
              src={coverSrc}
              alt={`${record.artist} - ${record.album}`}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true) }}
            />
          </div>

        </div>

        <div className="flex flex-col">
          <div className="flex-1">
            <button
              onClick={() => navigate(`/?q=${encodeURIComponent(record.artist)}`)}
              className="latin-text text-[13px] text-text-secondary hover:text-accent transition-colors duration-150 tracking-wide"
            >
              {record.artist}
            </button>
            <h1 className="text-3xl sm:text-4xl font-bold text-text-primary latin-text mt-1.5 mb-2 leading-[1.15] tracking-tight">
              {record.album}
            </h1>

            <div className="flex flex-wrap gap-2 mt-6">
              {displayYear && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-border">
                  <Calendar size={13} className="text-text-muted" />
                  <span className="mono text-text-primary" dir="ltr">{displayYear}</span>
                </div>
              )}
              {record.genre && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-border">
                  <Music size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.genre}</span>
                </div>
              )}
              {record.format && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-border">
                  <Disc3 size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.format}</span>
                </div>
              )}
              {record.condition && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] border border-border">
                  <Tag size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.condition}</span>
                </div>
              )}
              {record.in_stock === true && (
                <div className="flex items-center gap-1.5 border border-success/50 px-3 py-1.5 text-[13px] text-success font-medium">
                  ✓ במלאי
                </div>
              )}
              {isOutOfStock && (
                <div className="flex items-center gap-1.5 border border-error/50 px-3 py-1.5 text-[13px] text-error">
                  אזל מהמלאי
                </div>
              )}
            </div>

            {record.store && (
              <Link
                to={`/?store=${record.store.id}`}
                className="flex items-center gap-3 mt-6 p-4 transition-colors duration-150 border border-border hover:border-border-light group"
              >
                <div>
                  <div className="text-sm font-semibold text-text-primary">{record.store.name_he}</div>
                  <div className="text-xs text-text-muted flex items-center gap-1 mt-0.5">
                    <Store size={11} />
                    {record.store.city}
                    {record.store.avg_price > 0 && (
                      <span className="mr-2">· ממוצע {record.store.avg_price}₪</span>
                    )}
                  </div>
                </div>
                <ExternalLink size={14} className="mr-auto text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
              </Link>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-border/60">
            <div className="mb-5">
              {hasPrice ? (
                <>
                  <div className="mb-1"><Price value={displayPrice} className="text-4xl font-semibold text-accent" /></div>
                  <div className="text-xs text-text-muted">המחיר עשוי להשתנות. לחצו לרכישה באתר החנות.</div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <ShoppingCart size={15} className="text-text-muted" />
                  <span>המחיר מוצג באתר החנות — לחצו על הכפתור למטה</span>
                </div>
              )}

              {!isOutOfStock && linkState === 'stale' && (
                <div className="mt-3 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-xs text-warning">
                  קישור הרכישה הישיר אינו זמין כרגע. ניתן לעבור לחיפוש בחנות.
                  {linkError ? <span className="text-text-muted mr-1">({linkError})</span> : null}
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {isOutOfStock ? (
                <button
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 border border-border text-text-muted font-medium py-3.5 cursor-not-allowed text-sm"
                >
                  אזל מהמלאי
                </button>
              ) : record.product_url ? (
                <a
                  href={linkState === 'stale' && fallbackOutboundUrl ? fallbackOutboundUrl : record.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-ink font-bold py-3.5 transition-colors duration-150 text-sm"
                >
                  <ShoppingCart size={17} />
                  {linkState === 'checking'
                    ? 'מאמת קישור...'
                    : linkState === 'stale'
                      ? 'פתח בחנות'
                      : hasPrice
                        ? 'קנה עכשיו'
                        : 'פתח בחנות'}
                  <ExternalLink size={14} />
                </a>
              ) : fallbackOutboundUrl ? (
                <a
                  href={fallbackOutboundUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-ink font-bold py-3.5 transition-colors duration-150 text-sm"
                >
                  <ShoppingCart size={17} />
                  פתח חיפוש בחנות
                  <ExternalLink size={14} />
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 border border-border text-text-secondary py-3.5 text-sm cursor-default">
                  אין קישור לרכישה
                </div>
              )}
              <button
                onClick={handleWishlist}
                aria-label={inWishlist ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                className={`px-4 py-3.5 border transition-colors duration-150 ${
                  inWishlist
                    ? 'border-accent text-accent'
                    : 'border-border text-text-secondary hover:text-accent hover:border-accent'
                }`}
              >
                <Heart size={18} fill={inWishlist ? 'currentColor' : 'none'} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {priceComparison.length > 0 && (
        <section className="mb-16">
          <div className="hairline-t pt-6 mb-5">
            <h2 className="text-[15px] font-bold text-text-primary tracking-tight">השוואת מחירים</h2>
          </div>
          <div className="border border-border overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="hairline-b text-text-muted text-xs">
                  <th className="eyebrow text-right py-3 px-4">חנות</th>
                  <th className="eyebrow text-right py-3 px-4">פורמט</th>
                  <th className="eyebrow text-right py-3 px-4">מחיר</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                <tr className="hairline-b bg-bg-secondary">
                  <td className="py-3.5 px-4">
                    <span className="text-sm font-semibold text-text-primary">
                      {record.store?.name_he}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-sm text-text-secondary latin-text">{record.format}</td>
                  <td className="py-3.5 px-4"><Price value={displayPrice} className="text-accent font-medium text-[15px]" /></td>
                  <td className="py-3.5 px-4 text-xs text-accent font-medium">צופה כעת</td>
                </tr>
                {priceComparison.map(r => {
                  const isCheaper = r.price > 0 && displayPrice > 0 && r.price < displayPrice
                  const isMoreExpensive = r.price > 0 && displayPrice > 0 && r.price > displayPrice
                  return (
                    <tr key={r.id} className="hairline-b hover:bg-bg-secondary transition-colors duration-150">
                      <td className="py-3.5 px-4">
                        <span className="text-sm text-text-primary">{r.store?.name_he}</span>
                      </td>
                      <td className="py-3.5 px-4 text-sm text-text-secondary latin-text">{r.format}</td>
                      <td className="py-3.5 px-4 font-bold">
                        <span className={isCheaper ? 'text-success' : isMoreExpensive ? 'text-warning' : 'text-text-primary'}>
                          {formatPrice(r.price)}
                        </span>
                        {isCheaper && <span className="text-[10px] text-success mr-1">↓ זול יותר</span>}
                        {isMoreExpensive && <span className="text-[10px] text-warning mr-1">↑ יקר יותר</span>}
                      </td>
                      <td className="py-3.5 px-4">
                        <Link to={`/record/${r.id}`} className="text-xs text-accent hover:text-accent-hover font-medium transition-colors">
                          צפה ←
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {similar.filter(s => s.id !== record.id).length > 0 && (
        <section>
          <div className="hairline-t pt-6 mb-6">
            <h2 className="text-[15px] font-bold text-text-primary tracking-tight">אולי יעניין אותך גם</h2>
          </div>
          <RecordGrid records={similarToShow} />
          {similar.filter(s => s.id !== record.id).length > 6 && (
            <div className="text-center mt-6">
              <button
                onClick={() => setShowAllSimilar(!showAllSimilar)}
                className="inline-flex items-center gap-2 text-sm text-text-secondary hover:text-accent transition-colors border border-border hover:border-accent/30 rounded-xl px-5 py-2.5"
              >
                {showAllSimilar ? (
                  <><ChevronUp size={15} /> הצג פחות</>
                ) : (
                  <><ChevronDown size={15} /> הצג עוד {similar.filter(s => s.id !== record.id).length - 6} תקליטים</>
                )}
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
