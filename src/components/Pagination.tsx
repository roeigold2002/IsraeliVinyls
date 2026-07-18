import { ChevronRight, ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'

interface Props {
  page: number
  totalPages: number
  total?: number
  perPage?: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, total = 0, perPage = 50, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const [jumpValue, setJumpValue] = useState(String(page))

  useEffect(() => {
    setJumpValue(String(page))
  }, [page])

  const pages: (number | string)[] = []
  const delta = 2

  const startItem = total > 0 ? (page - 1) * perPage + 1 : 0
  const endItem = total > 0 ? Math.min(page * perPage, total) : 0

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="mt-8 space-y-3" dir="ltr">
      <div className="mono text-center text-[11px] text-text-muted">
        {startItem.toLocaleString('he-IL')} - {endItem.toLocaleString('he-IL')} מתוך {total.toLocaleString('he-IL')}
      </div>

      <div className="flex items-center justify-center gap-1">
        <button
          onClick={() => onPageChange(1)}
          disabled={page <= 1}
          className="px-2.5 h-9 text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
          title="עמוד ראשון"
        >
          ראשון
        </button>

        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="p-2 text-text-secondary hover:text-text-primary transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
          title="עמוד קודם"
        >
          <ChevronLeft size={18} />
        </button>

        {pages.map((p, i) =>
          typeof p === 'string' ? (
            <span key={`dots-${i}`} className="px-2 text-text-muted text-sm">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`mono min-w-[34px] h-9 text-[13px] transition-colors duration-150 ${
                p === page
                  ? 'text-ink bg-accent font-semibold'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          className="p-2 text-text-secondary hover:text-text-primary transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
          title="עמוד הבא"
        >
          <ChevronRight size={18} />
        </button>

        <button
          onClick={() => onPageChange(totalPages)}
          disabled={page >= totalPages}
          className="px-2.5 h-9 text-xs text-text-secondary hover:text-text-primary transition-colors duration-150 disabled:opacity-30 disabled:pointer-events-none"
          title="עמוד אחרון"
        >
          אחרון
        </button>
      </div>

      <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
        <span>קפיצה לעמוד</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            const parsed = Number(jumpValue)
            if (!Number.isFinite(parsed)) return
            const clamped = Math.max(1, Math.min(totalPages, Math.trunc(parsed)))
            onPageChange(clamped)
          }}
          className="mono w-16 bg-transparent border border-border text-text-primary text-sm px-2.5 py-1.5 outline-none focus:border-accent"
        />
      </div>
    </div>
  )
}
