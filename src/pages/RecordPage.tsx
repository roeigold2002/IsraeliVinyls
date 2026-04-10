import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowRight,
  Heart,
  ExternalLink,
  Store,
  Calendar,
  Music,
  Disc3,
  Tag,
} from 'lucide-react'
import { fetchRecordById, fetchSimilarRecords } from '../lib/api'
import { isInWishlist, toggleWishlist } from '../lib/wishlist'
import { RecordGrid } from '../components/RecordGrid'
import { DEFAULT_COVER } from '../lib/constants'
import type { VinylRecord } from '../lib/types'

export function RecordPage() {
  const { id } = useParams<{ id: string }>()
  const [record, setRecord] = useState<VinylRecord | null>(null)
  const [similar, setSimilar] = useState<VinylRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [inWishlist, setInWishlist] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setImgError(false)

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
    const result = toggleWishlist(id)
    setInWishlist(result.inWishlist)
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-6 w-32 bg-bg-card rounded mb-8" />
          <div className="grid md:grid-cols-2 gap-8">
            <div className="aspect-square bg-bg-card rounded-2xl" />
            <div className="space-y-4">
              <div className="h-8 bg-bg-card rounded w-3/4" />
              <div className="h-6 bg-bg-card rounded w-1/2" />
              <div className="h-12 bg-bg-card rounded w-1/3 mt-8" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!record) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-20 text-center">
        <Disc3 size={64} className="text-text-muted mx-auto mb-4 opacity-30" />
        <p className="text-text-secondary text-lg">התקליט לא נמצא</p>
        <Link to="/search" className="text-accent hover:text-accent-hover text-sm mt-4 inline-block">
          חזרה לחיפוש
        </Link>
      </div>
    )
  }

  const coverSrc = imgError || !record.cover_url ? DEFAULT_COVER : record.cover_url

  const priceComparison = similar.filter(
    s =>
      s.album.toLowerCase() === record.album.toLowerCase() &&
      s.artist.toLowerCase() === record.artist.toLowerCase() &&
      s.id !== record.id,
  )

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <Link
        to="/search"
        className="inline-flex items-center gap-2 text-text-muted hover:text-text-primary text-sm mb-8 transition-colors"
      >
        <ArrowRight size={16} />
        חזרה לתוצאות
      </Link>

      <div className="grid md:grid-cols-2 gap-8 mb-16">
        <div className="relative group">
          <div className="aspect-square rounded-2xl overflow-hidden bg-bg-card border border-border">
            <img
              src={coverSrc}
              alt={`${record.artist} - ${record.album}`}
              className="w-full h-full object-cover"
              onError={() => setImgError(true)}
            />
          </div>
        </div>

        <div className="flex flex-col">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-text-primary latin-text mb-2">
              {record.album}
            </h1>
            <Link
              to={`/search?q=${encodeURIComponent(record.artist)}`}
              className="text-xl text-accent hover:text-accent-hover transition-colors latin-text"
            >
              {record.artist}
            </Link>

            <div className="flex flex-wrap gap-3 mt-6">
              {record.year && (
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm">
                  <Calendar size={14} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.year}</span>
                </div>
              )}
              {record.genre && (
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm">
                  <Music size={14} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.genre}</span>
                </div>
              )}
              {record.format && (
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm">
                  <Disc3 size={14} className="text-text-muted" />
                  <span className="text-text-primary latin-text">{record.format}</span>
                </div>
              )}
              <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-sm">
                <Tag size={14} className="text-text-muted" />
                <span className="text-text-primary">{record.condition}</span>
              </div>
            </div>

            {record.store && (
              <Link
                to={`/search?store=${record.store.id}`}
                className="flex items-center gap-3 mt-6 bg-white/5 rounded-xl p-4 hover:bg-white/8 transition-colors"
              >
                <span className="text-2xl">{record.store.logo_emoji}</span>
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {record.store.name_he}
                  </div>
                  <div className="text-xs text-text-muted flex items-center gap-1">
                    <Store size={12} />
                    {record.store.city}
                  </div>
                </div>
              </Link>
            )}
          </div>

          <div className="mt-8 pt-6 border-t border-border">
            <div className="text-3xl font-bold text-accent mb-6">
              {record.price > 0 ? `${record.price}₪` : 'צרו קשר'}
            </div>
            <div className="flex gap-3">
              {record.product_url && (
                <a
                  href={record.product_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 bg-accent hover:bg-accent-hover text-white font-medium py-3 rounded-xl transition-all duration-200"
                >
                  <ExternalLink size={18} />
                  קנה עכשיו
                </a>
              )}
              <button
                onClick={handleWishlist}
                className={`px-5 py-3 rounded-xl border transition-all duration-200 ${
                  inWishlist
                    ? 'bg-accent/15 border-accent/30 text-accent'
                    : 'border-border text-text-secondary hover:text-text-primary hover:border-border-light'
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
          <h2 className="text-xl font-bold text-text-primary mb-6">
            השוואת מחירים
          </h2>
          <div className="bg-bg-card border border-border rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-text-muted text-sm">
                  <th className="text-right py-3 px-4 font-medium">חנות</th>
                  <th className="text-right py-3 px-4 font-medium">פורמט</th>
                  <th className="text-right py-3 px-4 font-medium">מחיר</th>
                  <th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-border/50 bg-accent/5">
                  <td className="py-3 px-4">
                    <span className="text-sm font-medium text-text-primary">
                      {record.store?.logo_emoji} {record.store?.name_he}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-sm text-text-secondary latin-text">
                    {record.format}
                  </td>
                  <td className="py-3 px-4 text-accent font-bold">
                    {record.price}₪
                  </td>
                  <td className="py-3 px-4 text-xs text-accent">
                    צופה כעת
                  </td>
                </tr>
                {priceComparison.map(r => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-3 px-4">
                      <span className="text-sm text-text-primary">
                        {r.store?.logo_emoji} {r.store?.name_he}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-text-secondary latin-text">
                      {r.format}
                    </td>
                    <td className="py-3 px-4 font-bold text-text-primary">
                      {r.price}₪
                    </td>
                    <td className="py-3 px-4">
                      <Link
                        to={`/record/${r.id}`}
                        className="text-xs text-accent hover:text-accent-hover"
                      >
                        צפה
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {similar.length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-text-primary mb-6">
            אולי יעניין אותך גם
          </h2>
          <RecordGrid records={similar.slice(0, 6)} />
        </section>
      )}
    </div>
  )
}
