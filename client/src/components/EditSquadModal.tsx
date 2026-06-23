import { useEffect, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { updateSquadDef, type SquadDef } from '../lib/api'
import { toast } from './Toast'

interface EditSquadModalProps {
  open: boolean
  squad: SquadDef | null
  onClose: () => void
  onSaved?: (squad: SquadDef) => void
}

const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#a855f7', '#ec4899',
  '#f59e0b', '#06b6d4', '#ef4444', '#6366f1',
  '#14b8a6', '#f97316', '#84cc16', '#6b7280',
]

export default function EditSquadModal({ open, squad, onClose, onSaved }: EditSquadModalProps) {
  const [label, setLabel] = useState('')
  const [emoji, setEmoji] = useState('')
  const [color, setColor] = useState('#6b7280')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && squad) {
      setLabel(squad.label || '')
      setEmoji(squad.emoji || '')
      setColor(squad.color || '#6b7280')
      setDescription(squad.description || '')
      setError(null)
      setBusy(false)
    }
  }, [open, squad])

  // Esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, busy])

  if (!open || !squad) return null

  const submit = async () => {
    if (!label.trim()) {
      setError('Label required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await updateSquadDef(squad.id, {
        label: label.trim(),
        emoji: emoji.trim() || undefined,
        color,
        description: description.trim(),
      })
      toast('success', `Squad "${res.squad.label}" updated`)
      onSaved?.(res.squad)
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
      <div className="w-full max-w-lg mx-4 rounded-2xl bg-surface border border-border shadow-pop">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
              style={{ background: `${color}15`, color, borderColor: `${color}40` }}
            >
              <span>{emoji || '·'}</span>
              <span>{label || squad.id}</span>
            </span>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1 rounded hover:bg-surface-2 text-text-muted disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">
              Squad ID <span className="text-text-muted/70 font-normal normal-case">(immutable — changing would break agent links)</span>
            </label>
            <div className="px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg font-mono text-text-muted">
              {squad.id}
            </div>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Emoji</label>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                placeholder="🛒"
                className="w-full px-3 py-2 text-lg text-center bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={60}
                autoFocus
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Color</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-lg border-2 transition-all ${color === c ? 'ring-2 ring-offset-2 ring-offset-surface ring-accent' : 'border-transparent hover:scale-110'}`}
                  style={{ backgroundColor: c, borderColor: color === c ? c : 'transparent' }}
                  aria-label={c}
                />
              ))}
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer bg-surface-2 border border-border"
                title="Custom color"
              />
            </div>
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
            <div className="px-3 py-2 rounded-lg bg-red/10 text-red text-xs font-semibold border border-red/20">
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
