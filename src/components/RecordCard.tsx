import { useNavigate } from 'react-router-dom'
import { Heart, ExternalLink } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { VinylRecord } from '../lib/types'
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { DEFAULT_COVER } from '../lib/constants'
import { hydrateCoverForRecord, shouldHydrateCover } from '../lib/coverHydration'

interface Props {
  record: VinylRecord
  index?: number
}

function formatPrice(price: number): string {
  if (price <= 0) return 'צרו קשר'
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

  const handleExternalLink = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (record.product_url) {
      window.open(record.product_url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleCardClick = () => {
    navigate(`/record/${record.id}`)
  }

  const coverCandidate = hydratedCover || record.cover_url
  const coverSrc = !imgError && coverCandidate && !shouldHydrateCover(coverCandidate)
    ? coverCandidate
    : DEFAULT_COVER
  const isOutOfStock = record.in_stock === false
  const hasPrice = record.price > 0

  return (
    <div
      className="animate-fade-in opacity-0 group cursor-pointer"
      style={{ animationDelay: `${Math.min(index * 0.035, 0.6)}s` }}
      onClick={handleCardClick}
      role="article"
    >
      <div className="bg-bg-card rounded-2xl overflow-hidden border border-border hover:border-accent/40 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-2xl hover:shadow-accent/10">
        <div className="relative aspect-square overflow-hidden bg-bg-secondary">
          {!imgLoaded && (
            <div className="absolute inset-0 shimmer" />
          )}
          <img
            src={coverSrc}
            alt={`${record.artist} - ${record.album}`}
            className={`w-full h-full object-cover group-hover:scale-105 transition-all duration-500 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
            loading="lazy"
            onLoad={() => setImgLoaded(true)}
            onError={() => { setImgError(true); setImgLoaded(true) }}
          />

          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <button
            onClick={handleWishlist}
            aria-label={inWishlist ? 'הסר ממועדפים' : 'הוסף למועדפים'}
            className={`absolute top-2.5 right-2.5 p-2 rounded-full transition-all duration-200 shadow-lg z-10 ${
              inWishlist
                ? 'bg-accent text-white scale-100'
                : 'bg-black/50 text-white/60 hover:text-white opacity-0 group-hover:opacity-100 hover:bg-accent/80 scale-90 group-hover:scale-100'
            }`}
          >
            <Heart size={14} fill={inWishlist ? 'currentColor' : 'none'} />
          </button>

          {isOutOfStock && (
            <div className="absolute top-2.5 left-2.5 bg-red-500/90 backdrop-blur-sm text-white text-[10px] font-semibold px-2 py-0.5 rounded-full z-10">
              אזל
            </div>
          )}

          {record.store && (
            <div className="absolute bottom-2.5 left-2.5 bg-black/70 backdrop-blur-sm text-white/90 text-[10px] px-2 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300 max-w-[calc(100%-20px)] truncate z-10">
              {record.store.logo_emoji} {record.store.name_he}
            </div>
          )}

          {record.product_url && !isOutOfStock && (
            <button
              onClick={handleExternalLink}
              aria-label="פתח בחנות"
              className="absolute bottom-2.5 right-2.5 p-2 rounded-full bg-black/50 text-white/70 hover:text-white hover:bg-accent transition-all duration-200 opacity-0 group-hover:opacity-100 shadow-lg z-10"
            >
              <ExternalLink size={13} />
            </button>
          )}
        </div>

        <div className="p-3.5">
          <h3 className="font-semibold text-text-primary text-[13px] leading-snug line-clamp-1 latin-text">
            {record.artist}
          </h3>
          <p className="text-text-secondary text-[11px] mt-0.5 line-clamp-1 latin-text">
            {record.album}
          </p>

          <div className="flex items-center justify-between mt-2.5">
            <span className={`font-bold text-base ${hasPrice ? 'text-accent' : 'text-text-muted text-xs'}`}>
              {formatPrice(record.price)}
            </span>
            <div className="flex items-center gap-1.5">
              {record.year && (
                <span className="text-text-muted text-[10px] bg-white/4 px-1.5 py-0.5 rounded latin-text">
                  {record.year}
                </span>
              )}
              {record.format && (
                <span className="text-text-muted text-[10px] bg-white/4 px-1.5 py-0.5 rounded latin-text">
                  {record.format}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
