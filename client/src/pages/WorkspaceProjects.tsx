import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, RefreshCw, AlertTriangle, Plus, Link2, ChevronRight, X, Pencil, Archive } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { Spinner } from '../components/Skeleton'
import { toast } from '../components/Toast'
import { confirmDialog } from '../lib/confirm'
import ScoreGauge from '../components/workspace/ScoreGauge'
import { getWorkspaceProjects, createWorkspaceProject, linkWorkspaceProject, updateWorkspaceProject, deleteWorkspaceProject, type WorkspaceProject, type AssembledBuild } from '../lib/api'

function gradeFor(s: number) { return s >= 90 ? 'A' : s >= 80 ? 'B' : s >= 70 ? 'C' : 'BLOCK-RISK' }

// Hybrid project registry: intake projects (brand/niche/store) merged with their
// live build state, + the discovered builds not yet linked to a project.
export default function WorkspaceProjects() {
  const nav = useNavigate()
  const [projects, setProjects] = useState<WorkspaceProject[]>([])
  const [unlinked, setUnlinked] = useState<AssembledBuild[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [linkFor, setLinkFor] = useState<WorkspaceProject | null>(null)
  const [editFor, setEditFor] = useState<WorkspaceProject | null>(null)

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getWorkspaceProjects()
      .then((d) => { setProjects(d.projects); setUnlinked(d.unlinkedBuilds) })
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

  return (
    <PageShell
      title="Projects"
      subtitle="Client projects (brand · niche · store) merged with their live build"
      actions={
        <div className="flex items-center gap-2">
          <button onClick={() => setShowNew(true)} className="btn-primary btn-sm flex items-center gap-1.5"><Plus className="w-4 h-4" />New project</button>
          <button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>
        </div>
      }
    >
      {loading ? <Spinner /> : error ? (
        <div className="card p-6 text-red flex items-center gap-2"><AlertTriangle className="w-5 h-5" />{error}
          <button onClick={load} className="underline ml-2">Retry</button></div>
      ) : projects.length === 0 && unlinked.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create a project to capture intake, or builds appear here once discovered." action={{ label: 'New project', onClick: () => setShowNew(true) }} />
      ) : (
        <div className="space-y-6">
          {/* intake projects */}
          {projects.length > 0 && (
            <section>
              <h3 className="font-semibold text-[15px] mb-2">Projects</h3>
              <div className="card divide-y divide-border">
                {projects.map((p) => (
                  <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                    {p.build ? <ScoreGauge score={p.build.score} grade={p.build.grade} size={40} showGrade={false} /> : <div className="w-10 h-10 rounded-full border-2 border-border" />}
                    <div className="min-w-0 flex-1">
                      <div className="font-medium capitalize truncate flex items-center gap-2">
                        {p.name}
                        {p.niche && <span className="text-[10px] uppercase tracking-wide text-text-muted bg-text-muted/10 px-1.5 py-0.5 rounded">{p.niche}</span>}
                      </div>
                      <div className="text-[12px] text-text-muted truncate">{p.domain || '—'}{p.build ? ` · step ${p.build.step.current}/18 · score ${p.build.score}` : ' · not linked to a build'}</div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setEditFor(p)} title="Edit project" className="btn-ghost btn-sm p-1.5"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => archive(p)} title="Archive project" className="btn-ghost btn-sm p-1.5 text-text-muted hover:text-red"><Archive className="w-3.5 h-3.5" /></button>
                      {p.build ? (
                        <button onClick={() => nav(`/workspace/builds/${p.build!.buildId}`)} className="btn-ghost btn-sm flex items-center gap-1">Open <ChevronRight className="w-4 h-4" /></button>
                      ) : (
                        <button onClick={() => setLinkFor(p)} className="btn-ghost btn-sm flex items-center gap-1 text-[12px]"><Link2 className="w-3.5 h-3.5" /> Link build</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* discovered builds with no project */}
          {unlinked.length > 0 && (
            <section>
              <h3 className="font-semibold text-[15px] mb-2">Discovered builds <span className="text-text-muted font-normal text-[12px]">· not linked to a project</span></h3>
              <div className="card divide-y divide-border">
                {unlinked.map((b) => (
                  <button key={b.buildId} onClick={() => nav(`/workspace/builds/${b.buildId}`)} className="w-full flex items-center gap-4 px-4 py-3 hover:bg-text-muted/5 text-left transition-colors">
                    <ScoreGauge score={b.score} grade={b.grade} size={36} showGrade={false} />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium capitalize truncate">{b.client}</div>
                      <div className="text-[12px] text-text-muted truncate">{b.store || b.dir}</div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-text-muted" />
                  </button>
                ))}
              </div>
            </section>
          )}
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
