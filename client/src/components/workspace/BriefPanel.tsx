import EmptyState from '../EmptyState'
import { FileText } from 'lucide-react'
import type { ProjectDetail } from '../../lib/api'

// The project brief — surfaces the captured intake (brand/niche/store/discovery)
// so the north-star is visible during the build instead of an opaque JSON blob.
const LABELS: Record<string, string> = {
  source: 'Source', store: 'Store', themeName: 'Theme', themeId: 'Theme ID',
  brand: 'Brand', niche: 'Niche', domain: 'Domain', goals: 'Goals', audience: 'Audience',
}

export default function BriefPanel({ detail }: { detail: ProjectDetail }) {
  const { project } = detail
  const intake = (project.intake || {}) as Record<string, unknown>
  const entries = Object.entries(intake).filter(([, v]) => v != null && v !== '' && typeof v !== 'object')
  const meta = [
    ['Brand / name', project.name],
    ['Niche', project.niche],
    ['Store / domain', project.domain],
  ].filter(([, v]) => v) as [string, string][]

  if (!meta.length && !entries.length) {
    return <EmptyState icon={FileText} title="No brief captured" description="Edit the project to add brand, niche, and store, or run discovery to populate the brief." />
  }
  return (
    <div className="card p-4">
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
        {meta.map(([k, v]) => (
          <div key={k}><dt className="text-[11px] text-text-muted">{k}</dt><dd className="text-[13px] capitalize">{v}</dd></div>
        ))}
        {entries.map(([k, v]) => (
          <div key={k}><dt className="text-[11px] text-text-muted">{LABELS[k] || k}</dt><dd className="text-[13px] break-words">{String(v)}</dd></div>
        ))}
      </dl>
    </div>
  )
}
