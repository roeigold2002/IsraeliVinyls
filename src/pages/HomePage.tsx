import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Disc3, Store, TrendingDown, ArrowLeft } from 'lucide-react'
import { SearchBar } from '../components/SearchBar'
import { RecordGrid } from '../components/RecordGrid'
import { fetchFeaturedRecords, fetchCheapestRecords, fetchStores } from '../lib/api'
import type { VinylRecord, Store as StoreType } from '../lib/types'

export function HomePage() {
  const [featured, setFeatured] = useState<VinylRecord[]>([])
  const [deals, setDeals] = useState<VinylRecord[]>([])
  const [stores, setStores] = useState<StoreType[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [f, d, s] = await Promise.all([
          fetchFeaturedRecords(),
          fetchCheapestRecords(),
          fetchStores(),
        ])
        setFeatured(f)
        setDeals(d)
        setStores(s)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const totalRecords = stores.reduce((sum, s) => sum + s.record_count, 0)

  return (
    <div>
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent/5 via-bg-primary to-bg-primary" />
        <div className="absolute top-20 right-1/4 w-96 h-96 bg-accent/5 rounded-full blur-3xl" />
        <div className="absolute top-40 left-1/4 w-64 h-64 bg-teal/5 rounded-full blur-3xl" />

        <div className="relative max-w-4xl mx-auto px-4 pt-16 pb-20 text-center">
          <div className="inline-flex items-center gap-2 bg-accent/10 text-accent text-sm px-4 py-2 rounded-full mb-8 animate-fade-in">
            <Disc3 size={16} className="animate-spin-slow" />
            <span>{totalRecords}+ תקליטים מ-{stores.length} חנויות</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-black text-text-primary mb-4 leading-tight animate-slide-up">
            כל התקליטים.
            <br />
            <span className="text-accent">מקום אחד.</span>
          </h1>

          <p className="text-text-secondary text-lg md:text-xl mb-10 max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.1s' }}>
            משווים מחירי תקליטי וויניל מכל החנויות בישראל.
            <br className="hidden sm:block" />
            מוצאים את המחיר הכי טוב. בלחיצה אחת.
          </p>

          <div className="max-w-2xl mx-auto animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <SearchBar large autoFocus />
          </div>

          <div className="flex flex-wrap justify-center gap-6 mt-10 animate-slide-up" style={{ animationDelay: '0.3s' }}>
            {[
              { label: 'תקליטים', value: `${totalRecords}+` },
              { label: 'חנויות', value: String(stores.length) },
              { label: 'ז\'אנרים', value: '16' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <div className="text-2xl font-bold text-text-primary">{stat.value}</div>
                <div className="text-xs text-text-muted mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Disc3 size={20} className="text-accent" />
            <h2 className="text-xl font-bold text-text-primary">נוספו לאחרונה</h2>
          </div>
          <Link
            to="/search?sort=newest"
            className="flex items-center gap-1 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            הכל
            <ArrowLeft size={14} />
          </Link>
        </div>
        <RecordGrid records={featured} loading={loading} />
      </section>

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <TrendingDown size={20} className="text-success" />
            <h2 className="text-xl font-bold text-text-primary">המחירים הכי טובים</h2>
          </div>
          <Link
            to="/search?sort=price_asc"
            className="flex items-center gap-1 text-sm text-accent hover:text-accent-hover transition-colors"
          >
            הכל
            <ArrowLeft size={14} />
          </Link>
        </div>
        <RecordGrid records={deals} loading={loading} />
      </section>

      <section className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center gap-3 mb-6">
          <Store size={20} className="text-teal" />
          <h2 className="text-xl font-bold text-text-primary">החנויות שלנו</h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {stores.map((store, i) => (
            <Link
              key={store.id}
              to={`/search?store=${store.id}`}
              className="animate-fade-in opacity-0 bg-bg-card border border-border rounded-xl p-4 text-center hover:border-accent/40 hover:-translate-y-1 transition-all duration-300 group"
              style={{ animationDelay: `${i * 0.05}s` }}
            >
              <div className="text-3xl mb-2 group-hover:scale-110 transition-transform">
                {store.logo_emoji}
              </div>
              <div className="text-sm font-semibold text-text-primary line-clamp-1">
                {store.name_he}
              </div>
              <div className="text-xs text-text-muted mt-1">
                {store.record_count} תקליטים
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
