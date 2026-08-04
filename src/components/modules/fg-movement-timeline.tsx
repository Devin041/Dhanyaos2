'use client'

import { useEffect, useState, useCallback } from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  ArrowLeftRight,
  Clock,
  FileText,
  User,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'

// ─── Types ─────────────────────────────────────────────────────────────────

interface TimelineMovement {
  id: string
  movementNo: string
  movementType: string
  styleNo: string
  styleName: string
  colorCode: string
  color: string
  size: string
  quantity: number
  previousQty: number
  newQty: number
  unitCost: number
  referenceType: string | null
  referenceId: string | null
  referenceNo: string | null
  fromStatus: string | null
  toStatus: string | null
  fromLocation: string | null
  toLocation: string | null
  partyName: string | null
  reason: string | null
  movedBy: string | null
  movedAt: string
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getMovementBadgeColor(type: string): string {
  switch (type) {
    case 'Inward': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'Outward': return 'bg-red-100 text-red-700 border-red-200'
    case 'Return': return 'bg-amber-100 text-amber-700 border-amber-200'
    case 'Exchange': return 'bg-purple-100 text-purple-700 border-purple-200'
    case 'Reservation': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'Unreservation': return 'bg-sky-100 text-sky-700 border-sky-200'
    case 'Adjustment': return 'bg-slate-100 text-slate-700 border-slate-200'
    case 'QCStatusChange': return 'bg-orange-100 text-orange-700 border-orange-200'
    case 'Scrapping': return 'bg-red-200 text-red-800 border-red-300'
    case 'PromotionalIssue': return 'bg-pink-100 text-pink-700 border-pink-200'
    case 'ExhibitionMove': return 'bg-teal-100 text-teal-700 border-teal-200'
    case 'ExhibitionReturn': return 'bg-cyan-100 text-cyan-700 border-cyan-200'
    default: return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

function getMovementIcon(type: string) {
  switch (type) {
    case 'Inward': return <ArrowDown className="w-3.5 h-3.5 text-emerald-600" />
    case 'Outward': return <ArrowUp className="w-3.5 h-3.5 text-red-600" />
    case 'Return': return <ArrowDown className="w-3.5 h-3.5 text-amber-600 rotate-180" />
    case 'Exchange': return <ArrowRightLeft className="w-3.5 h-3.5 text-purple-600" />
    case 'Reservation': return <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
    case 'Unreservation': return <ArrowLeftRight className="w-3.5 h-3.5 text-sky-600" />
    case 'QCStatusChange': return <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
    case 'Scrapping': return <AlertCircle className="w-3.5 h-3.5 text-red-700" />
    case 'ExhibitionMove': return <ArrowRightLeft className="w-3.5 h-3.5 text-teal-600" />
    case 'ExhibitionReturn': return <ArrowRightLeft className="w-3.5 h-3.5 text-cyan-600" />
    default: return <Clock className="w-3.5 h-3.5 text-slate-500" />
  }
}

function getTimelineLineColor(type: string): string {
  switch (type) {
    case 'Inward': return 'bg-emerald-400'
    case 'Outward': return 'bg-red-400'
    case 'Return': return 'bg-amber-400'
    case 'Exchange': return 'bg-purple-400'
    case 'Reservation': return 'bg-blue-400'
    case 'Unreservation': return 'bg-sky-400'
    case 'QCStatusChange': return 'bg-orange-400'
    case 'Scrapping': return 'bg-red-400'
    case 'PromotionalIssue': return 'bg-pink-400'
    case 'ExhibitionMove': return 'bg-teal-400'
    case 'ExhibitionReturn': return 'bg-cyan-400'
    default: return 'bg-slate-300'
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

interface FGMovementTimelineProps {
  binId: string
  binLabel: string
}

export function FGMovementTimeline({ binId, binLabel }: FGMovementTimelineProps) {
  const [movements, setMovements] = useState<TimelineMovement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchMovements = useCallback(async () => {
    if (!binId) return
    setLoading(true)
    setError(null)
    try {
      // Fetch movements for this bin — use styleNo filter and paginate broadly, then filter client-side
      // since the existing movements API doesn't support binId filter
      const res = await fetch(`/api/fg-stock/movements?limit=100`)
      if (!res.ok) throw new Error('Failed to fetch movements')
      const json = await res.json()
      // Filter to this specific bin on the client side
      const binMovements = (json.movements || []).filter(
        (m: any) => m.fgStockBinId === binId
      )
      setMovements(binMovements)
    } catch (err: any) {
      setError(err.message || 'Failed to load movements')
      setMovements([])
    } finally {
      setLoading(false)
    }
  }, [binId])

  useEffect(() => {
    fetchMovements()
  }, [fetchMovements])

  if (loading) {
    return (
      <div className="space-y-4 py-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <Skeleton className="w-7 h-7 rounded-full" />
              {i < 4 && <Skeleton className="w-0.5 flex-1 mt-1" />}
            </div>
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    )
  }

  if (movements.length === 0) {
    return (
      <div className="text-center py-8">
        <Clock className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No movements found for this bin.</p>
        <p className="text-xs text-muted-foreground mt-1">{binLabel}</p>
      </div>
    )
  }

  return (
    <ScrollArea className="max-h-[60vh]">
      <div className="relative py-2">
        {/* Vertical line */}
        <div className="absolute left-[13px] top-2 bottom-2 w-0.5 bg-border" />

        {movements.map((m, idx) => (
          <div key={m.id} className="relative flex gap-4 pb-6 last:pb-0">
            {/* Timeline dot + line segment */}
            <div className="relative z-10 flex flex-col items-center shrink-0">
              <div className={`w-7 h-7 rounded-full border-2 border-background flex items-center justify-center ${getTimelineLineColor(m.movementType)}`}>
                {getMovementIcon(m.movementType)}
              </div>
            </div>

            {/* Content card */}
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="flex items-center gap-2 mb-1.5">
                <Badge
                  variant="outline"
                  className={`text-[11px] font-medium px-2 py-0 ${getMovementBadgeColor(m.movementType)}`}
                >
                  {m.movementType}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">{m.movementNo}</span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {format(new Date(m.movedAt), 'dd MMM yyyy HH:mm')}
                </span>
              </div>

              <Card className="shadow-none">
                <CardContent className="p-3 space-y-2">
                  {/* Quantity change */}
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${m.quantity >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.quantity > 0 ? '+' : ''}{m.quantity}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({m.previousQty} → {m.newQty})
                    </span>
                  </div>

                  {/* Reference */}
                  {(m.referenceNo || m.referenceType) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3" />
                      <span>{m.referenceType}{m.referenceNo ? `: ${m.referenceNo}` : ''}</span>
                    </div>
                  )}

                  {/* Party */}
                  {m.partyName && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <User className="w-3 h-3" />
                      <span>{m.partyName}</span>
                    </div>
                  )}

                  {/* Status/Location transition */}
                  {(m.fromStatus && m.toStatus) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>{m.fromStatus} → {m.toStatus}</span>
                    </div>
                  )}

                  {(m.fromLocation && m.toLocation) && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <ArrowRightLeft className="w-3 h-3" />
                      <span>{m.fromLocation} → {m.toLocation}</span>
                    </div>
                  )}

                  {/* Reason */}
                  {m.reason && (
                    <p className="text-xs text-muted-foreground italic">{m.reason}</p>
                  )}

                  {/* Moved by */}
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70 pt-1 border-t border-dashed">
                    <User className="w-3 h-3" />
                    <span>{m.movedBy || 'System'}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  )
}