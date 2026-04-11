import { Outlet, Link, useLocation } from 'react-router-dom'
import { Store, Heart, Disc3, Hop as Home } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'ראשי', icon: Home },
  { path: '/stores', label: 'חנויות וסטטיסטיקה', icon: Store },
  { path: '/wishlist', label: 'מועדפים', icon: Heart },
]

export function Layout() {
  const location = useLocation()

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-bg-secondary/90 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <Disc3
              size={32}
              className="text-accent group-hover:animate-spin-slow transition-colors"
            />
            <div className="flex flex-col">
              <span className="text-lg font-bold text-text-primary leading-tight">
                חנות הביניים
              </span>
              <span className="text-[10px] text-text-muted leading-tight">
                כל התקליטים. מקום אחד.
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const isActive =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path)
              return (
                <Link
                  key={path}
                  to={path}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  }`}
                >
                  <Icon size={16} />
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
                  className={`p-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-accent/15 text-accent'
                      : 'text-text-secondary hover:text-text-primary'
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

      <footer className="border-t border-border bg-bg-secondary/50 py-8">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Disc3 size={20} className="text-accent" />
            <span className="font-bold text-text-primary">חנות הביניים</span>
          </div>
          <p className="text-sm text-text-muted">
            משווים מחירי תקליטים מ-19 חנויות וויניל בישראל
          </p>
          <p className="text-xs text-text-muted mt-2">
            המחירים מתעדכנים מדי יום. המחירים עשויים להשתנות.
          </p>
        </div>
      </footer>
    </div>
  )
}
