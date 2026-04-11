import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Search, Trash2, Music } from 'lucide-react'
import { getWishlist } from '../lib/wishlist'
import { fetchRecordsByIds } from '../lib/api'
import { RecordGrid } from '../components/RecordGrid'
import type { VinylRecord } from '../lib/types'

export function WishlistPage() {
  const [records, setRecords] = useState<VinylRecord[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    try {
      const wishlist = getWishlist()
      const ids = wishlist.map(i => i.recordId)
      if (ids.length > 0) {
        const data = await fetchRecordsByIds(ids)
        setRecords(data)
      } else {
        setRecords([])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const handleStorage = () => load()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const clearAll = () => {
    localStorage.removeItem('vinyl-wishlist')
    setRecords([])
  }

  const totalValue = records.reduce((sum, r) => sum + (r.price > 0 ? r.price : 0), 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-accent/15 flex items-center justify-center">
              <Heart size={20} className="text-accent" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">המועדפים שלי</h1>
              <p className="text-sm text-text-muted">
                {loading ? '...' : `${records.length} תקליטים`}
                {!loading && totalValue > 0 && (
                  <span className="text-accent mr-2">· שווי כולל: {totalValue.toLocaleString('he-IL')}₪</span>
                )}
              </p>
            </div>
          </div>
        </div>
        {records.length > 0 && !loading && (
          <button
            onClick={clearAll}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-error transition-colors border border-border hover:border-error/30 rounded-xl px-4 py-2"
          >
            <Trash2 size={14} />
            נקה הכל
          </button>
        )}
      </div>

      {!loading && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="relative mb-6">
            <div className="w-24 h-24 rounded-full bg-bg-card border border-border flex items-center justify-center">
              <Heart size={48} className="text-text-muted opacity-20" />
            </div>
            <div className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-bg-card border border-border flex items-center justify-center">
              <Music size={16} className="text-text-muted opacity-40" />
            </div>
          </div>
          <p className="text-text-primary text-xl font-semibold mb-2">עדיין אין מועדפים</p>
          <p className="text-text-muted text-sm mb-8 max-w-xs">
            לחצו על הלב שמופיע בכרטיס תקליט כשמרחפים עליו כדי לשמור אותו כאן
          </p>
          <Link
            to="/"
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-xl font-semibold transition-all shadow-lg shadow-accent/20"
          >
            <Search size={18} />
            חפשו תקליטים
          </Link>
        </div>
      ) : (
        <RecordGrid records={records} loading={loading} />
      )}
    </div>
  )
}
