import { useEffect, useRef, useState } from 'react'
import type { VinylRecord } from '../lib/types'
import { RecordCard } from './RecordCard'
import { SearchX } from 'lucide-react'

interface Props {
  records: VinylRecord[]
  loading?: boolean
  emptyMessage?: string
  columns?: 'default' | 'wide'
}

function SkeletonCard() {
  return (
    <div>
      <div className="aspect-square shimmer border border-border" />
      <div className="pt-2.5 space-y-1.5">
        <div className="h-3 shimmer w-4/5" />
        <div className="h-2.5 shimmer w-3/5" />
      </div>
    </div>
  )
}

export function RecordGrid({ records, loading, emptyMessage = 'לא נמצאו תקליטים', columns = 'default' }: Props) {
  const gridClass = columns === 'wide'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-x-3 gap-y-6'
    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-x-4 gap-y-8'

  // Fade in when content changes (loading→loaded or page change)
  const [visible, setVisible] = useState(true)
  const prevLoadingRef = useRef(loading)
  useEffect(() => {
    if (prevLoadingRef.current !== loading) {
      prevLoadingRef.current = loading
      setVisible(false)
      const t = setTimeout(() => setVisible(true), 30)
      return () => clearTimeout(t)
    }
  }, [loading])

  const fadeClass = `transition-opacity duration-200 ${visible ? 'opacity-100' : 'opacity-0'}`

  if (loading) {
    return (
      <div className={`${gridClass} ${fadeClass}`}>
        {Array.from({ length: 12 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <SearchX size={28} className="text-text-muted mb-4" strokeWidth={1.5} />
        <p className="text-text-primary text-base font-semibold mb-1.5">{emptyMessage}</p>
        <p className="text-text-muted text-[13px]">נסו לשנות את מילות החיפוש או לנקות את הפילטרים</p>
      </div>
    )
  }

  return (
    <div className={`${gridClass} ${fadeClass}`}>
      {records.map((record, i) => (
        <RecordCard key={record.id} record={record} index={i} />
      ))}
    </div>
  )
}
