import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChartBar as BarChart3, Disc3, Store, DollarSign, Music, Calendar, TrendingUp, ShoppingBag } from 'lucide-react'
import { fetchStats } from '../lib/api'
import { STORE_MAP } from '../lib/constants'

interface Stats {
  totalRecords: number
  totalStores: number
  avgPrice: number
  genreCounts: Record<string, number>
  decadeCounts: Record<string, number>
  storeStats: {
    id: string
    name: string
    name_he: string
    record_count: number
    avg_price: number
  }[]
}

function StatCard({ icon, label, value, accent = false }: {
  icon: React.ReactNode
  label: string
  value: string | number
  accent?: boolean
}) {
  return (
    <div className="bg-bg-card rounded-2xl p-6 border border-border hover:border-border-light transition-all">
      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4 ${accent ? 'bg-accent/15 text-accent' : 'bg-teal/15 text-teal'}`}>
        {icon}
      </div>
      <p className="text-3xl font-bold text-text-primary mb-1">{value}</p>
      <p className="text-text-muted text-sm">{label}</p>
    </div>
  )
}

function BarChart({ data, colorFn }: {
  data: { label: string; value: number }[]
  colorFn?: (label: string, index: number) => string
}) {
  const max = Math.max(...data.map(d => d.value), 1)

  return (
    <div className="space-y-3">
      {data.map(({ label, value }, idx) => {
        const pct = (value / max) * 100
        const color = colorFn?.(label, idx) ?? '#e94560'
        return (
          <div key={label} className="group">
            <div className="flex items-center justify-between text-sm mb-1.5">
              <span className="text-text-secondary">{label}</span>
              <span className="text-text-muted tabular-nums">{value}</span>
            </div>
            <div className="h-3 bg-bg-primary rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out group-hover:brightness-125"
                style={{ width: `${pct}%`, backgroundColor: color }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

const GENRE_COLORS: Record<string, string> = {
  Rock: '#e94560',
  Pop: '#f39c12',
  Jazz: '#0abde3',
  Blues: '#3498db',
  Classical: '#f0c040',
  Electronic: '#2ecc71',
  'Hip-Hop': '#e67e22',
  'R&B/Soul': '#9b59b6',
  Folk: '#1abc9c',
  Punk: '#e74c3c',
  Metal: '#6c5ce7',
  Reggae: '#27ae60',
  World: '#fd79a8',
  Israeli: '#00b894',
  Soundtrack: '#fdcb6e',
  Alternative: '#636e72',
}

export function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    fetchStats()
      .then((data) => {
        setStats(data)
        setLoadError(null)
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : 'Failed to load stats'
        setLoadError(message)
        console.error(error)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <BarChart3 size={24} className="text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">סטטיסטיקות</h1>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bg-card rounded-2xl p-6 border border-border animate-pulse h-36" />
          ))}
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-bg-card rounded-2xl p-6 border border-border animate-pulse h-80" />
          ))}
        </div>
      </div>
    )
  }

  if (!stats && loadError) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <BarChart3 size={24} className="text-accent" />
          <h1 className="text-2xl font-bold text-text-primary">סטטיסטיקות</h1>
        </div>
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          שגיאה בטעינת הנתונים: {loadError}
        </div>
      </div>
    )
  }

  if (!stats) return null

  const genreData = Object.entries(stats.genreCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }))

  const decadeData = Object.entries(stats.decadeCounts)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, value]) => ({ label, value }))

  const decadeColors = [
    '#e94560', '#0abde3', '#2ecc71', '#f39c12',
    '#e67e22', '#3498db', '#f0c040', '#1abc9c',
    '#9b59b6', '#e74c3c',
  ]

  const storeData = stats.storeStats
    .filter(s => s.record_count > 0)
    .map(s => ({
      label: s.name_he,
      value: s.record_count,
    }))

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-2">
        <BarChart3 size={24} className="text-accent" />
        <h1 className="text-2xl font-bold text-text-primary">סטטיסטיקות</h1>
      </div>
      <p className="text-text-muted text-sm mb-8">מבט כולל על האוסף מכל החנויות</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
        <StatCard
          icon={<Disc3 size={22} />}
          label="תקליטים באוסף"
          value={stats.totalRecords.toLocaleString()}
          accent
        />
        <StatCard
          icon={<Store size={22} />}
          label="חנויות באתר"
          value={stats.totalStores}
        />
        <StatCard
          icon={<DollarSign size={22} />}
          label="מחיר ממוצע"
          value={`${stats.avgPrice} ₪`}
          accent
        />
        <StatCard
          icon={<Music size={22} />}
          label="ז'אנרים שונים"
          value={Object.keys(stats.genreCounts).length}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <Music size={18} className="text-accent" />
            <h2 className="text-lg font-semibold text-text-primary">התפלגות ז'אנרים</h2>
          </div>
          <BarChart
            data={genreData}
            colorFn={(label, _i) => GENRE_COLORS[label] ?? '#e94560'}
          />
        </div>

        <div className="bg-bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <Calendar size={18} className="text-teal" />
            <h2 className="text-lg font-semibold text-text-primary">התפלגות עשורים</h2>
          </div>
          <BarChart
            data={decadeData}
            colorFn={(_label, i) => decadeColors[i % decadeColors.length] ?? '#e94560'}
          />
        </div>

        <div className="bg-bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <ShoppingBag size={18} className="text-warning" />
            <h2 className="text-lg font-semibold text-text-primary">תקליטים לפי חנות</h2>
          </div>
          <BarChart
            data={storeData}
            colorFn={(label, _i) => {
              const storeInfo = STORE_MAP[label]
              return storeInfo?.color ?? '#e94560'
            }}
          />
        </div>

        <div className="bg-bg-card rounded-2xl p-6 border border-border">
          <div className="flex items-center gap-2 mb-6">
            <TrendingUp size={18} className="text-success" />
            <h2 className="text-lg font-semibold text-text-primary">מחיר ממוצע לפי חנות</h2>
          </div>
          <div className="space-y-3">
            {stats.storeStats
              .filter(s => s.avg_price > 0)
              .sort((a, b) => a.avg_price - b.avg_price)
              .map(store => {
                return (
                  <Link
                    key={store.id}
                    to={`/?store=${store.id}`}
                    className="flex items-center justify-between p-3 rounded-xl hover:bg-bg-card-hover transition-colors group"
                  >
                    <div className="flex items-center gap-3">
                      <span className="mono text-[11px] text-text-muted border border-border w-7 h-7 flex items-center justify-center shrink-0" dir="ltr" aria-hidden="true">{store.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '--'}</span>
                      <span className="text-text-secondary group-hover:text-text-primary transition-colors">
                        {store.name_he}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-text-primary font-medium tabular-nums">
                        {Math.round(store.avg_price)} ₪
                      </span>
                      <span className="text-text-muted text-xs">ממוצע</span>
                    </div>
                  </Link>
                )
              })}
          </div>
        </div>
      </div>
    </div>
  )
}
