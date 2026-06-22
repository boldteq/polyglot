import { useEffect, useState } from 'react'
import { FileText, FileJson, Loader2 } from 'lucide-react'
import { Spinner } from '../Skeleton'
import EmptyState from '../EmptyState'
import { MarkdownRenderer } from '../MarkdownRenderer'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildDocs, getWorkspaceBuildDoc, type DocEntry } from '../../lib/api'

// Read-only viewer for agent-produced docs (copy.md, design-spec, schema, goals,
// seo-spec…). One tab that surfaces the whole build's written artifacts so you
// can SEE what was produced without VS Code. To CHANGE an artifact → dispatch its
// owning agent (the architectural boundary; not editable here).
export default function DocsTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const { data, loading, error } = useBuildSection<{ present: boolean; docs: DocEntry[] }>(() => getWorkspaceBuildDocs(buildId), reloadKey)
  const [selected, setSelected] = useState<string | null>(null)
  const [content, setContent] = useState<string>('')
  const [docLoading, setDocLoading] = useState(false)
  const [docError, setDocError] = useState<string | null>(null)

  // auto-select the first doc once loaded
  useEffect(() => {
    if (data?.docs.length && !selected) setSelected(data.docs[0].file)
  }, [data, selected])

  useEffect(() => {
    if (!selected) return
    let alive = true
    setDocLoading(true); setDocError(null)
    getWorkspaceBuildDoc(buildId, selected)
      .then((d) => { if (alive) setContent(d.content) })
      .catch((e) => { if (alive) setDocError(e instanceof Error ? e.message : 'Failed to load doc') })
      .finally(() => { if (alive) setDocLoading(false) })
    return () => { alive = false }
  }, [buildId, selected])

  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data?.present) return <EmptyState icon={FileText} title="No docs yet" description="Agent-produced docs (copy, design-spec, schema, goals, SEO…) appear here once written under docs/. To produce one, dispatch the owning agent." />

  const isJson = selected?.endsWith('.json')

  return (
    <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-4">
      {/* file list */}
      <div className="card p-1 h-fit md:sticky md:top-2">
        {data.docs.map((d) => (
          <button key={d.file} onClick={() => setSelected(d.file)}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-[12px] transition-colors ${selected === d.file ? 'bg-accent/10 text-accent' : 'hover:bg-text-muted/5'}`}>
            {d.kind === 'json' ? <FileJson className="w-3.5 h-3.5 shrink-0" /> : <FileText className="w-3.5 h-3.5 shrink-0" />}
            <span className="truncate flex-1">{d.file}</span>
          </button>
        ))}
      </div>

      {/* viewer */}
      <div className="card p-4 min-w-0">
        {docLoading ? <div className="flex items-center gap-2 text-text-muted text-[13px]"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
          : docError ? <div className="text-red text-[13px]">{docError}</div>
          : isJson
            ? <pre className="text-[12px] whitespace-pre-wrap break-words font-mono leading-relaxed overflow-x-auto">{(() => { try { return JSON.stringify(JSON.parse(content), null, 2) } catch { return content } })()}</pre>
            : <div className="prose-sm max-w-none text-[13px]"><MarkdownRenderer content={content} /></div>}
      </div>
    </div>
  )
}
