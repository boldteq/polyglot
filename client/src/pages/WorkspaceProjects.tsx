import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, RefreshCw, Plus, X, Archive, Search, Filter, Unlink, RotateCcw } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import { toast } from '../components/Toast'
import { relTime } from '../lib/relTime'
import { confirmDialog } from '../lib/confirm'
import ProjectCard from '../components/workspace/ProjectCard'
import { getWorkspaceProjects, getArchivedWorkspaceProjects, getWorkspaceEscalations, ackWorkspaceEscalation, createWorkspaceProject, linkWorkspaceProject, updateWorkspaceProject, deleteWorkspaceProject, setWorkspaceProjectStatus, syncWorkspaceProjects, getLensLatest, PROJECT_STATUSES, type WorkspaceProject, type AssembledBuild, type ProjectStatus } from '../lib/api'

type Filter = 'all' | 'attention' | 'passing'

// Projects home — the one center of gravity. Every discovered build is auto-adopted
// into this unified list (no "unlinked builds" split). Attention surfaces inline.
export default function WorkspaceProjects() {
  const nav = useNavigate()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [unlinked, setUnlinked] = useState<AssembledBuild[]>([])
  const [reasons, setReasons] = useState<Record<string, string[]>>({}) // buildId → escalation reasons
  const [acked, setAcked] = useState<Set<string>>(new Set()) // buildIds whose escalation is acknowledged
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [linkFor, setLinkFor] = useState<WorkspaceProject | null>(null)
  const [editFor, setEditFor] = useState<WorkspaceProject | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sort, setSort] = useState<'recent' | 'score' | 'name'>('recent')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({})
  const [archived, setArchived] = useState<WorkspaceProject[] | null>(null)

  // Load active projects + escalations + the archived list together, so the
  // archived count is always known (the "View archived" affordance stays correct
  // even when every project is archived and the main list is empty).
  const load = useCallback(() => {
    setLoading(true); setError(null)
    Promise.all([
      getWorkspaceProjects(),
      getWorkspaceEscalations().catch(() => ({ escalations: [] as { buildId: string; reasons: string[]; acknowledged?: boolean }[] })),
      getArchivedWorkspaceProjects().catch(() => ({ projects: [] as WorkspaceProject[] })),
    ])
      .then(([d, esc, arch]) => {
        setProjects(d.projects); setUnlinked(d.unlinkedBuilds); setArchived(arch.projects)
        setReasons(Object.fromEntries(esc.escalations.map((e) => [e.buildId, e.reasons])))
        setAcked(new Set(esc.escalations.filter((e) => e.acknowledged).map((e) => e.buildId)))
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const restore = useCallback(async (p: WorkspaceProject) => {
    try { await setWorkspaceProjectStatus(p.id, 'intake'); toast('success', `${p.name} restored`); load() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Restore failed') }
  }, [load])

  // Lovable-style preview thumbnails: pull the latest Lens desktop/home frame per
  // build in parallel (best-effort; cards fall back to a gradient when absent).
  useEffect(() => {
    const withDir = projects.filter((p) => p.build?.dir)
    if (!withDir.length) return
    let alive = true
    Promise.allSettled(withDir.map((p) => getLensLatest(p.build!.dir).then((l) => {
      const f = l.present ? (l.frames.find((x) => x.viewport === 'desktop' && x.surface === 'home') ?? l.frames.find((x) => x.viewport === 'desktop') ?? l.frames[0]) : null
      return [p.id, f?.rest ?? null] as const
    }))).then((res) => {
      if (!alive) return
      const map: Record<string, string | null> = {}
      for (const r of res) if (r.status === 'fulfilled') { map[r.value[0]] = r.value[1] }
      setThumbs(map)
    })
    return () => { alive = false }
  }, [projects])

  const archive = useCallback(async (p: WorkspaceProject) => {
    const ok = await confirmDialog({ title: `Archive ${p.name}?`, message: 'It will be hidden from the list. The linked build on disk is untouched.', confirmLabel: 'Archive' })
    if (!ok) return
    try { await deleteWorkspaceProject(p.id); toast('success', 'Project archived'); load() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Archive failed') }
  }, [load])

  // attention = has reasons AND not acknowledged (an ack clears the badge/count
  // until the build's reasons change, at which point the server drops the ack).
  const attentionOf = useCallback((p: WorkspaceProject) => (p.build && !acked.has(p.build.buildId) ? reasons[p.build.buildId] || [] : []), [reasons, acked])

  const acknowledge = useCallback(async (p: WorkspaceProject) => {
    try { await ackWorkspaceEscalation(p.id); toast('success', 'Escalation acknowledged'); load() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Acknowledge failed') }
  }, [load])

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
    const summary = {
      total: projects.length,
      attention: projects.filter((p) => attentionOf(p).length).length,
      inProgress: projects.filter((p) => p.status === 'building' || p.status === 'preview').length,
      live: projects.filter((p) => p.status === 'published').length,
    }
    const ql = q.trim().toLowerCase()
    const shown = projects.filter((p) => {
      if (ql && !(`${p.name} ${p.niche || ''} ${p.domain || ''}`.toLowerCase().includes(ql))) return false
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (filter === 'attention') return attentionOf(p).length > 0
      if (filter === 'passing') return p.build?.lensVerdict === 'pass'
      return true
    }).sort((a, b) => {
      if (sort === 'score') return (b.build?.score ?? -1) - (a.build?.score ?? -1)
      if (sort === 'name') return a.name.localeCompare(b.name)
      // recent: by build capture or project update, newest first
      const ta = new Date(a.build?.capturedAt ?? a.updated_at ?? a.created_at).getTime()
      const tb = new Date(b.build?.capturedAt ?? b.updated_at ?? b.created_at).getTime()
      return tb - ta
    })
    return { shown, summary }
  }, [projects, q, filter, statusFilter, sort, attentionOf])

  const openProject = (p: WorkspaceProject) => nav(`/workspace/p/${p.id}`)

  return (
    <PageShell
      title="Shopify Projects"
      subtitle="Your client Shopify theme builds — brand · niche · store, with live build state"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />New project</button>
          <button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      }
    >
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden">
              <div className="h-36 bg-surface-2 animate-pulse" />
              <div className="p-4 space-y-2.5">
                <div className="h-4 w-2/3 bg-surface-2 rounded animate-pulse" />
                <div className="h-3 w-1/2 bg-surface-2 rounded animate-pulse" />
                <div className="flex items-center gap-2.5 pt-1">
                  <div className="w-9 h-9 rounded-full bg-surface-2 animate-pulse shrink-0" />
                  <div className="h-4 w-20 bg-surface-2 rounded-full animate-pulse" />
                </div>
                <div className="h-1.5 w-full bg-surface-2 rounded-full animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : (projects.length === 0 && (archived?.length ?? 0) === 0 && statusFilter !== 'archived') ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to capture intake — or theme folders are auto-detected and appear here." action={{ label: 'New project', onClick: () => setShowNew(true) }} />
      ) : (
        <div className="space-y-4">
          {/* summary strip — human project lifecycle, not build-health jargon */}
          <div className="flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-1 text-[13px] px-1">
            <span><b>{summary.total}</b> <span className="text-text-muted">projects</span></span>
            <span className={summary.attention ? 'text-red' : 'text-text-muted'}><b>{summary.attention}</b> need attention</span>
            <span><b>{summary.inProgress}</b> <span className="text-text-muted">in progress</span></span>
            <span><b>{summary.live}</b> <span className="text-text-muted">live</span></span>
            {(archived?.length ?? 0) > 0 && statusFilter !== 'archived' && (
              <button onClick={() => setStatusFilter('archived')} className="flex items-center gap-1 text-text-muted hover:text-accent transition-colors ml-auto">
                <Archive className="w-3.5 h-3.5" /> <b>{archived!.length}</b> archived
              </button>
            )}
            {statusFilter === 'archived' && (
              <button onClick={() => setStatusFilter('all')} className="flex items-center gap-1 text-accent hover:underline ml-auto">← Back to active</button>
            )}
          </div>

          {/* search + filter — grouped into one subtle toolbar so they read as a set */}
          <div className="flex items-center gap-2 flex-wrap bg-surface-2/40 border border-border-subtle rounded-xl px-2 py-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="input w-full pl-8 text-[13px]" />
            </div>
            <div className="segmented">
              {(['all', 'attention', 'passing'] as Filter[]).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  title={f === 'all' ? 'Show all projects' : f === 'attention' ? 'Only projects that need review' : 'Only projects that passed all checks'}
                  className={`segmented-btn capitalize ${filter === f ? 'segmented-btn-active' : ''}`}>{f}</button>
              ))}
            </div>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="input w-auto shrink-0 text-[12px] py-1.5 capitalize" aria-label="Filter by status">
              <option value="all">All statuses</option>
              {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'score' | 'name')} className="input w-auto shrink-0 text-[12px] py-1.5" aria-label="Sort projects">
              <option value="recent">Recent</option>
              <option value="score">Score</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>

          {/* bulk action bar — appears when ≥1 selected */}
          {selected.size > 0 && (
            <div className="flex items-center gap-3 flex-wrap card px-3 py-2 bg-accent/5 border-accent/30">
              <span className="text-[13px] font-medium">{selected.size} selected</span>
              <div className="flex items-center gap-1.5">
                <label htmlFor="bulk-status" className="text-[12px] text-text-muted">Set status</label>
                <select id="bulk-status" disabled={bulkBusy} defaultValue="" onChange={(e) => { if (e.target.value) { bulkStatus(e.target.value as ProjectStatus); e.target.value = '' } }}
                  className="input text-[12px] py-1 capitalize" aria-label="Set status for selected projects">
                  <option value="" disabled>Select new status…</option>
                  {PROJECT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <button onClick={bulkArchive} disabled={bulkBusy} className="btn-ghost btn-sm flex items-center gap-1.5 text-red text-[12px] disabled:opacity-50"><Archive className="w-3.5 h-3.5" /> Archive</button>
              <button onClick={clearSel} disabled={bulkBusy} className="btn-ghost btn-sm text-[12px] ml-auto">Clear</button>
            </div>
          )}

          {statusFilter === 'archived' ? (
            /* Archived view — restore-only list (these are hidden from the main grid) */
            archived === null ? (
              <div className="card p-8 text-center text-[13px] text-text-muted">Loading archived…</div>
            ) : archived.length === 0 ? (
              <EmptyState icon={Archive} title="No archived projects" description="Archive a project from its card to hide it from the main list — it'll show up here to restore." size="sm" />
            ) : (
              <div className="card divide-y divide-border">
                {archived.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                    <Archive className="w-4 h-4 text-text-muted shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-[13px] capitalize truncate">{p.name}</div>
                      <div className="text-[12px] text-text-muted truncate">{[p.niche, p.domain, `archived ${relTime(p.updated_at)}`].filter(Boolean).join(' · ')}</div>
                    </div>
                    <button onClick={() => restore(p)} className="btn-ghost btn-sm flex items-center gap-1.5 text-accent shrink-0"><RotateCcw className="w-3.5 h-3.5" /> Restore</button>
                  </div>
                ))}
              </div>
            )
          ) : (
          /* project card grid — auto-rows-fr keeps every card the same height */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
            <button onClick={() => setShowNew(true)}
              className="card card-hover border-dashed flex flex-col items-center justify-center gap-2 text-text-muted hover:text-accent hover:border-accent/40 min-h-[260px] transition-colors">
              <Plus className="w-7 h-7" />
              <span className="text-[13px] font-medium">New project</span>
            </button>
            {shown.map((p) => (
              <ProjectCard key={p.id} project={p} thumb={thumbs[p.id] ?? null} attention={attentionOf(p)}
                selected={selected.has(p.id)} anySelected={selected.size > 0}
                onOpen={() => openProject(p)} onToggleSel={() => toggleSel(p.id)}
                onEdit={() => setEditFor(p)} onArchive={() => archive(p)} onLink={() => setLinkFor(p)} onAck={() => acknowledge(p)} />
            ))}
            {shown.length === 0 && <div className="col-span-full"><EmptyState icon={Filter} title="No projects match" description="Adjust your search or filters to see more." size="sm" /></div>}
          </div>
          )}
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); load() }} />}
      {linkFor && <LinkBuildModal project={linkFor} builds={unlinked} onClose={() => setLinkFor(null)} onLinked={() => { setLinkFor(null); load() }} onRescan={load} />}
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
  const [saving, setSaving] = useState(false); const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!name.trim()) { setErr('Brand name is required'); return }
    setErr(null); setSaving(true)
    try { await createWorkspaceProject({ name: name.trim(), niche: niche.trim() || undefined, domain: domain.trim() || undefined }); toast('success', 'Project created'); onCreated() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Create failed') } finally { setSaving(false) }
  }
  return (
    <Modal title="New project" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-medium text-text">Brand / name <span className="text-red">*</span></label>
          <input value={name} onChange={(e) => { setName(e.target.value); if (err) setErr(null) }} className={`input w-full ${err ? 'border-red' : ''}`} placeholder="Acme Skincare" autoFocus />
          {err && <p className="text-[11px] text-red mt-1">{err}</p>}
        </div>
        <div><label className="text-[12px] text-text-muted">Niche</label><input value={niche} onChange={(e) => setNiche(e.target.value)} className="input w-full" placeholder="skincare" /></div>
        <div><label className="text-[12px] text-text-muted">Store domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} className="input w-full" placeholder="acme.myshopify.com" /></div>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm w-full disabled:opacity-50">{saving ? 'Creating…' : 'Create project'}</button>
      </div>
    </Modal>
  )
}

function EditProjectModal({ project, onClose, onSaved }: { project: WorkspaceProject; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name); const [niche, setNiche] = useState(project.niche || ''); const [domain, setDomain] = useState(project.domain || '')
  const [saving, setSaving] = useState(false); const [err, setErr] = useState<string | null>(null)
  const save = async () => {
    if (!name.trim()) { setErr('Brand name is required'); return }
    setErr(null); setSaving(true)
    try { await updateWorkspaceProject(project.id, { name: name.trim(), niche: niche.trim() || null, domain: domain.trim() || null }); toast('success', 'Project updated'); onSaved() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Update failed') } finally { setSaving(false) }
  }
  return (
    <Modal title="Edit project" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-[12px] font-medium text-text">Brand / name <span className="text-red">*</span></label>
          <input value={name} onChange={(e) => { setName(e.target.value); if (err) setErr(null) }} className={`input w-full ${err ? 'border-red' : ''}`} autoFocus />
          {err && <p className="text-[11px] text-red mt-1">{err}</p>}
        </div>
        <div><label className="text-[12px] text-text-muted">Niche</label><input value={niche} onChange={(e) => setNiche(e.target.value)} className="input w-full" /></div>
        <div><label className="text-[12px] text-text-muted">Store domain</label><input value={domain} onChange={(e) => setDomain(e.target.value)} className="input w-full" /></div>
        <button onClick={save} disabled={saving} className="btn-primary btn-sm w-full disabled:opacity-50">{saving ? 'Saving…' : 'Save changes'}</button>
      </div>
    </Modal>
  )
}

function LinkBuildModal({ project, builds, onClose, onLinked, onRescan }: { project: WorkspaceProject; builds: AssembledBuild[]; onClose: () => void; onLinked: () => void; onRescan: () => void }) {
  const [scanning, setScanning] = useState(false)
  const link = async (buildId: string) => {
    try { await linkWorkspaceProject(project.id, buildId); toast('success', 'Folder linked'); onLinked() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Link failed') }
  }
  const rescan = async () => {
    setScanning(true)
    try { const r = await syncWorkspaceProjects(); toast('success', r.adopted ? `Found ${r.adopted} new folder${r.adopted === 1 ? '' : 's'}` : 'Re-scanned — no new folders'); onRescan() }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Re-scan failed') }
    finally { setScanning(false) }
  }
  return (
    <Modal title={`Link a folder to ${project.name}`} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-[12px] text-text-muted leading-snug">Theme folders under your build roots are detected automatically. Pick one to link, or drop a new folder there and re-scan.</p>
        {builds.length === 0 ? (
          <EmptyState icon={Unlink} title="No unlinked folders found" description="Add a theme folder under your build roots, then re-scan to see it here." size="sm" card={false} />
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto">
            {builds.map((b) => (
              <button key={b.buildId} onClick={() => link(b.buildId)} className="w-full px-3 py-2 rounded-lg border border-border hover:border-accent/40 hover:bg-surface-2 text-left transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-medium capitalize truncate">{b.client}</span>
                  {b.store && <span className="text-text-muted text-[11px] shrink-0">{b.store}</span>}
                </div>
                <code className="text-[11px] text-text-muted/80 truncate block mt-0.5">{b.dir}</code>
              </button>
            ))}
          </div>
        )}
        <button onClick={rescan} disabled={scanning} className="btn-ghost btn-sm w-full flex items-center justify-center gap-1.5 disabled:opacity-50">
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} /> {scanning ? 'Re-scanning…' : 'Re-scan folders'}
        </button>
      </div>
    </Modal>
  )
}
