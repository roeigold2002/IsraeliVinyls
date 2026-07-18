import { useLocation, useNavigate } from 'react-router-dom'
import { Heart } from 'lucide-react'
import { memo, useEffect, useRef, useState } from 'react'
import type { VinylRecord } from '../lib/types'
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { DEFAULT_COVER } from '../lib/constants'
import { fetchItunesCoverForRecord } from '../lib/itunesCover'
import { getStoreByName } from '../lib/storeCatalog'
import { Price } from './Price'

interface Props {
  record: VinylRecord
  index?: number
}

function isRealCoverUrl(url: string | null | undefined): boolean {
  if (!url) return false
  if (url.startsWith('data:image/svg+xml')) return false
  if (url === DEFAULT_COVER) return false
  return /^https?:\/\//i.test(url)
}

/**
 * Sleeve tile: the cover is the card. Text sits under it on the page
 * surface — no box, no shadow — like records in a browser bin.
 */
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

  // Cover art: snapshot URL → iTunes fallback → placeholder sleeve.
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

  const coverSrc = !imgError && cover ? cover : DEFAULT_COVER
  const isOutOfStock = record.in_stock === false
  const hasPrice = (record.price || 0) > 0

  const catalogStore = record.store_name ? getStoreByName(record.store_name) : undefined
  const storeName = record.store?.name_he || catalogStore?.name_he || record.store_name || ''

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
    <div ref={cardRef} className="animate-fade-in group">
      <div
        className="cursor-pointer"
        onClick={openRecord}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && openRecord()}
        aria-label={`${record.artist} - ${record.album}`}
      >
        {/* Sleeve */}
        <div className="relative aspect-square overflow-hidden bg-bg-card border border-border group-hover:border-border-light transition-colors duration-150">
          {!imgLoaded && <div className="absolute inset-0 shimmer" />}
          <img
            src={isVisible ? coverSrc : undefined}
            alt={`${record.artist} - ${record.album}`}
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              imgLoaded ? 'opacity-100' : 'opacity-0'
            } ${isOutOfStock ? 'grayscale-[35%] opacity-80' : ''}`}
            loading="lazy"
            decoding="async"
            fetchPriority={index < 6 ? 'high' : 'auto'}
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true) }}
          />

          <button
            onClick={handleWishlist}
            aria-label={inWishlist ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            className={`absolute top-2 left-2 p-1.5 transition-all duration-150 z-10 ${
              inWishlist
                ? 'bg-accent text-ink opacity-100'
                : 'bg-ink/70 text-text-secondary hover:text-text-primary opacity-100 sm:opacity-0 sm:group-hover:opacity-100'
            }`}
          >
            <Heart size={13} fill={inWishlist ? 'currentColor' : 'none'} />
          </button>

          {isOutOfStock && (
            <span className="absolute bottom-2 right-2 bg-ink/85 text-text-secondary text-[10px] font-semibold px-2 py-0.5 z-10">
              אזל מהמלאי
            </span>
          )}

          {isLiveRecord && (
            <span className="absolute top-2 right-2 bg-accent text-ink mono text-[9px] font-semibold px-1.5 py-0.5 z-10" dir="ltr">
              LIVE
            </span>
          )}
        </div>

        {/* Bin label */}
        <div className="pt-2.5 pb-1">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-text-primary leading-snug truncate">
              {record.artist || '—'}
            </h3>
            {hasPrice && (
              <Price
                value={record.price}
                className="text-[13px] font-medium text-accent leading-none shrink-0"
              />
            )}
          </div>
          <p className="text-[12px] text-text-secondary leading-snug truncate mt-0.5">
            {record.album}
          </p>
          <div className="flex items-center gap-2 mt-1.5 text-[10.5px] text-text-muted">
            <span className="truncate">{storeName}</span>
            {record.year && record.year > 100 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="mono" dir="ltr">{record.year}</span>
              </>
            )}
            {record.format && (
              <>
                <span aria-hidden="true">·</span>
                <span className="mono" dir="ltr">{record.format}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})
