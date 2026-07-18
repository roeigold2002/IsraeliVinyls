import { Outlet, Link, useLocation } from 'react-router-dom'
import { Store, Heart, Search, BarChart3 } from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'חיפוש', icon: Search },
  { path: '/stores', label: 'חנויות', icon: Store },
  { path: '/stats', label: 'סטטיסטיקה', icon: BarChart3 },
  { path: '/wishlist', label: 'מועדפים', icon: Heart },
]

/** Brand mark: a pressed record — two rings and the label dot. */
function Mark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <circle cx="12" cy="12" r="2.4" fill="var(--color-accent)" stroke="none" />
    </svg>
  )
}

export function Layout() {
  const location = useLocation()

  const isActive = (path: string) =>
    path === '/' ? location.pathname === '/' : location.pathname.startsWith(path)

  return (
    <div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-50 bg-bg-primary/95 backdrop-blur-[2px] hairline-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 text-text-primary">
            <Mark />
            <span className="flex items-baseline gap-3">
              <span className="text-[15px] font-bold tracking-tight leading-none">
                חנות הביניים
              </span>
              <span className="mono hidden sm:inline text-[10px] text-text-muted leading-none tracking-wide" dir="ltr">
                20 STORES · ONE INDEX
              </span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center">
            {NAV_ITEMS.map(({ path, label }) => {
              const active = isActive(path)
              return (
                <Link
                  key={path}
                  to={path}
                  className={`relative px-4 py-4 text-[13px] transition-colors duration-150 ${
                    active
                      ? 'text-text-primary font-semibold'
                      : 'text-text-secondary hover:text-text-primary font-medium'
                  }`}
                >
                  {label}
                  {active && (
                    <span className="absolute bottom-0 right-4 left-4 h-[2px] bg-accent" />
                  )}
                </Link>
              )
            })}
          </nav>

          <nav className="flex md:hidden items-center gap-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => {
              const active = isActive(path)
              return (
                <Link
                  key={path}
                  to={path}
                  aria-label={label}
                  className={`p-2.5 transition-colors duration-150 ${
                    active ? 'text-accent' : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  <Icon size={18} strokeWidth={active ? 2.2 : 1.8} />
                </Link>
              )
            })}
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="hairline-t mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
            <div className="flex items-center gap-3 text-text-primary">
              <Mark size={18} />
              <span className="text-sm font-bold tracking-tight">חנות הביניים</span>
            </div>

            <div className="max-w-xs">
              <p className="text-[13px] text-text-secondary leading-relaxed">
                מנוע השוואת מחירים לתקליטים. סורק את כל חנויות הוויניל בישראל,
                מאמת מחירים מול החנויות בזמן החיפוש.
              </p>
            </div>

            <div className="mono text-[11px] text-text-muted leading-loose text-left" dir="ltr">
              20 stores indexed<br />
              prices re-verified nightly<br />
              live-checked on search
            </div>
          </div>

          <div className="hairline-t mt-8 pt-4 flex items-center justify-between">
            <span className="text-[11px] text-text-muted">
              המחירים עשויים להשתנות בחנות
            </span>
            <span className="mono text-[11px] text-text-muted" dir="ltr">
              EST. 2026 · TLV
            </span>
          </div>
        </div>
      </footer>
    </div>
  )
}
