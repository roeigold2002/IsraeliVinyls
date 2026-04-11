import { Link } from 'react-router-dom'
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

export function RecordCard({ record, index = 0 }: Props) {
  const [inWishlist, setInWishlist] = useState(() => isInWishlist(record.id))
  const [imgError, setImgError] = useState(false)
  const [hydratedCover, setHydratedCover] = useState<string | null>(null)

  useEffect(() => {
    setHydratedCover(null)
    setImgError(false)
  }, [record.id, record.cover_url])

  useEffect(() => {
    let cancelled = false

    if (!record.id || !shouldHydrateCover(record.cover_url)) {
      return () => {
        cancelled = true
      }
    }

    hydrateCoverForRecord(record.id).then((cover) => {
      if (cancelled || !cover) {
        return
      }
      setHydratedCover(cover)
    })

    return () => {
      cancelled = true
    }
  }, [record.id, record.cover_url])

  const handleWishlist = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const result = toggleWishlist(record.id)
    setInWishlist(result)
  }

  const coverCandidate = hydratedCover || record.cover_url
  const coverSrc = !imgError && coverCandidate && !shouldHydrateCover(coverCandidate)
    ? coverCandidate
    : DEFAULT_COVER
  const isOutOfStock = record.in_stock === false

  return (
    <div
      className="animate-fade-in opacity-0 group"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      <Link
        to={`/record/${record.id}`}
        className="block bg-bg-card rounded-xl overflow-hidden border border-border hover:border-accent/40 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-accent/5"
      >
        <div className="relative aspect-square overflow-hidden bg-bg-secondary">
          <img
            src={coverSrc}
            alt={`${record.artist} - ${record.album}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
            onError={() => setImgError(true)}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

          <button
            onClick={handleWishlist}
            className={`absolute top-3 left-3 p-2 rounded-full transition-all duration-200 ${
              inWishlist
                ? 'bg-accent text-white scale-100'
                : 'bg-black/40 text-white/70 hover:text-white scale-0 group-hover:scale-100'
            }`}
          >
            <Heart size={16} fill={inWishlist ? 'currentColor' : 'none'} />
          </button>

          {isOutOfStock && (
            <div className="absolute top-3 right-3 bg-red-500/90 text-white text-[10px] px-2.5 py-1 rounded-full">
              אזל מהמלאי
            </div>
          )}

          {record.store && (
            <div className="absolute bottom-3 right-3 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              {record.store.logo_emoji} {record.store.name_he}
            </div>
          )}

          {record.product_url && !isOutOfStock && (
            <a
              href={record.product_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="absolute bottom-3 left-3 p-2 rounded-full bg-black/40 text-white/70 hover:text-white hover:bg-accent transition-all duration-200 scale-0 group-hover:scale-100"
            >
              <ExternalLink size={14} />
            </a>
          )}
        </div>

        <div className="p-4">
          <h3 className="font-semibold text-text-primary text-sm leading-tight line-clamp-1 latin-text">
            {record.artist}
          </h3>
          <p className="text-text-secondary text-xs mt-1 line-clamp-1 latin-text">
            {record.album}
          </p>
          <div className="flex items-center justify-between mt-3">
            <span className="text-accent font-bold text-lg">
              {record.price > 0 ? `${record.price}₪` : 'צרו קשר'}
            </span>
            <div className="flex items-center gap-2">
              {record.year && (
                <span className="text-text-muted text-[11px] bg-white/5 px-2 py-0.5 rounded latin-text">
                  {record.year}
                </span>
              )}
              {record.format && (
                <span className="text-text-muted text-[11px] bg-white/5 px-2 py-0.5 rounded latin-text">
                  {record.format}
                </span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </div>
  )
}
