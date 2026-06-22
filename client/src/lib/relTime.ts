// Compact relative-time formatter shared across Workspace surfaces.
// Accepts a ms epoch, an ISO string, or null.
export function relTime(at: number | string | null | undefined): string {
  if (at == null) return ''
  const ms = typeof at === 'number' ? at : new Date(at).getTime()
  if (Number.isNaN(ms)) return ''
  const d = Date.now() - ms
  if (d < 0) return 'just now'
  const h = Math.floor(d / 3600000)
  if (h < 1) return `${Math.max(1, Math.floor(d / 60000))}m ago`
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return `${Math.floor(days / 30)}mo ago`
}
