import { useLocation, useNavigate } from 'react-router-dom'
import { Heart, ExternalLink, ShoppingBag } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import type { VinylRecord } from '../lib/types'
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { DEFAULT_COVER } from '../lib/constants'
import { fetchItunesCoverForRecord } from '../lib/itunesCover'
import { getStoreByName } from '../lib/storeCatalog'

interface Props {
  record: VinylRecord
  index?: number
}

function formatPrice(price: number): string {
  if (price <= 0) return ''
  return `₪${price.toLocaleString('he-IL')}`
}

function isRealCoverUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith('data:image/svg+xml')) return false
  if (url === DEFAULT_COVER) return false
  return /^https?:\/\//i.test(url)
}

export const RecordCard = memo(function RecordCard({ record, index = 0 }: Props) {
  const navigate = useNavigate()
  const location = useLocation()
  const cardRef = useRef<HTMLDivElement | null>(null)
  const [inWishlist, setInWishlist] = useState(() => isInWishlist(record.id))
  const [imgError, setImgError] = useState(false)
  const [imgLoaded, setImgLoaded] = useState(false)
  const [isVisible, setIsVisible] = useState(index < 8)
  const [cover, setCover] = useState<string | null>(null)

  useEffect(() => {
    if (isVisible) return

    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true)
      return
    }

    const node = cardRef.current
    if (!node) {
      setIsVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '320px 0px', threshold: 0.01 },
    )

    observer.observe(node)
    return () => observer.disconnect()
  }, [isVisible])

  // Cover art: snapshot URL → iTunes fallback → default placeholder.
  // The search API already delivers hydrated data, so no per-record API
  // calls happen here — only a cached iTunes lookup when a cover is missing.
  useEffect(() => {
    if (!isVisible) return

    setCover(null)
    setImgError(false)
    setImgLoaded(false)

    if (isRealCoverUrl(record.cover_url)) {
      setCover(record.cover_url ?? null)
      return
    }

    let cancelled = false
    const artist = record.artist || ''
    const album = record.album || ''
    if (artist || album) {
      void fetchItunesCoverForRecord(artist, album).then((fallbackCover) => {
        if (!cancelled && fallbackCover) {
          setCover(fallbackCover)
        }
      })
    }

    return () => { cancelled = true }
  }, [record.id, record.artist, record.album, record.cover_url, isVisible])

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation()
    setInWishlist(toggleWishlist(record.id))
  }

  const handleOpenStore = (e: React.MouseEvent) => {
    e.stopPropagation()
    const outboundUrl = record.product_url || record.store_url
    if (outboundUrl) {
      window.open(outboundUrl, '_blank', 'noopener,noreferrer')
    }
  }

  const coverSrc = !imgError && cover ? cover : DEFAULT_COVER
  const isOutOfStock = record.in_stock === false
  const hasPrice = (record.price || 0) > 0

  const catalogStore = record.store_name ? getStoreByName(record.store_name) : undefined
  const storeEmoji = record.store?.logo_emoji || catalogStore?.emoji || '🎵'
  const storeName = record.store?.name_he || record.store_name || ''

  const detailState = {
    fromPath: `${location.pathname}${location.search}`,
  }

  // Live federation results aren't in the local catalog — open the store
  // product page directly instead of an internal detail route.
  const isLiveRecord = record.id.startsWith('live-')
  const openRecord = () => {
    if (isLiveRecord) {
      const outboundUrl = record.product_url || record.store_url
      if (outboundUrl) window.open(outboundUrl, '_blank', 'noopener,noreferrer')
      return
    }
    navigate(`/record/${record.id}`, { state: detailState })
  }

  return (
    <div
      ref={cardRef}
      className="animate-fade-in opacity-0 group"
      style={{ animationDelay: `${Math.min(index * 0.035, 0.6)}s` }}
    >
      <div className="bg-bg-card rounded-2xl overflow-hidden border border-border hover:border-accent/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-accent/8 flex flex-col h-full">

        {/* Cover image */}
        <div
          className="relative aspect-square overflow-hidden bg-bg-secondary cursor-pointer"
          onClick={openRecord}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && openRecord()}
          aria-label={`${record.artist} - ${record.album}`}
        >
          {!imgLoaded && <div className="absolute inset-0 shimmer" />}
          <img
            src={isVisible ? coverSrc : undefined}
            alt={`${record.artist} - ${record.album}`}
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            decoding="async"
            fetchPriority={index < 6 ? 'high' : 'auto'}
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
                : 'bg-black/50 text-white/60 hover:text-white opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:bg-black/70 hover:opacity-100'
            }`}
          >
            <Heart size={13} fill={inWishlist ? 'currentColor' : 'none'} />
          </button>

          {isOutOfStock && (
            <div className="absolute top-2 left-2 bg-red-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-10">
              אזל
            </div>
          )}
        </div>

        {/* Card info */}
        <div className="p-3 flex flex-col flex-1">
          <div
            className="cursor-pointer flex-1 mb-2"
            onClick={openRecord}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && openRecord()}
          >
            <h3 className="font-semibold text-text-primary text-[13px] leading-snug line-clamp-1 latin-text">
              {record.artist || '—'}
            </h3>
            <p className="text-text-secondary text-[11px] mt-0.5 line-clamp-2 leading-tight">
              {record.album}
            </p>
          </div>

          {/* Format / Year */}
          {(record.format || (record.year && record.year > 100)) && (
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

          {/* Price + Store button */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
            <div className="min-w-0 flex items-center gap-1.5">
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

            {(record.product_url || record.store_url) && (
              <button
                onClick={handleOpenStore}
                title="פתח בחנות"
                aria-label="פתח בחנות"
                disabled={isOutOfStock}
                className={`flex items-center gap-1 text-[11px] font-medium rounded-lg px-2 py-1.5 transition-all duration-200 shrink-0 border ${
                  isOutOfStock
                    ? 'text-red-400/60 border-red-500/20 bg-red-500/5 cursor-not-allowed'
                    : 'text-text-muted hover:text-white bg-white/5 hover:bg-accent border-border hover:border-accent'
                }`}
              >
                <ShoppingBag size={11} />
                <span>{record.product_url ? 'לחנות' : 'חנות'}</span>
                <ExternalLink size={9} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
