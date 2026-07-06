import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Search, History, LayoutTemplate, ChevronRight } from 'lucide-react'
import { PageShell } from '../components/PageShell'
import { ErrorState } from '../components/ErrorState'
import { Spinner } from '../components/Skeleton'
import { useApi } from '../hooks/useApi'
import { CacheKeys } from '../lib/cacheKeys'
import { getUnifiedAgents } from '../lib/api'
import { formatAgentDisplay } from '../lib/agentDisplay'

// Prompts (LangSmith "Prompts") — manage every agent's system prompt. Each row
// opens the agent editor, which now has version history + diff + restore.
export default function Prompts() {
  const navigate = useNavigate()
  const { data: agents, loading, error, refetch } = useApi(getUnifiedAgents, [], CacheKeys.unifiedAgents)
  const [q, setQ] = useState('')

  const list = useMemo(() => {
    const all = (agents || []).filter(a => a.scope === 'global')
    if (!q.trim()) return all
    const s = q.toLowerCase()
    return all.filter(a => a.name.toLowerCase().includes(s) || (a.description || '').toLowerCase().includes(s) || a.filename.toLowerCase().includes(s))
  }, [agents, q])

  return (
    <PageShell
      title="Prompts"
      subtitle="Every agent's system prompt — open one to edit, version, diff, and restore"
      actions={
        <button onClick={() => navigate('/settings?tab=templates')} className="btn-secondary btn-sm">
          <LayoutTemplate className="w-3.5 h-3.5" /> Output Templates
        </button>
      }
    >
      {loading ? (
        <Spinner />
      ) : error ? (
        <ErrorState message={error} onRetry={refetch} className="h-48" />
      ) : (
        <div className="space-y-4">
          <div className="relative max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted z-10" aria-hidden="true" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search prompts…" aria-label="Search prompts" className="input pl-8" />
          </div>
          <div className="card divide-y divide-border-subtle">
            {list.length === 0 ? (
              <div className="p-10 text-center text-text-muted text-sm"><FileText className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />No prompts match “{q}”.</div>
            ) : list.map(a => {
              const d = formatAgentDisplay({ name: a.name, title: a.org?.title, description: a.description, id: a.filename })
              return (
                <button
                  key={a.filename}
                  onClick={() => navigate(`/global/agents/${a.filename}`)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-2/40 transition-colors"
                >
                  <FileText className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{d.emoji && <span className="mr-1">{d.emoji}</span>}{d.realName}{d.role && <span className="text-text-muted font-normal"> — {d.role}</span>}</div>
                    {d.tagline && <div className="text-[11px] text-text-muted truncate">{d.tagline}</div>}
                  </div>
                  {a.model && <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded shrink-0">{a.model}</span>}
                  <History className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
                  <ChevronRight className="w-4 h-4 text-text-muted shrink-0" aria-hidden="true" />
                </button>
              )
            })}
          </div>
        </div>
      )}
    </PageShell>
  )
}
