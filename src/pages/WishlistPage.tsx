import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Search, Trash2 } from 'lucide-react'
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

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const handleStorage = () => load()
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const clearAll = () => {
    localStorage.removeItem('vinyl-wishlist')
    setRecords([])
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Heart size={24} className="text-accent" />
            <h1 className="text-2xl font-bold text-text-primary">המועדפים שלי</h1>
          </div>
          <p className="text-text-secondary text-sm">
            {records.length} תקליטים שמורים
          </p>
        </div>
        {records.length > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-2 text-sm text-text-muted hover:text-error transition-colors"
          >
            <Trash2 size={14} />
            נקה הכל
          </button>
        )}
      </div>

      {!loading && records.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Heart size={64} className="text-text-muted mb-4 opacity-20" />
          <p className="text-text-secondary text-lg mb-2">עדיין אין מועדפים</p>
          <p className="text-text-muted text-sm mb-8">
            לחצו על הלב בכרטיס תקליט כדי לשמור אותו כאן
          </p>
          <Link
            to="/search"
            className="flex items-center gap-2 bg-accent hover:bg-accent-hover text-white px-6 py-3 rounded-xl font-medium transition-all"
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
