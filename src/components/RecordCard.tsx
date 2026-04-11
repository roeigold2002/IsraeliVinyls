import { useNavigate } from 'react-router-dom'
import { Heart, ExternalLink, ShoppingBag } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VinylRecord } from '../lib/types'
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { DEFAULT_COVER } from '../lib/constants'
import { hydrateCoverForRecord, shouldHydrateCover } from '../lib/coverHydration'
import { getStoreByName } from '../lib/storeCatalog'

interface Props {
  record: VinylRecord
  index?: number
}

function formatPrice(price: number): string {
  if (price <= 0) return ''
  return `₪${price.toLocaleString('he-IL')}`
}

export function RecordCard({ record, index = 0 }: Props) {
  const navigate = useNavigate()
  const [inWishlist, setInWishlist] = useState(() => isInWishlist(record.id))
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [hydratedCover, setHydratedCover] = useState<string | null>(null)

  useEffect(() => {
    setHydratedCover(null)
    setImgError(false)
    setImgLoaded(false)
  }, [record.id, record.cover_url])

  useEffect(() => {
    let cancelled = false
    if (!record.id || !shouldHydrateCover(record.cover_url)) {
      return () => { cancelled = true }
    }
    hydrateCoverForRecord(record.id).then((cover) => {
      if (cancelled || !cover) return
      setHydratedCover(cover)
    })
    return () => { cancelled = true }
  }, [record.id, record.cover_url])

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation()
    setInWishlist(toggleWishlist(record.id))
  }

  const handleOpenStore = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (record.product_url) {
      window.open(record.product_url, '_blank', 'noopener,noreferrer')
    }
  }

  const coverCandidate = hydratedCover || record.cover_url
  const coverSrc = !imgError && coverCandidate && !shouldHydrateCover(coverCandidate)
    ? coverCandidate
    : DEFAULT_COVER

  const isOutOfStock = record.in_stock === false
  const hasPrice = record.price > 0

  // Resolve store info: prefer the enriched store object, fall back to catalog lookup by name
  const catalogStore = record.store_name ? getStoreByName(record.store_name) : undefined
  const storeEmoji = record.store?.logo_emoji || catalogStore?.emoji || '🎵'
  const storeName = record.store?.name_he || record.store_name || ''

  return (
    <div
      className="animate-fade-in opacity-0 group"
      style={{ animationDelay: `${Math.min(index * 0.035, 0.6)}s` }}
    >
      <div className="bg-bg-card rounded-2xl overflow-hidden border border-border hover:border-accent/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/8 flex flex-col h-full">

        {/* Cover image — click goes to detail page */}
        <div
          className="relative aspect-square overflow-hidden bg-bg-secondary cursor-pointer"
          onClick={() => navigate(`/record/${record.id}`)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && navigate(`/record/${record.id}`)}
          aria-label={`${record.artist} - ${record.album}`}
        >
          {!imgLoaded && <div className="absolute inset-0 shimmer" />}
          <img
            src={coverSrc}
            alt={`${record.artist} - ${record.album}`}
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true) }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          {/* Wishlist button */}
          <button
            onClick={handleWishlist}
            aria-label={inWishlist ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            className={`absolute top-2 right-2 p-1.5 rounded-full transition-all duration-200 shadow-md z-10 ${
              inWishlist
                ? 'bg-accent text-white'
                : 'bg-black/50 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 hover:bg-black/70'
            }`}
          >
            <Heart size={13} fill={inWishlist ? 'currentColor' : 'none'} />
          </button>

          {/* Out of stock badge */}
          {isOutOfStock && (
            <div className="absolute top-2 left-2 bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
              אזל
            </div>
          )}
        </div>

        {/* Card info */}
        <div className="p-3 flex flex-col flex-1">
          {/* Artist & Album — click goes to detail page */}
          <div
            className="cursor-pointer flex-1 mb-2"
            onClick={() => navigate(`/record/${record.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && navigate(`/record/${record.id}`)}
          >
            <h3 className="font-semibold text-text-primary text-[13px] leading-snug line-clamp-1 latin-text">
              {record.artist || '—'}
            </h3>
            <p className="text-text-secondary text-[11px] mt-0.5 line-clamp-2 leading-tight">
              {record.album}
            </p>
          </div>

          {/* Format / Year pills */}
          {(record.year || record.format) && (
            <div className="flex gap-1 mb-2">
              {record.format && (
                <span className="text-[10px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded latin-text">
                  {record.format}
                </span>
              )}
              {record.year && record.year > 100 && (
                <span className="text-[10px] text-text-muted bg-white/5 px-1.5 py-0.5 rounded latin-text">
                  {record.year}
                </span>
              )}
            </div>
          )}

          {/* Price + Store button — always visible */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
            {/* Price or store name */}
            <div className="min-w-0">
              {hasPrice ? (
                <span className="text-accent font-bold text-base leading-none">
                  {formatPrice(record.price)}
                </span>
              ) : (
                <span className="text-text-muted text-[11px] truncate block">
                  {storeEmoji} {storeName}
                </span>
              )}
            </div>

            {/* Always-visible "Go to store" button */}
            {record.product_url && (
              <button
                onClick={handleOpenStore}
                title="פתח בחנות"
                aria-label="פתח בחנות"
                className={`flex items-center gap-1 text-[11px] font-medium rounded-lg px-2 py-1.5 transition-all duration-200 shrink-0 border ${
                  isOutOfStock
                    ? 'text-red-400/60 border-red-500/20 bg-red-500/5 cursor-not-allowed'
                    : 'text-text-muted hover:text-white bg-white/5 hover:bg-accent border-border hover:border-accent'
                }`}
                disabled={isOutOfStock}
              >
                <ShoppingBag size={11} />
                <span>לחנות</span>
                <ExternalLink size={9} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
