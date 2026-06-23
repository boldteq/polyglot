import { useState, useEffect } from 'react'
import {
  FolderOpen,
  FolderCheck,
  ChevronRight,
  ArrowUp,
  X,
  Check,
  Loader2,
  Home,
} from 'lucide-react'
import { browseDirectory, type BrowseResult } from '../lib/api'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (path: string) => void
  existingDirs: string[]
}

export default function DirectoryPicker({ open, onClose, onSelect, existingDirs }: Props) {
  const [data, setData] = useState<BrowseResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const navigate = (dirPath?: string) => {
    setLoading(true)
    setError(null)
    setSelected(null)
    browseDirectory(dirPath)
      .then(setData)
      .catch(() => setError('Cannot access this directory'))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (open) {
      navigate()
    }
  }, [open])

  if (!open) return null

  const isAlreadyAdded = (dirPath: string) =>
    existingDirs.some((d) => d === dirPath || d === dirPath.replace(/^\/Users\/[^/]+/, '~'))

  const handleSelect = () => {
    if (selected) {
      onSelect(selected)
      onClose()
    }
  }

  const handleSelectCurrent = () => {
    if (data) {
      onSelect(data.current)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface border border-border rounded-2xl shadow-pop w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-semibold">Choose Directory</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Select a parent folder that contains your projects
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close directory picker"
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-2 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        {data && (
          <div className="px-6 py-3 border-b border-border-subtle flex items-center gap-1 overflow-x-auto">
            {data.breadcrumbs.map((crumb, i) => (
              <div key={crumb.path} className="flex items-center gap-1 shrink-0">
                {i > 0 && <ChevronRight className="w-3 h-3 text-text-muted" />}
                <button
                  onClick={() => navigate(crumb.path)}
                  className={`px-2 py-1 text-xs rounded-md transition-colors ${
                    i === data.breadcrumbs.length - 1
                      ? 'bg-accent-muted text-accent-hover font-medium'
                      : 'text-text-secondary hover:text-text hover:bg-surface-2'
                  }`}
                >
                  {crumb.name === '~' ? (
                    <span className="flex items-center gap-1">
                      <Home className="w-3 h-3" />
                      Home
                    </span>
                  ) : (
                    crumb.name
                  )}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Directory list */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="w-6 h-6 text-accent animate-spin" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-text-muted text-sm">{error}</p>
            </div>
          ) : data ? (
            <div className="p-2">
              {/* Go up */}
              {data.parent && (
                <button
                  onClick={() => navigate(data.parent!)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-left hover:bg-surface-2 transition-colors text-text-secondary"
                >
                  <ArrowUp className="w-4 h-4" />
                  <span className="text-sm">..</span>
                </button>
              )}

              {data.directories.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-text-muted text-sm">No subdirectories here</p>
                </div>
              ) : (
                data.directories.map((dir) => {
                  const added = isAlreadyAdded(dir.path)
                  const isSelected = selected === dir.path

                  return (
                    <div
                      key={dir.path}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                        added
                          ? 'opacity-50'
                          : isSelected
                          ? 'bg-accent-muted border border-accent/30'
                          : 'hover:bg-surface-2 border border-transparent'
                      }`}
                    >
                      {/* Folder icon + click to navigate */}
                      <button
                        onClick={() => navigate(dir.path)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div
                          className={`p-1.5 rounded-md shrink-0 ${
                            dir.hasProjects
                              ? 'bg-green-muted'
                              : 'bg-surface-2'
                          }`}
                        >
                          {dir.hasProjects ? (
                            <FolderCheck className="w-4 h-4 text-green" />
                          ) : (
                            <FolderOpen className="w-4 h-4 text-text-muted" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{dir.name}</p>
                          {dir.hasProjects && (
                            <p className="text-[10px] text-green mt-0.5">Contains projects</p>
                          )}
                        </div>
                      </button>

                      {/* Select button */}
                      {added ? (
                        <span className="text-xs text-text-muted bg-surface-2 px-2 py-1 rounded-md shrink-0">
                          Added
                        </span>
                      ) : (
                        <button
                          onClick={() => setSelected(isSelected ? null : dir.path)}
                          className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors shrink-0 ${
                            isSelected
                              ? 'bg-accent text-white'
                              : 'bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text'
                          }`}
                        >
                          {isSelected ? 'Selected' : 'Select'}
                        </button>
                      )}

                      {/* Navigate arrow */}
                      <button
                        onClick={() => navigate(dir.path)}
                        className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-2 transition-colors shrink-0"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
          <div className="text-xs text-text-muted truncate mr-4">
            {selected ? (
              <span>
                Selected: <span className="font-mono text-text-secondary">{selected.replace(/^\/Users\/[^/]+/, '~')}</span>
              </span>
            ) : data ? (
              <span>
                Current: <span className="font-mono text-text-secondary">{data.displayPath}</span>
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!selected && data && !isAlreadyAdded(data.current) && (
              <button
                onClick={handleSelectCurrent}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-surface-2 text-text-secondary rounded-lg hover:bg-surface-3 hover:text-text transition-colors border border-border"
              >
                <FolderOpen className="w-4 h-4" />
                Use Current Folder
              </button>
            )}
            <button
              onClick={handleSelect}
              disabled={!selected}
              className="btn-primary btn-md"
            >
              <Check className="w-4 h-4" />
              Add Directory
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
