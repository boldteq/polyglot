import { useEffect, useState, useCallback } from 'react'
import { Folder, FolderOpen, FileText, ExternalLink, GitBranch, FolderGit2, Unlink } from 'lucide-react'
import { Spinner } from '../Skeleton'
import EmptyState from '../EmptyState'
import { getWorkspaceProjectRepo, type RepoData, type FileNode } from '../../lib/api'

const vscodeLink = (abs: string) => `vscode://file${abs}`

function FileRow({ name, path, isDir }: { name: string; path: string; isDir?: boolean }) {
  return (
    <a href={vscodeLink(path)} title={`Open in VS Code: ${path}`}
      className="flex items-center gap-2 px-2 py-1.5 hover:bg-text-muted/5 rounded text-[12px] group">
      {isDir ? <Folder className="w-3.5 h-3.5 text-accent shrink-0" /> : <FileText className="w-3.5 h-3.5 text-text-muted shrink-0" />}
      <span className="truncate flex-1">{name}</span>
      <ExternalLink className="w-3 h-3 text-text-muted opacity-0 group-hover:opacity-100 shrink-0" />
    </a>
  )
}
function DirSection({ name, items }: { name: string; items: FileNode[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-2 py-1.5 w-full text-left text-[13px] font-medium hover:bg-text-muted/5 rounded">
        {open ? <FolderOpen className="w-4 h-4 text-accent" /> : <Folder className="w-4 h-4 text-accent" />}
        <span className="flex-1">{name}</span>
        <span className="text-[11px] text-text-muted">{items.length}</span>
      </button>
      {open && <div className="ml-4 border-l border-border pl-2">{items.map((c) => <FileRow key={c.path} name={c.name} path={c.path} isDir={c.dir} />)}</div>}
    </div>
  )
}

// The project↔repo connection: disk path + read-only git state + theme-lock store
// + shallow file tree (each file opens in VS Code). The "connect project with our
// files repo" the user asked for.
export default function RepoPanel({ projectId, reloadKey }: { projectId: string; reloadKey?: number }) {
  const [data, setData] = useState<RepoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    getWorkspaceProjectRepo(projectId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load repo'))
      .finally(() => setLoading(false))
  }, [projectId])
  useEffect(() => { setLoading(true); load() }, [load, reloadKey])

  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
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
              <span className={`pill ${git.clean ? 'bg-green/10 text-green' : 'bg-amber/10 text-amber'}`}>{git.clean ? 'clean' : `${git.dirty} changed`}</span>
              {git.ahead != null && (git.ahead > 0 || (git.behind ?? 0) > 0) && <span className="pill bg-surface-2 text-text-muted">↑{git.ahead} ↓{git.behind}</span>}
              {git.lastCommit && <span className="text-[11px] text-text-muted truncate">· {git.lastCommit.subject}</span>}
            </>
          ) : <span className="text-[11px] text-text-muted">not a git repo</span>}
          {data.themeLock?.store && <span className="pill bg-accent/10 text-accent ml-auto">{data.themeLock.store}</span>}
        </div>
      </div>

      {data.files && (
        <div className="card p-2 space-y-1">
          {data.files.topFiles.map((f) => <FileRow key={f.path} name={f.name} path={f.path} />)}
          {data.files.tree.map((d) => <DirSection key={d.path} name={d.name} items={d.children} />)}
        </div>
      )}
    </div>
  )
}
