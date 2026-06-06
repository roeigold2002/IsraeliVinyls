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
    <div className="bg-bg-card rounded-2xl overflow-hidden border border-border">
      <div className="aspect-square shimmer" />
      <div className="p-3.5 space-y-2">
        <div className="h-3.5 shimmer rounded w-4/5" />
        <div className="h-3 shimmer rounded w-3/5" />
        <div className="h-5 shimmer rounded w-2/5 mt-2" />
      </div>
    </div>
  )
}

export function RecordGrid({ records, loading, emptyMessage = 'לא נמצאו תקליטים', columns = 'default' }: Props) {
  const gridClass = columns === 'wide'
    ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3'
    : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4'

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
        <div className="w-20 h-20 rounded-full bg-bg-card border border-border flex items-center justify-center mb-5">
          <SearchX size={36} className="text-text-muted opacity-50" />
        </div>
        <p className="text-text-primary text-lg font-medium mb-2">{emptyMessage}</p>
        <p className="text-text-muted text-sm">נסו לשנות את מילות החיפוש או לנקות את הפילטרים</p>
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
