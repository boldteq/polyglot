import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, RefreshCw, Plus, Link2, ChevronRight, X, Pencil, Archive, Search, Link as LinkIcon, Unlink, CheckSquare, Square } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import { relTime } from '../lib/relTime'
import ScoreGauge from '../components/workspace/ScoreGauge'
import StepIndicator from '../components/workspace/StepIndicator'
import { getWorkspaceProjects, getWorkspaceEscalations, createWorkspaceProject, linkWorkspaceProject, updateWorkspaceProject, deleteWorkspaceProject, setWorkspaceProjectStatus, PROJECT_STATUSES, type WorkspaceProject, type AssembledBuild, type ProjectStatus } from '../lib/api'

type Filter = 'all' | 'attention' | 'passing'
const STATUS_TONE: Record<string, string> = {
  intake: 'text-text-muted bg-text-muted/10', building: 'text-accent bg-accent/10',
  preview: 'text-amber bg-amber/10', published: 'text-green bg-green/10', archived: 'text-text-muted bg-text-muted/10',
}

// Projects home — the one center of gravity. Every discovered build is auto-adopted
// into this unified list (no "unlinked builds" split). Attention surfaces inline.
export default function WorkspaceProjects() {
  const nav = useNavigate()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [unlinked, setUnlinked] = useState<AssembledBuild[]>([])
  const [reasons, setReasons] = useState<Record<string, string[]>>({}) // buildId → escalation reasons
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [linkFor, setLinkFor] = useState<WorkspaceProject | null>(null)
  const [editFor, setEditFor] = useState<WorkspaceProject | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    Promise.all([getWorkspaceProjects(), getWorkspaceEscalations().catch(() => ({ escalations: [] as { buildId: string; reasons: string[] }[] }))])
      .then(([d, esc]) => {
        setProjects(d.projects); setUnlinked(d.unlinkedBuilds)
        setReasons(Object.fromEntries(esc.escalations.map((e) => [e.buildId, e.reasons])))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const archive = useCallback(async (p: WorkspaceProject) => {
    const ok = await confirmDialog({ title: `Archive ${p.name}?`, message: 'It will be hidden from the list. The linked build on disk is untouched.', confirmLabel: 'Archive' })
    if (!ok) return
    try { await deleteWorkspaceProject(p.id); toast('success', 'Project archived'); load() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Archive failed') }
  }, [load])

  const attentionOf = useCallback((p: WorkspaceProject) => (p.build ? reasons[p.build.buildId] || [] : []), [reasons])

  const toggleSel = useCallback((id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n }), [])
  const clearSel = useCallback(() => setSelected(new Set()), [])

  const bulkStatus = useCallback(async (status: ProjectStatus) => {
    const ids = [...selected]; if (!ids.length) return
    setBulkBusy(true)
    const res = await Promise.allSettled(ids.map((id) => setWorkspaceProjectStatus(id, status)))
    const ok = res.filter((r) => r.status === 'fulfilled').length
    toast(ok === ids.length ? 'success' : 'warn', `${ok}/${ids.length} → ${status}`)
    setBulkBusy(false); clearSel(); load()
  }, [selected, clearSel, load])

  const bulkArchive = useCallback(async () => {
    const ids = [...selected]; if (!ids.length) return
    const ok = await confirmDialog({ title: `Archive ${ids.length} project${ids.length === 1 ? '' : 's'}?`, message: 'They will be hidden from the list. Linked builds on disk are untouched.', confirmLabel: 'Archive' })
    if (!ok) return
    setBulkBusy(true)
    const res = await Promise.allSettled(ids.map((id) => deleteWorkspaceProject(id)))
    const done = res.filter((r) => r.status === 'fulfilled').length
    toast(done === ids.length ? 'success' : 'warn', `${done}/${ids.length} archived`)
    setBulkBusy(false); clearSel(); load()
  }, [selected, clearSel, load])

  // summary + filtered/searched list
  const { shown, summary } = useMemo(() => {
    const withScore = projects.filter((p) => p.build)
    const summary = {
      total: projects.length,
      attention: projects.filter((p) => attentionOf(p).length).length,
      avg: withScore.length ? Math.round(withScore.reduce((s, p) => s + (p.build!.score || 0), 0) / withScore.length) : 0,
      passing: withScore.filter((p) => p.build!.lensVerdict === 'pass').length,
    }
    const ql = q.trim().toLowerCase()
    const shown = projects.filter((p) => {
      if (ql && !(`${p.name} ${p.niche || ''} ${p.domain || ''}`.toLowerCase().includes(ql))) return false
      if (filter === 'attention') return attentionOf(p).length > 0
      if (filter === 'passing') return p.build?.lensVerdict === 'pass'
      return true
    })
    return { shown, summary }
  }, [projects, q, filter, attentionOf])

  const openProject = (p: WorkspaceProject) => nav(`/workspace/p/${p.id}`)

  return (
    <PageShell
      title="Projects"
      subtitle="Your client projects — brand · niche · store, with live build state"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />New project</button>
          <button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      }
    >
      {loading ? <Spinner /> : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to capture intake — or theme folders are auto-detected and appear here." action={{ label: 'New project', onClick: () => setShowNew(true) }} />
      ) : (
        <div className="space-y-4">
          {/* summary strip */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-[13px] px-1">
            <span><b>{summary.total}</b> <span className="text-text-muted">projects</span></span>
            <span className={summary.attention ? 'text-red' : ''}><b>{summary.attention}</b> <span className={summary.attention ? '' : 'text-text-muted'}>need attention</span></span>
            <span><b>{summary.avg}</b> <span className="text-text-muted">avg score</span></span>
            <span><b>{summary.passing}</b> <span className="text-text-muted">passing</span></span>
          </div>

          {/* search + filter */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="input w-full pl-8 text-[13px]" />
            </div>
            <div className="segmented">
              {(['all', 'attention', 'passing'] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`segmented-btn capitalize ${filter === f ? 'segmented-btn-active' : ''}`}>{f}</button>
              ))}
            </div>
          </div>

          {/* bulk action bar — appears when ≥1 selected */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 flex-wrap card px-3 py-2 bg-accent/5 border-accent/30">
              <span className="text-[13px] font-medium">{selected.size} selected</span>
              <div className="flex items-center gap-1.5">
                <span className="text-[12px] text-text-muted">Set status</span>
                <select disabled={bulkBusy} defaultValue="" onChange={(e) => { if (e.target.value) { bulkStatus(e.target.value as ProjectStatus); e.target.value = '' } }}
                  className="input text-[12px] py-1" aria-label="Set status for selected">
                  <option value="" disabled>choose…</option>
                  {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={bulkArchive} disabled={bulkBusy} className="btn-ghost btn-sm flex items-center gap-1.5 text-red text-[12px] disabled:opacity-50"><Archive className="w-3.5 h-3.5" /> Archive</button>
              <button onClick={clearSel} disabled={bulkBusy} className="btn-ghost btn-sm text-[12px] ml-auto">Clear</button>
            </div>
          )}

          {/* unified project list */}
          <div className="card divide-y divide-border">
            {shown.map((p) => {
              const att = attentionOf(p)
              return (
                <div key={p.id} role="button" tabIndex={0} onClick={() => openProject(p)}
                  onKeyDown={(e) => { if (e.key === 'Enter') openProject(p) }}
                  className={`group flex items-center gap-4 px-4 py-3 hover:bg-text-muted/5 cursor-pointer transition-colors ${selected.has(p.id) ? 'bg-accent/5' : ''}`}>
                  <button onClick={(e) => { e.stopPropagation(); toggleSel(p.id) }} aria-label={selected.has(p.id) ? 'Deselect' : 'Select'}
                    className={`shrink-0 ${selected.has(p.id) ? 'text-accent' : 'text-text-muted/40 hover:text-text-muted opacity-0 group-hover:opacity-100'} ${selected.size > 0 ? 'opacity-100' : ''}`}>
                    {selected.has(p.id) ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  {p.build ? <ScoreGauge score={p.build.score} grade={p.build.grade} size={40} showGrade={false} /> : <div className="w-10 h-10 rounded-full border-2 border-border shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium capitalize truncate flex items-center gap-2">
                      {p.name}
                      {p.niche && <span className="text-[10px] uppercase tracking-wide text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">{p.niche}</span>}
                      {p.build_dir ? <LinkIcon className="w-3 h-3 text-green shrink-0" /> : <Unlink className="w-3 h-3 text-text-muted shrink-0" />}
                      {att.length > 0 && <span className="text-[10px] bg-red/10 text-red px-1.5 py-0.5 rounded normal-case truncate max-w-[240px]">{att[0]}</span>}
                    </div>
                    <div className="text-[12px] text-text-muted truncate">{p.domain || (p.build?.store) || '—'}{p.build ? ` · step ${p.build.step.current}/18 · score ${p.build.score}` : ' · intake only'}</div>
                  </div>
                  {p.build && <div className="w-28 hidden md:block"><StepIndicator current={p.build.step.current} total={p.build.step.total} showLabel={false} /></div>}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0 ${STATUS_TONE[p.status] || STATUS_TONE.intake}`}>{p.status}</span>
                  <span className="text-[11px] text-text-muted shrink-0 w-16 text-right hidden lg:block">{relTime(p.build?.capturedAt ?? p.updated_at)}</span>
                  {/* hover actions */}
                  <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditFor(p)} title="Edit" className="btn-ghost btn-sm p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                    {!p.build_dir && <button onClick={() => setLinkFor(p)} title="Link a build folder" className="btn-ghost btn-sm p-1.5"><Link2 className="w-3.5 h-3.5" /></button>}
                    <button onClick={() => archive(p)} title="Archive" className="btn-ghost btn-sm p-1.5 text-text-muted hover:text-red"><Archive className="w-3.5 h-3.5" /></button>
                  </div>
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0" />
                </div>
              )
            })}
            {shown.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-text-muted">No projects match.</div>}
          </div>
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
      {linkFor && <LinkBuildModal project={linkFor} builds={unlinked} onClose={() => setLinkFor(null)} onLinked={() => { setLinkFor(null); load() }} />}
      {editFor && <EditProjectModal project={editFor} onClose={() => setEditFor(null)} onSaved={() => { setEditFor(null); load() }} />}
    </PageShell>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-[420px] max-w-full bg-surface border border-border rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">{title}</span>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function NewProjectModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState(''); const [niche, setNiche] = useState(''); const [domain, setDomain] = useState('')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim()) { toast('warn', 'Name is required'); return }
    setSaving(true)
    try { await createWorkspaceProject({ name: name.trim(), niche: niche.trim() || undefined, domain: domain.trim() || undefined }); toast('success', 'Project created'); onCreated() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Create failed') } finally { setSaving(false) }
  }
  return (
    <Modal title="New project" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="text-[12px] text-text-muted">Brand / name *</label><input value={name} onChange={(e) => setName(e.target.value)} className="input w-full" placeholder="Acme Skincare" autoFocus /></div>
        <div><label className="text-[12px] text-text-muted">Niche</label><input value={niche} onChange={(e) => setNiche(e.target.value)} className="input w-full" placeholder="skincare" /></div>
        <div><label className="text-[12px] text-text-muted">Store domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} className="input w-full" placeholder="acme.myshopify.com" /></div>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm w-full disabled:opacity-50">{saving ? 'Creating…' : 'Create project'}</button>
      </div>
    </Modal>
  )
}

function EditProjectModal({ project, onClose, onSaved }: { project: WorkspaceProject; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name); const [niche, setNiche] = useState(project.niche || ''); const [domain, setDomain] = useState(project.domain || '')
  const [saving, setSaving] = useState(false)
  const save = async () => {
    if (!name.trim()) { toast('warn', 'Name is required'); return }
    setSaving(true)
    try { await updateWorkspaceProject(project.id, { name: name.trim(), niche: niche.trim() || null, domain: domain.trim() || null }); toast('success', 'Project updated'); onSaved() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed') } finally { setSaving(false) }
  }
  return (
    <Modal title="Edit project" onClose={onClose}>
      <div className="space-y-3">
        <div><label className="text-[12px] text-text-muted">Brand / name *</label><input value={name} onChange={(e) => setName(e.target.value)} className="input w-full" autoFocus /></div>
        <div><label className="text-[12px] text-text-muted">Niche</label><input value={niche} onChange={(e) => setNiche(e.target.value)} className="input w-full" /></div>
        <div><label className="text-[12px] text-text-muted">Store domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} className="input w-full" /></div>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm w-full disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  )
}

function LinkBuildModal({ project, builds, onClose, onLinked }: { project: WorkspaceProject; builds: AssembledBuild[]; onClose: () => void; onLinked: () => void }) {
  const link = async (buildId: string) => {
    try { await linkWorkspaceProject(project.id, buildId); toast('success', 'Build linked'); onLinked() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Link failed') }
  }
  return (
    <Modal title={`Link a build to ${project.name}`} onClose={onClose}>
      {builds.length === 0 ? <p className="text-[13px] text-text-muted">No unlinked builds to choose from.</p> : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {builds.map((b) => (
            <button key={b.buildId} onClick={() => link(b.buildId)} className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-2 text-left text-[13px]">
              <span className="capitalize">{b.client}</span>
              <span className="text-text-muted text-[11px]">{b.store || ''}</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  )
}
