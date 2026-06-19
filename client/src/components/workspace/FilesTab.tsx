import { useState } from 'react'
import { Folder, FolderOpen, FileText, ExternalLink } from 'lucide-react'
import { Spinner } from '../Skeleton'
import { useBuildSection } from '../../hooks/useBuildSection'
import { getWorkspaceBuildFiles, type FilesData, type FileNode } from '../../lib/api'

// "vscode://file/<abs path>" opens the file/folder in VS Code (works when VS
// Code is installed + the protocol handler is registered, which it is here).
function vscodeLink(absPath: string) { return `vscode://file${absPath}` }

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

function DirSection({ name, path, children }: { name: string; path: string; children: FileNode[] }) {
  const [open, setOpen] = useState(true)
  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 px-2 py-1.5 w-full text-left text-[13px] font-medium hover:bg-text-muted/5 rounded">
        {open ? <FolderOpen className="w-4 h-4 text-accent" /> : <Folder className="w-4 h-4 text-accent" />}
        <span className="flex-1">{name}</span>
        <span className="text-[11px] text-text-muted">{children.length}</span>
      </button>
      {open && (
        <div className="ml-4 border-l border-border pl-2">
          {children.map((c) => <FileRow key={c.path} name={c.name} path={c.path} isDir={c.dir} />)}
        </div>
      )}
    </div>
  )
}

export default function FilesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const { data, loading, error } = useBuildSection<FilesData>(() => getWorkspaceBuildFiles(buildId), reloadKey)
  if (loading && !data) return <Spinner />
  if (error) return <div className="card p-5 text-red text-[13px]">{error}</div>
  if (!data) return null

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-text-muted px-1">Click any file to open it in VS Code. Shallow tree of build-relevant dirs.</p>
      {data.topFiles.length > 0 && (
        <div className="card p-2">
          {data.topFiles.map((f) => <FileRow key={f.path} name={f.name} path={f.path} />)}
        </div>
      )}
      <div className="card p-2 space-y-1">
        {data.tree.map((d) => <DirSection key={d.path} name={d.name} path={d.path} children={d.children} />)}
      </div>
    </div>
  )
}
