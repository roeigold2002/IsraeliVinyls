import { Outlet, Link, useLocation } from 'react-router-dom'
import { Store, Heart, Disc3, Search, BarChart3 } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'חיפוש', icon: Search },
  { path: '/stores', label: 'חנויות', icon: Store },
  { path: '/stats', label: 'סטטיסטיקה', icon: BarChart3 },
  { path: '/wishlist', label: 'מועדפים', icon: Heart },
]

export function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 glass border-b border-border/60">
        <div className="max-w-7xl mx-auto px-4 h-15 flex items-center justify-between" style={{ height: '60px' }}>
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="relative">
              <Disc3
                size={30}
                className="text-accent group-hover:animate-spin-slow transition-colors"
              />
              <div className="absolute inset-0 rounded-full bg-accent/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            <div className="flex flex-col">
              <span className="text-base font-bold text-text-primary leading-tight tracking-tight">
                חנות הביניים
              </span>
              <span className="text-[10px] text-text-muted leading-tight">
                כל התקליטים. מקום אחד.
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-0.5">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path)
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/4'
                  }`}
                >
                  <Icon size={15} />
                  {label}
                </Link>
              )
            })}
          </nav>

          <nav className="flex md:hidden items-center gap-1">
            {NAV_ITEMS.map(({ path, icon: Icon }) => {
              const isActive =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path)
              return (
                <Link
                  key={path}
                  to={path}
                  className={`p-2.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <Icon size={18} />
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border/60 bg-bg-secondary/40 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Disc3 size={18} className="text-accent animate-spin-slow" />
            <span className="font-bold text-text-primary text-sm">חנות הביניים</span>
          </div>
          <p className="text-xs text-text-muted">
            משווים מחירי תקליטים מ-19 חנויות וויניל בישראל
          </p>
          <p className="text-[11px] text-text-muted/60 mt-1">
            המחירים מתעדכנים מדי יום. המחירים עשויים להשתנות.
          </p>
        </div>
      </footer>
    </div>
  )
}
