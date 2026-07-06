import { useEffect, useState, useCallback } from 'react'
import { Folder, FolderOpen, FileText, ExternalLink, GitBranch, FolderGit2, Unlink, FileDiff } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import EmptyState from '../EmptyState'
import FileViewer from './FileViewer'
import { getWorkspaceProjectRepo, getWorkspaceProjectDiff, type RepoData, type FileNode, type RepoDiff } from '../../lib/api'
import { vscodeLink } from '../../lib/vscode'
const DIFF_STAT: Record<string, string> = { M: 'text-amber', A: 'text-green', D: 'text-red', R: 'text-accent' }

function FileRow({ name, path, isDir, onOpen }: { name: string; path: string; isDir?: boolean; onOpen: (abs: string) => void }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 hover:bg-text-muted/5 rounded text-[12px] group">
      <button onClick={() => !isDir && onOpen(path)} className="flex items-center gap-2 flex-1 min-w-0 text-left" disabled={isDir}>
        {isDir ? <Folder className="w-3.5 h-3.5 text-accent shrink-0" /> : <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />}
        <span className="truncate">{name}</span>
      </button>
      <a href={vscodeLink(path)} title="Open in VS Code" onClick={(e) => e.stopPropagation()} className="opacity-0 group-hover:opacity-100"><ExternalLink className="w-3 h-3 text-text-muted shrink-0" /></a>
    </div>
  )
}
function DirSection({ name, items, onOpen }: { name: string; items: FileNode[]; onOpen: (abs: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-2 py-1.5 w-full text-left text-[13px] font-medium hover:bg-text-muted/5 rounded">
        {open ? <FolderOpen className="w-4 h-4 text-accent" /> : <Folder className="w-4 h-4 text-accent" />}
        <span className="flex-1">{name}</span><span className="text-[11px] text-text-muted">{items.length}</span>
      </button>
      {open && <div className="ml-4 border-l border-border pl-2">{items.map((c) => <FileRow key={c.path} name={c.name} path={c.path} isDir={c.dir} onOpen={onOpen} />)}</div>}
    </div>
  )
}

// The project↔repo connection: path + read-only git state + theme-lock store +
// shallow file tree (each file VIEWS inline, no VS Code needed) + a git diff.
export default function RepoPanel({ projectId, reloadKey }: { projectId: string; reloadKey?: number }) {
  const [data, setData] = useState<RepoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<{ relPath: string; absPath: string } | null>(null)
  const [diff, setDiff] = useState<RepoDiff | null>(null)
  const [showDiff, setShowDiff] = useState(false)

  const load = useCallback(() => {
    getWorkspaceProjectRepo(projectId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load repo'))
      .finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { setLoading(true); load() }, [load, reloadKey])

  const openFile = useCallback((abs: string) => {
    const base = data?.build_dir || ''
    const rel = abs.startsWith(base + '/') ? abs.slice(base.length + 1) : abs
    setView({ relPath: rel, absPath: abs })
  }, [data])

  const toggleDiff = useCallback(() => {
    if (!showDiff && !diff) getWorkspaceProjectDiff(projectId).then(setDiff).catch(() => setDiff(null))
    setShowDiff((v) => !v)
  }, [showDiff, diff, projectId])

  if (loading && !data) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error} />
  if (!data?.connected) return <EmptyState icon={Unlink} title="No repo linked" description="This project isn't linked to a theme folder on disk yet." />

  const git = data.git

  return (
    <div className="space-y-3">
      <div className="card p-4 space-y-2.5">
        <div className="flex items-center gap-2 text-[13px]">
          <FolderGit2 className="w-4 h-4 text-accent shrink-0" />
          <code className="text-[12px] text-text-muted truncate flex-1">{data.build_dir}</code>
          <a href={vscodeLink(data.build_dir!)} className="btn-ghost btn-sm flex items-center gap-1.5 shrink-0"><ExternalLink className="w-3.5 h-3.5" /> VS Code</a>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[12px]">
          {git?.isRepo ? (
            <>
              <span className="pill bg-surface-2 text-text-secondary flex items-center gap-1"><GitBranch className="w-3 h-3" />{git.branch || '—'}</span>
              <span className={`pill ${git.clean ? 'bg-green/10 text-text' : 'bg-amber/10 text-text'}`}>{git.clean ? 'clean' : `${git.dirty} changed`}</span>
              {!git.clean && <button onClick={toggleDiff} className="btn-ghost btn-sm flex items-center gap-1 text-[11px]"><FileDiff className="w-3 h-3" /> {showDiff ? 'Hide' : 'View'} changes</button>}
              {git.lastCommit && <span className="text-[11px] text-text-muted truncate">· {git.lastCommit.subject}</span>}
            </>
          ) : <span className="text-[11px] text-text-muted">not a git repo</span>}
          {data.themeLock?.store && <span className="pill bg-accent/10 text-accent ml-auto">{data.themeLock.store}</span>}
        </div>
      </div>

      {showDiff && diff && (
        <div className="card p-3 space-y-2">
          {diff.files.length === 0 ? <p className="text-[12px] text-text-muted">No uncommitted changes.</p> : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {diff.files.map((f) => (
                  <button key={f.path} onClick={() => openFile(`${data.build_dir}/${f.path}`)} className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 hover:bg-surface-3 flex items-center gap-1">
                    <span className={`font-mono ${DIFF_STAT[f.status] || 'text-text-muted'}`}>{f.status}</span>{f.path}
                  </button>
                ))}
              </div>
              <pre className="text-[11px] leading-relaxed font-mono whitespace-pre overflow-x-auto max-h-80 overflow-y-auto bg-surface-2 rounded-lg p-3">{diff.diff}{diff.truncated ? '\n… (truncated — open in VS Code for the full diff)' : ''}</pre>
            </>
          )}
        </div>
      )}

      {data.files && (
        <div className="card p-2 space-y-1">
          {data.files.topFiles.map((f) => <FileRow key={f.path} name={f.name} path={f.path} onOpen={openFile} />)}
          {data.files.tree.map((d) => <DirSection key={d.path} name={d.name} items={d.children} onOpen={openFile} />)}
        </div>
      )}

      {view && <FileViewer projectId={projectId} relPath={view.relPath} absPath={view.absPath} onClose={() => setView(null)} />}
    </div>
  )
}
