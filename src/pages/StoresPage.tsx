import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, ExternalLink, MapPin } from 'lucide-react'
import { fetchStores } from '../lib/api'
import type { Store as StoreType } from '../lib/types'

export function StoresPage() {
  const [stores, setStores] = useState<StoreType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStores()
      .then(setStores)
      .finally(() => setLoading(false))
  }, [])

  const totalRecords = stores.reduce((sum, s) => sum + s.record_count, 0)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Store size={24} className="text-teal" />
          <h1 className="text-2xl font-bold text-text-primary">חנויות וויניל בישראל</h1>
        </div>
        <p className="text-text-secondary">
          {stores.length} חנויות פעילות עם {totalRecords}+ תקליטים
        </p>
      </div>

      {loading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="animate-pulse bg-bg-card rounded-2xl h-48" />
          ))}
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stores.map((store, i) => (
            <div
              key={store.id}
              className="animate-fade-in opacity-0 bg-bg-card border border-border rounded-2xl p-6 hover:border-accent/30 transition-all duration-300 group"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="text-4xl group-hover:scale-110 transition-transform duration-300">
                    {store.logo_emoji}
                  </div>
                  <div>
                    <h2 className="font-bold text-text-primary text-lg">{store.name_he}</h2>
                    <p className="text-text-muted text-sm latin-text">{store.name}</p>
                  </div>
                </div>
                <a
                  href={store.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
                >
                  <ExternalLink size={16} />
                </a>
              </div>

              <div className="flex items-center gap-2 text-text-muted text-sm mb-4">
                <MapPin size={14} />
                {store.city}
                <span className="text-text-muted/50 mx-1">|</span>
                <span className="text-text-muted latin-text">{store.platform}</span>
              </div>

              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-text-primary">{store.record_count}</div>
                  <div className="text-[10px] text-text-muted">תקליטים</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-accent">{store.avg_price}₪</div>
                  <div className="text-[10px] text-text-muted">ממוצע</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold text-success">פעיל</div>
                  <div className="text-[10px] text-text-muted">סטטוס</div>
                </div>
              </div>

              <Link
                to={`/search?store=${store.id}`}
                className="block w-full text-center bg-white/5 hover:bg-accent/15 text-text-secondary hover:text-accent py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
              >
                צפה בתקליטים
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
