import { useEffect, useState } from 'react'
import { X, ExternalLink, Loader2 } from 'lucide-react'
import { getWorkspaceProjectFile, type RepoFile } from '../../lib/api'

// Read-only in-panel file viewer (a slide-over) so you can review theme code
// without leaving for VS Code. Opens via openFile() from RepoPanel rows.
export default function FileViewer({ projectId, relPath, absPath, onClose }: { projectId: string; relPath: string; absPath: string; onClose: () => void }) {
  const [file, setFile] = useState<RepoFile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    setLoading(true)
    getWorkspaceProjectFile(projectId, relPath)
      .then((f) => { if (alive) setFile(f) })
      .catch((e) => { if (alive) setFile({ ok: false, error: e instanceof Error ? e.message : 'load failed' }) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [projectId, relPath])

  return (
    <div className="fixed inset-0 z-[75] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div className="relative w-[760px] max-w-full h-full bg-surface border-l border-border shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <code className="text-[12px] text-text-muted truncate">{relPath}</code>
          <div className="flex items-center gap-2 shrink-0">
            <a href={`vscode://file${absPath}`} className="btn-ghost btn-sm flex items-center gap-1 text-[11px]"><ExternalLink className="w-3.5 h-3.5" /> VS Code</a>
            <button onClick={onClose} className="text-text-muted hover:text-text" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? <div className="flex items-center justify-center h-32 text-text-muted"><Loader2 className="w-5 h-5 animate-spin" /></div>
            : file?.ok
              ? <pre className="text-[12px] leading-relaxed font-mono p-4 whitespace-pre">{file.content}</pre>
              : <div className="p-6 text-[13px] text-text-muted">{file?.error === 'binary file' ? 'Binary file — open in VS Code.' : file?.error === 'file too large' ? 'File too large to preview — open in VS Code.' : `Could not read file: ${file?.error || 'unknown'}`}</div>}
        </div>
      </div>
    </div>
  )
}
