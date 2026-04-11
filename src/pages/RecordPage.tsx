import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
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
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { RecordGrid } from '../components/RecordGrid'
import { DEFAULT_COVER } from '../lib/constants'
import type { VinylRecord } from '../lib/types'

function formatPrice(price: number): string {
  if (price <= 0) return ''
  return `₪${price.toLocaleString('he-IL')}`
}

export function RecordPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [record, setRecord] = useState<VinylRecord | null>(null)
  const [similar, setSimilar] = useState<VinylRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [inWishlist, setInWishlist] = useState(false)
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [showAllSimilar, setShowAllSimilar] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setImgError(false)
    setImgLoaded(false)

    fetchRecordById(id)
      .then(r => {
        setRecord(r)
        setInWishlist(isInWishlist(id))
        if (r) {
          fetchSimilarRecords(r).then(setSimilar)
        }
      })
      .finally(() => setLoading(false))
  }, [id])

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

  const coverSrc = imgError || !record.cover_url ? DEFAULT_COVER : record.cover_url
  const isOutOfStock = record.in_stock === false
  const hasPrice = record.price > 0
  const displayYear = record.year && record.year > 100 ? record.year : null

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
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary text-sm mb-8 transition-colors group"
      >
        <ArrowRight size={16} className="group-hover:-translate-x-0.5 transition-transform" />
        חזרה
      </button>

      <div className="grid md:grid-cols-2 gap-10 mb-16">
        <div className="relative">
          <div className="aspect-square rounded-2xl overflow-hidden bg-bg-card border border-border shadow-2xl">
            {!imgLoaded && <div className="absolute inset-0 shimmer" />}
            <img
              src={coverSrc}
              alt={`${record.artist} - ${record.album}`}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
              onError={() => { setImgError(true); setImgLoaded(true) }}
            />
          </div>
          <div className="absolute -inset-4 rounded-3xl bg-gradient-to-b from-accent/5 to-transparent blur-2xl -z-10 opacity-60" />
        </div>

        <div className="flex flex-col">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary latin-text mb-2 leading-tight">
              {record.album}
            </h1>
            <button
              onClick={() => navigate(`/?q=${encodeURIComponent(record.artist)}`)}
              className="text-xl text-accent hover:text-accent-hover transition-colors latin-text font-medium"
            >
              {record.artist}
            </button>

            <div className="flex flex-wrap gap-2 mt-6">
              {displayYear && (
                <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 text-sm border border-border/50">
                  <Calendar size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text font-medium">{displayYear}</span>
                </div>
              )}
              {record.genre && (
                <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 text-sm border border-border/50">
                  <Music size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.genre}</span>
                </div>
              )}
              {record.format && (
                <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 text-sm border border-border/50">
                  <Disc3 size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.format}</span>
                </div>
              )}
              {record.condition && (
                <div className="flex items-center gap-1.5 bg-white/5 rounded-lg px-3 py-1.5 text-sm border border-border/50">
                  <Tag size={13} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.condition}</span>
                </div>
              )}
              {record.in_stock === true && (
                <div className="flex items-center gap-1.5 bg-success/10 border border-success/20 rounded-lg px-3 py-1.5 text-sm text-success font-medium">
                  ✓ במלאי
                </div>
              )}
              {isOutOfStock && (
                <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-1.5 text-sm text-red-400">
                  אזל מהמלאי
                </div>
              )}
            </div>

            {record.store && (
              <Link
                to={`/?q=&store=${record.store.id}`}
                className="flex items-center gap-3 mt-6 bg-white/4 rounded-xl p-4 hover:bg-white/6 transition-colors border border-border/50 hover:border-border-light group"
              >
                <span className="text-3xl group-hover:scale-110 transition-transform">{record.store.logo_emoji}</span>
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
                  <div className="text-4xl font-black text-accent mb-1">{formatPrice(record.price)}</div>
                  <div className="text-xs text-text-muted">המחיר עשוי להשתנות. לחצו לרכישה באתר החנות.</div>
                </>
              ) : (
                <div className="flex items-center gap-2 text-sm text-text-secondary">
                  <ShoppingCart size={15} className="text-text-muted" />
                  <span>המחיר מוצג באתר החנות — לחצו על הכפתור למטה</span>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              {isOutOfStock ? (
                <button
                  disabled
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 font-medium py-3.5 rounded-xl cursor-not-allowed text-sm"
                >
                  אזל מהמלאי
                </button>
              ) : record.product_url ? (
                <a
                  href={record.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white font-semibold py-3.5 rounded-xl transition-all duration-200 shadow-lg shadow-accent/20 hover:shadow-accent/40 text-sm"
                >
                  <ShoppingCart size={17} />
                  {hasPrice ? 'קנה עכשיו' : 'ראה מחיר וקנה באתר החנות'}
                  <ExternalLink size={14} />
                </a>
              ) : (
                <div className="flex-1 flex items-center justify-center gap-2 bg-white/5 border border-border text-text-secondary py-3.5 rounded-xl text-sm cursor-default">
                  אין קישור לרכישה
                </div>
              )}
              <button
                onClick={handleWishlist}
                aria-label={inWishlist ? 'הסר ממועדפים' : 'הוסף למועדפים'}
                className={`px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                  inWishlist
                    ? 'bg-accent/15 border-accent/40 text-accent shadow-lg shadow-accent/10'
                    : 'border-border text-text-secondary hover:text-accent hover:border-accent/30 hover:bg-accent/5'
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
          <h2 className="text-xl font-bold text-text-primary mb-5 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-warning/15 flex items-center justify-center">
              <Tag size={16} className="text-warning" />
            </span>
            השוואת מחירים
          </h2>
          <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-white/2 text-text-muted text-xs">
                  <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide">חנות</th>
                  <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide">פורמט</th>
                  <th className="text-right py-3 px-4 font-semibold uppercase tracking-wide">מחיר</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 bg-accent/5">
                  <td className="py-3.5 px-4">
                    <span className="text-sm font-semibold text-text-primary">
                      {record.store?.logo_emoji} {record.store?.name_he}
                    </span>
                  </td>
                  <td className="py-3.5 px-4 text-sm text-text-secondary latin-text">{record.format}</td>
                  <td className="py-3.5 px-4 text-accent font-bold text-base">{formatPrice(record.price)}</td>
                  <td className="py-3.5 px-4 text-xs text-accent font-medium">צופה כעת</td>
                </tr>
                {priceComparison.map(r => {
                  const isCheaper = r.price > 0 && record.price > 0 && r.price < record.price
                  const isMoreExpensive = r.price > 0 && record.price > 0 && r.price > record.price
                  return (
                    <tr key={r.id} className="border-b border-border/30 hover:bg-white/2 transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="text-sm text-text-primary">{r.store?.logo_emoji} {r.store?.name_he}</span>
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
          <h2 className="text-xl font-bold text-text-primary mb-6 flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-teal/15 flex items-center justify-center">
              <Music size={16} className="text-teal" />
            </span>
            אולי יעניין אותך גם
          </h2>
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
