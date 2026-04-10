import type { VinylRecord } from '../lib/types'
import { RecordCard } from './RecordCard'
import { Disc3 } from 'lucide-react'

interface Props {
  records: VinylRecord[]
  loading?: boolean
  emptyMessage?: string
}

export function RecordGrid({ records, loading, emptyMessage = 'לא נמצאו תקליטים' }: Props) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-square bg-bg-card rounded-xl" />
            <div className="p-4 space-y-2">
              <div className="h-4 bg-bg-card rounded w-3/4" />
              <div className="h-3 bg-bg-card rounded w-1/2" />
              <div className="h-5 bg-bg-card rounded w-1/3 mt-3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Disc3 size={64} className="text-text-muted mb-4 opacity-30" />
        <p className="text-text-secondary text-lg">{emptyMessage}</p>
        <p className="text-text-muted text-sm mt-2">נסו לשנות את מילות החיפוש או הסינון</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {records.map((record, i) => (
        <RecordCard key={record.id} record={record} index={i} />
      ))}
    </div>
  )
}
