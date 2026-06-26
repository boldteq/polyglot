import { useState } from 'react'
import EmptyState from '../EmptyState'
import { FileText, Pencil, X } from 'lucide-react'
import { toast } from '../Toast'
import { updateWorkspaceProject, type ProjectDetail } from '../../lib/api'

// The project brief — surfaces the captured intake (brand/niche/store/discovery)
// so the north-star is visible during the build instead of an opaque JSON blob.
// Editable inline: brand/niche/domain (top-level) + brand voice / goals / audience
// (merged into intake_json) so the brief is captured HERE, not via a JSON editor.
const LABELS: Record<string, string> = {
  source: 'Source', store: 'Store', themeName: 'Theme', themeId: 'Theme ID',
  brand: 'Brand voice', niche: 'Niche', domain: 'Domain', goals: 'Goals', audience: 'Audience',
}

export default function BriefPanel({ detail, onReload }: { detail: ProjectDetail; onReload?: () => void }) {
  const { project } = detail
  const [editing, setEditing] = useState(false)
  const intake = (project.intake || {}) as Record<string, unknown>
  // intake_json often carries name/niche/domain (from create + auto-adopt) — but
  // those are already shown as the top-level meta rows below, so skip them here to
  // avoid duplicate "name"/"Niche"/"Domain" rows.
  const META_DUP = new Set(['name', 'niche', 'domain'])
  const entries = Object.entries(intake).filter(([k, v]) => v != null && v !== '' && typeof v !== 'object' && !META_DUP.has(k))
  const meta = [
    ['Brand / name', project.name],
    ['Niche', project.niche],
    ['Store / domain', project.domain],
  ].filter(([, v]) => v) as [string, string][]

  const empty = !meta.length && !entries.length

  return (
    <div className="space-y-2">
      <div className="flex justify-end -mb-1">
        <button onClick={() => setEditing(true)} className="btn-ghost btn-sm flex items-center gap-1.5 text-[12px]"><Pencil className="w-3.5 h-3.5" /> Edit brief</button>
      </div>
      {empty ? (
        <EmptyState icon={FileText} title="No brief captured" description="Add brand, niche, store, goals, and audience so the build has a north-star." />
      ) : (
        <div className="card p-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
            {meta.map(([k, v]) => (
              <div key={k}><dt className="text-[11px] text-text-muted">{k}</dt><dd className="text-[13px] capitalize">{v}</dd></div>
            ))}
            {entries.map(([k, v]) => (
              <div key={k}><dt className="text-[11px] text-text-muted">{LABELS[k] || k}</dt><dd className="text-[13px] break-words whitespace-pre-wrap">{String(v)}</dd></div>
            ))}
          </dl>
        </div>
      )}
      {editing && <BriefEditModal detail={detail} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onReload?.() }} />}
    </div>
  )
}

function BriefEditModal({ detail, onClose, onSaved }: { detail: ProjectDetail; onClose: () => void; onSaved: () => void }) {
  const { project } = detail
  const intake = (project.intake || {}) as Record<string, unknown>
  const str = (v: unknown) => (v == null ? '' : String(v))
  const [name, setName] = useState(project.name || '')
  const [niche, setNiche] = useState(project.niche || '')
  const [domain, setDomain] = useState(project.domain || '')
  const [brand, setBrand] = useState(str(intake.brand))
  const [goals, setGoals] = useState(str(intake.goals))
  const [audience, setAudience] = useState(str(intake.audience))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const save = async () => {
    if (!name.trim()) { setErr('Brand name is required'); return }
    setErr(null); setSaving(true)
    try {
      // intake merges server-side (shallow) — only send the fields we edit here
      await updateWorkspaceProject(project.id, {
        name: name.trim(), niche: niche.trim() || null, domain: domain.trim() || null,
        intake: { brand: brand.trim(), goals: goals.trim(), audience: audience.trim() },
      })
      toast('success', 'Brief updated')
      onSaved()
    } catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-[480px] max-w-full bg-surface border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">Edit brief</span>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-[12px] font-medium text-text">Brand / name <span className="text-red">*</span></label><input value={name} onChange={(e) => { setName(e.target.value); if (err) setErr(null) }} className={`input w-full ${err ? 'border-red' : ''}`} autoFocus />{err && <p className="text-[11px] text-red mt-1">{err}</p>}</div>
            <div><label className="text-[12px] text-text-muted">Niche</label><input value={niche} onChange={(e) => setNiche(e.target.value)} className="input w-full" placeholder="skincare" /></div>
          </div>
          <div><label className="text-[12px] text-text-muted">Store domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} className="input w-full" placeholder="acme.myshopify.com" /></div>
          <div><label className="text-[12px] text-text-muted">Brand voice</label><input value={brand} onChange={(e) => setBrand(e.target.value)} className="input w-full" placeholder="warm, clinical, restrained" /></div>
          <div><label className="text-[12px] text-text-muted">Goals</label><textarea value={goals} onChange={(e) => setGoals(e.target.value)} rows={3} className="input w-full resize-none" placeholder="e.g. lift PDP CVR to 3.5%, AOV +15% via bundles" /></div>
          <div><label className="text-[12px] text-text-muted">Audience</label><textarea value={audience} onChange={(e) => setAudience(e.target.value)} rows={2} className="input w-full resize-none" placeholder="who is this for?" /></div>
          <button onClick={save} disabled={saving} className="btn-primary btn-sm w-full disabled:opacity-50">{saving ? 'Saving…' : 'Save brief'}</button>
        </div>
      </div>
    </div>
  )
}
