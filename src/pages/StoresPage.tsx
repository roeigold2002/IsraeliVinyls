import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Store, ExternalLink, MapPin, Disc3, TrendingDown, TrendingUp, BarChart3, Users } from 'lucide-react'
import { fetchSnapshotMeta, fetchStores } from '../lib/api'
import type { Store as StoreType } from '../lib/types'

interface SnapshotMeta {
  generated_at: string | null
  freshness_hours: number | null
  is_stale: boolean | null
  stale_after_hours: number
  pricing_integrity: {
    target_percent: number
    enabled_store_count: number
    enabled_coverage_percent: number
    meets_target: boolean
    stores_below_target: string[]
    stores_missing_prices: string[]
  } | null
  connectivity: {
    enabled_stores: number
    blocked_stores: number
    pending_stores: number
    blocked_store_names: string[]
  } | null
}

function StatCard({ icon: Icon, label, value, colorClass }: {
  icon: React.ElementType
  label: string
  value: string | number
  colorClass: string
}) {
  return (
    <div className="bg-bg-card border border-border rounded-2xl p-5 hover:border-border-light transition-colors">
      <div className={`inline-flex items-center justify-center w-10 h-10 rounded-xl mb-3 ${colorClass}`}>
        <Icon size={18} />
      </div>
      <div className="text-2xl font-bold text-text-primary mb-0.5 tabular-nums">{value}</div>
      <div className="text-xs text-text-muted">{label}</div>
    </div>
  )
}

function PriceBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-1 bg-white/8 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-accent to-accent-hover rounded-full transition-all duration-700"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export function StoresPage() {
  const [stores, setStores] = useState<StoreType[]>([])
  const [snapshotMeta, setSnapshotMeta] = useState<SnapshotMeta | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState<'records' | 'price_asc' | 'price_desc'>('records')

  useEffect(() => {
    Promise.all([
      fetchStores(),
      fetchSnapshotMeta().catch(() => null),
    ])
      .then(([storeRows, meta]) => {
        setStores(storeRows)
        setSnapshotMeta(meta)
      })
      .finally(() => setLoading(false))
  }, [])

  const totalRecords = stores.reduce((sum, s) => sum + s.record_count, 0)
  const activeStores = stores.filter((s) => s.record_count > 0 && s.connectivity_status !== 'blocked')
  const enabledStores = stores.filter((s) => s.connectivity_status !== 'blocked')
  const enabledCoverage = (() => {
    const enabledRecords = enabledStores.reduce((sum, s) => sum + (s.record_count || 0), 0)
    const enabledPriced = enabledStores.reduce((sum, s) => sum + (s.priced_records || 0), 0)
    return enabledRecords > 0 ? Math.round((enabledPriced / enabledRecords) * 1000) / 10 : 0
  })()

  const maxAvgPrice = Math.max(...stores.map(s => s.avg_price || 0))

  const connectivityRank = (store: StoreType) => {
    if (store.connectivity_status === 'blocked') return 2
    if (store.connectivity_status === 'pending') return 1
    return 0
  }

  const sortedStores = [...stores].sort((a, b) => {
    const statusDiff = connectivityRank(a) - connectivityRank(b)
    if (statusDiff !== 0) return statusDiff
    if (sortBy === 'records') return b.record_count - a.record_count
    if (sortBy === 'price_asc') return (a.avg_price || 0) - (b.avg_price || 0)
    if (sortBy === 'price_desc') return (b.avg_price || 0) - (a.avg_price || 0)
    return 0
  })

  const summaryCards = [
    { icon: Store, label: 'חנויות זמינות', value: stores.length, colorClass: 'bg-accent/15 text-accent' },
    { icon: Disc3, label: 'חנויות פעילות', value: activeStores.length, colorClass: 'bg-success/15 text-success' },
    { icon: BarChart3, label: 'סה"כ תקליטים', value: totalRecords.toLocaleString('he-IL'), colorClass: 'bg-teal/15 text-teal' },
    { icon: TrendingUp, label: 'כיסוי מחירים (חנויות פעילות)', value: `${enabledCoverage}%`, colorClass: 'bg-warning/15 text-warning' },
  ]

  const generatedAtLabel = snapshotMeta?.generated_at
    ? new Date(snapshotMeta.generated_at).toLocaleString('he-IL')
    : 'לא ידוע'

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-teal/15 flex items-center justify-center">
            <Store size={20} className="text-teal" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">חנויות וסטטיסטיקה</h1>
            <p className="text-sm text-text-muted">נתונים עדכניים מהסנאפשוט האחרון</p>
          </div>
        </div>

        {snapshotMeta && (
          <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            snapshotMeta.is_stale ? 'border-warning/35 bg-warning/10 text-warning' : 'border-success/30 bg-success/10 text-success'
          }`}>
            <div className="font-semibold">
              {snapshotMeta.pricing_integrity?.meets_target
                ? 'יעד כיסוי מחירים הושג עבור חנויות פעילות'
                : 'כיסוי מחירים מתחת ליעד עבור חלק מהחנויות הפעילות'}
            </div>
            <div className="text-text-secondary mt-1">
              כיסוי נוכחי: {snapshotMeta.pricing_integrity?.enabled_coverage_percent ?? enabledCoverage}% · יעד: {snapshotMeta.pricing_integrity?.target_percent ?? 95}% · עודכן: {generatedAtLabel}
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer rounded-2xl h-28" />
            ))}
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="shimmer rounded-2xl h-64" />
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summaryCards.map((card) => (
              <StatCard key={card.label} {...card} />
            ))}
          </div>

          <div className="flex items-center justify-between mb-5">
            <p className="text-sm text-text-muted">{stores.length} חנויות</p>
            <div className="flex gap-2">
              {[
                { value: 'records', label: 'לפי מלאי', icon: BarChart3 },
                { value: 'price_asc', label: 'מחיר עולה', icon: TrendingUp },
                { value: 'price_desc', label: 'מחיר יורד', icon: TrendingDown },
              ].map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setSortBy(value as typeof sortBy)}
                  className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-all ${
                    sortBy === value
                      ? 'bg-accent/15 border-accent/30 text-accent'
                      : 'bg-bg-card border-border text-text-secondary hover:text-text-primary hover:border-border-light'
                  }`}
                >
                  <Icon size={12} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sortedStores.map((store, i) => (
              <div
                key={store.id}
                className="animate-fade-in opacity-0 bg-bg-card border border-border rounded-2xl p-5 hover:border-accent/25 transition-all duration-300 group"
                style={{ animationDelay: `${Math.min(i * 0.04, 0.5)}s` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="mono w-10 h-10 flex items-center justify-center border border-border text-text-secondary text-sm font-medium" dir="ltr" aria-hidden="true">
                      {store.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '––'}
                    </div>
                    <div>
                      <h2 className="font-bold text-text-primary">{store.name_he}</h2>
                      <p className="text-text-muted text-xs latin-text">{store.name}</p>
                    </div>
                  </div>
                  <a
                    href={store.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-all"
                    title="בקר באתר"
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>

                <div className="flex items-center gap-2 text-text-muted text-xs mb-4">
                  <MapPin size={12} />
                  <span>{store.city}</span>
                  <span className="text-text-muted/40">·</span>
                  <span className="latin-text">{store.platform}</span>
                </div>

                <div className="flex flex-wrap gap-1.5 mb-4">
                  {store.connectivity_status === 'blocked' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/12 text-red-300 border border-red-500/35">חסום אוטומציה</span>
                  ) : store.connectivity_status === 'pending' ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/12 text-warning border border-warning/35">ממתין קישוריות</span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-success/12 text-success border border-success/35">פעיל</span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
                    store.pricing_status === 'healthy'
                      ? 'bg-success/12 text-success border-success/35'
                      : store.pricing_status === 'missing' || store.pricing_status === 'degraded'
                        ? 'bg-warning/12 text-warning border-warning/35'
                        : 'bg-white/8 text-text-muted border-border'
                  }`}>
                    כיסוי מחיר {store.pricing_coverage_percent ?? 0}%
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2.5 mb-4">
                  <div className="bg-white/4 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-text-primary tabular-nums">
                      {store.record_count.toLocaleString('he-IL')}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">תקליטים</div>
                  </div>
                  <div className="bg-white/4 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-accent tabular-nums">
                      {store.avg_price > 0 ? `${store.avg_price}₪` : '—'}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">מחיר ממוצע</div>
                  </div>
                  <div className="bg-white/4 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-text-primary tabular-nums flex items-center justify-center gap-1">
                      <Users size={14} className="text-text-muted" />
                      {store.unique_artists.toLocaleString('he-IL')}
                    </div>
                    <div className="text-[10px] text-text-muted mt-0.5">אמנים</div>
                  </div>
                  <div className="bg-white/4 rounded-xl p-3 text-center">
                    <div className="text-lg font-bold text-text-primary tabular-nums">{store.genres_represented}</div>
                    <div className="text-[10px] text-text-muted mt-0.5">ז'אנרים</div>
                  </div>
                </div>

                {store.avg_price > 0 && (
                  <div className="mb-4">
                    <PriceBar value={store.avg_price} max={maxAvgPrice} />
                  </div>
                )}

                {store.priced_records > 0 && (
                  <div className="text-[11px] text-text-muted mb-4">
                    טווח: <span className="text-success latin-text">{store.min_price}₪</span> — <span className="text-warning latin-text">{store.max_price}₪</span>
                    <span className="text-text-muted/50"> ({store.priced_records.toLocaleString()} רשומות)</span>
                  </div>
                )}

                {store.connectivity_status === 'blocked' ? (
                  <div className="block w-full text-center bg-red-500/8 text-red-300 py-2.5 rounded-xl text-sm font-medium border border-red-500/25 cursor-not-allowed">
                    חנות חסומה כרגע
                  </div>
                ) : (
                  <Link
                    to={`/?store=${store.id}`}
                    className="block w-full text-center bg-white/4 hover:bg-accent/12 text-text-secondary hover:text-accent py-2.5 rounded-xl text-sm font-medium transition-all duration-200 border border-transparent hover:border-accent/20"
                  >
                    {store.record_count > 0 ? 'צפה בתקליטים' : 'חפש באתר ↗'}
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
