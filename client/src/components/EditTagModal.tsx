import { useEffect, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { updateTagDef } from '../lib/api'
import { toast } from './Toast'

interface EditTagModalProps {
  open: boolean
  category: string | null
  tag: string | null
  initialLabel?: string
  initialDescription?: string
  onClose: () => void
  onSaved?: () => void
}

export default function EditTagModal({
  open, category, tag, initialLabel = '', initialDescription = '',
  onClose, onSaved,
}: EditTagModalProps) {
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setLabel(initialLabel || tag || '')
      setDescription(initialDescription || '')
      setError(null)
      setBusy(false)
    }
  }, [open, tag, initialLabel, initialDescription])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, busy])

  if (!open || !category || !tag) return null

  const submit = async () => {
    if (!label.trim()) {
      setError('Label required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateTagDef(category, tag, {
        label: label.trim(),
        description: description.trim(),
      })
      toast('success', `Tag "${label}" updated`)
      onSaved?.()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose() }}
    >
      <div className="w-full max-w-md mx-4 rounded-2xl bg-surface border border-border shadow-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-sm font-bold">Edit tag</h2>
            <p className="text-[10px] text-text-muted mt-0.5 font-mono">
              {category} / <span className="text-text">{tag}</span>
            </p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1 rounded hover:bg-surface-2 text-text-muted disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">
              Tag key <span className="text-text-muted font-normal normal-case">(immutable — agents reference it)</span>
            </label>
            <div className="px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg font-mono text-text-muted">
              {tag}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Display label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={60}
              autoFocus
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="Tooltip shown on hover…"
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none resize-none"
            />
          </div>

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red/10 text-text text-xs font-semibold border border-red/20">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-surface-2/30 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-surface border border-border text-text-muted hover:text-text disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !label.trim()}
            className="px-4 py-1.5 text-xs font-bold rounded-lg bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
