import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, ExternalLink, MapPin, Disc3, DollarSign, Music } from 'lucide-react'
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

  const storeCount = stores.length
  const totalRecords = stores.reduce((sum, s) => sum + s.record_count, 0)
  const activeStoreCount = stores.filter((store) => store.record_count > 0).length
  const totalPricedRecords = stores.reduce((sum, s) => sum + (s.priced_records || 0), 0)
  const weightedPriceTotal = stores.reduce((sum, s) => sum + (s.avg_price || 0) * (s.priced_records || 0), 0)
  const globalAvgPrice = totalPricedRecords > 0
    ? Math.round((weightedPriceTotal / totalPricedRecords) * 100) / 100
    : 0

  const summaryCards = [
    {
      key: 'stores',
      icon: <Store size={20} />,
      label: 'חנויות זמינות',
      value: storeCount,
      colorClass: 'bg-accent/15 text-accent',
    },
    {
      key: 'active',
      icon: <Disc3 size={20} />,
      label: 'חנויות פעילות',
      value: activeStoreCount,
      colorClass: 'bg-success/15 text-success',
    },
    {
      key: 'records',
      icon: <Music size={20} />,
      label: 'סה"כ תקליטים',
      value: totalRecords.toLocaleString(),
      colorClass: 'bg-teal/15 text-teal',
    },
    {
      key: 'avg',
      icon: <DollarSign size={20} />,
      label: 'מחיר ממוצע מדויק',
      value: globalAvgPrice > 0 ? `${globalAvgPrice}₪` : '—',
      colorClass: 'bg-warning/15 text-warning',
    },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <Store size={24} className="text-teal" />
          <h1 className="text-2xl font-bold text-text-primary">חנויות וסטטיסטיקה</h1>
        </div>
        <p className="text-text-secondary">
          כל החנויות הזמינות עם סטטיסטיקות מדויקות מתוך הסנאפשוט העדכני
        </p>
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-bg-card rounded-2xl h-28" />
            ))}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="animate-pulse bg-bg-card rounded-2xl h-56" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summaryCards.map((card) => (
              <div key={card.key} className="bg-bg-card border border-border rounded-2xl p-5">
                <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${card.colorClass}`}>
                  {card.icon}
                </div>
                <div className="text-2xl font-bold text-text-primary mb-1">{card.value}</div>
                <div className="text-xs text-text-muted">{card.label}</div>
              </div>
            ))}
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store, i) => (
              <div
                key={store.id}
                className="animate-fade-in opacity-0 bg-bg-card border border-border rounded-2xl p-6 hover:border-accent/30 transition-all duration-300 group"
                style={{ animationDelay: `${i * 0.05}s` }}
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
                    title="בקר באתר החנות"
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

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-text-primary tabular-nums">{store.record_count.toLocaleString()}</div>
                    <div className="text-[10px] text-text-muted">תקליטים</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-accent tabular-nums">
                      {store.avg_price > 0 ? `${store.avg_price}₪` : '—'}
                    </div>
                    <div className="text-[10px] text-text-muted">מחיר ממוצע</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-text-primary tabular-nums">{store.unique_artists.toLocaleString()}</div>
                    <div className="text-[10px] text-text-muted">אמנים ייחודיים</div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3 text-center">
                    <div className="text-lg font-bold text-text-primary tabular-nums">{store.genres_represented.toLocaleString()}</div>
                    <div className="text-[10px] text-text-muted">ז'אנרים</div>
                  </div>
                </div>

                <div className="text-xs text-text-muted mb-4">
                  {store.priced_records > 0
                    ? `טווח מחירים: ${store.min_price}₪ - ${store.max_price}₪ מתוך ${store.priced_records.toLocaleString()} רשומות מחיר`
                    : 'אין מספיק רשומות מחיר להצגת טווח מדויק'}
                </div>

                <Link
                  to={`/?store=${store.id}`}
                  className="block w-full text-center bg-white/5 hover:bg-accent/15 text-text-secondary hover:text-accent py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                >
                  {store.record_count > 0 ? 'צפה בתקליטים' : 'חפש באתר החנות'}
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
