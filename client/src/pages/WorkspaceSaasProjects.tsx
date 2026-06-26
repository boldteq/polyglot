import { useEffect, useState, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search, Zap } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import { ErrorState } from '../components/ErrorState'
import SaasProjectCard from '../components/workspace/SaasProjectCard'
import { getProjects } from '../lib/api'
import type { Project } from '../types'

// SaaS Projects — the local app projects discovered on disk (a .claude/ dir or
// CLAUDE.md). Moved into the Workspace panel from the old Polyglot sidebar
// dropdown; clicking a card opens its agents/commands/rules/CLAUDE.md/chat.
export default function WorkspaceSaasProjects() {
  const nav = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')

  const load = useCallback(() => {
    setLoading(true); setError(null)
    getProjects()
      .then(setProjects)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load projects'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase()
    return ql ? projects.filter((p) => `${p.name} ${p.displayPath}`.toLowerCase().includes(ql)) : projects
  }, [projects, q])

  return (
    <PageShell
      title="SaaS Projects"
      subtitle="Your local app projects — agents, commands & rules"
      actions={<button onClick={load} className="btn-ghost btn-sm flex items-center gap-1.5"><RefreshCw className="w-4 h-4" />Refresh</button>}
    >
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="card h-52 animate-pulse" />)}
        </div>
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : projects.length === 0 ? (
        <EmptyState icon={Zap} title="No projects found" description="Projects with a .claude folder or CLAUDE.md in your configured directories appear here. Add a directory in Settings." />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap bg-surface-2/40 border border-border-subtle rounded-xl px-2 py-2">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="w-4 h-4 text-text-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search projects…" className="input w-full pl-8 text-[13px]" />
            </div>
            <span className="text-[12px] text-text-muted ml-auto px-1">{shown.length === projects.length ? `${projects.length}` : `${shown.length} of ${projects.length}`} projects</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-fr">
            {shown.map((p) => <SaasProjectCard key={p.id} project={p} onOpen={() => nav(`/workspace/saas/${p.id}`)} />)}
            {shown.length === 0 && <div className="col-span-full"><EmptyState icon={Search} title="No projects match" description="Try a different search." size="sm" /></div>}
          </div>
        </div>
      )}
    </PageShell>
  )
}
