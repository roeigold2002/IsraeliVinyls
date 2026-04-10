import { ChevronRight, ChevronLeft } from 'lucide-react'

interface Props {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function Pagination({ page, totalPages, onPageChange }: Props) {
  if (totalPages <= 1) return null

  const pages: (number | string)[] = []
  const delta = 2

  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - delta && i <= page + delta)) {
      pages.push(i)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-8" dir="ltr">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none"
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
            className={`min-w-[36px] h-9 rounded-lg text-sm font-medium transition-all ${
              p === page
                ? 'bg-accent text-white'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
            }`}
          >
            {p}
          </button>
        ),
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="p-2 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-all disabled:opacity-30 disabled:pointer-events-none"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
