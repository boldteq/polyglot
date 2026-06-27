// Shared run-status glyph — distinct SHAPE per status (not color alone) so the
// signal survives colorblindness. Used by both the Activity card feed and the
// sortable table view.
import { CheckCircle, XCircle, AlertCircle, MinusCircle, Loader2, Clock } from 'lucide-react'
import type { RunStatus } from '../lib/scheduleFormat'

export default function StatusIcon({ status, className = 'w-4 h-4' }: { status: RunStatus; className?: string }) {
  if (status === 'success') return <CheckCircle className={`${className} text-green shrink-0`} />
  if (status === 'error') return <XCircle className={`${className} text-red shrink-0`} />
  if (status === 'crashed') return <AlertCircle className={`${className} text-amber shrink-0`} />
  if (status === 'cancelled') return <MinusCircle className={`${className} text-amber shrink-0`} />
  if (status === 'running') return <Loader2 className={`${className} text-blue animate-spin shrink-0`} />
  return <Clock className={`${className} text-text-muted shrink-0`} />
}
