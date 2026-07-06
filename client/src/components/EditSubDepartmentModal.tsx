import { useEffect, useState } from 'react'
import { X, Save, Loader2 } from 'lucide-react'
import { updateSubDepartment, type OrgChartSubDepartment } from '../lib/api'
import { toast } from './Toast'

interface EditSubDepartmentModalProps {
  open: boolean
  deptId: string | null
  deptLabel?: string | null
  deptColor?: string | null
  subDept: OrgChartSubDepartment | null
  onClose: () => void
  onSaved?: () => void
}

const PRESET_COLORS = [
  '#10b981', '#3b82f6', '#a855f7', '#ec4899',
  '#f59e0b', '#06b6d4', '#ef4444', '#6366f1',
  '#14b8a6', '#f97316', '#84cc16', '#6b7280',
  '#95bf47', '#eab308', '#0891b2', '#9d174d',
]

// Common lucide icon names that fit team-card use cases. Free-form text input
// kept too — designer can type any valid lucide icon name.
const SUGGESTED_ICONS = [
  'Building2', 'Globe', 'Puzzle', 'Droplets', 'ShoppingBag', 'Settings',
  'ShieldCheck', 'Crown', 'Star', 'FileText', 'ShoppingCart', 'LayoutDashboard',
  'Component', 'Package', 'PenTool', 'Target', 'Mail', 'AppWindow',
  'BookOpen', 'Search', 'TrendingUp', 'Megaphone', 'Telescope', 'Server',
  'CheckCircle2', 'Compass', 'Ruler', 'Scale', 'Users', 'GraduationCap',
  'BookMarked', 'BarChart3', 'Folder', 'Code',
]

export default function EditSubDepartmentModal({
  open, deptId, deptLabel, deptColor, subDept, onClose, onSaved,
}: EditSubDepartmentModalProps) {
  const [label, setLabel] = useState('')
  const [cardLabel, setCardLabel] = useState('')
  const [cardEmoji, setCardEmoji] = useState('')
  const [color, setColor] = useState('#6b7280')
  const [icon, setIcon] = useState('Folder')
  const [order, setOrder] = useState<number>(99)
  const [displayMode, setDisplayMode] = useState<'expanded' | 'collapsed' | 'hidden'>('expanded')
  const [status, setStatus] = useState<'active' | 'planned' | 'archived'>('active')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open && subDept) {
      setLabel(subDept.label || '')
      setCardLabel(subDept.cardLabel || '')
      setCardEmoji(subDept.cardEmoji || '')
      setColor(subDept.color || deptColor || '#6b7280')
      setIcon(subDept.icon || 'Folder')
      setOrder(typeof subDept.order === 'number' ? subDept.order : 99)
      setDisplayMode(subDept.displayMode || 'expanded')
      setStatus(subDept.status || 'active')
      setDescription(subDept.description || '')
      setError(null)
      setBusy(false)
    }
  }, [open, subDept, deptColor])

  // Esc closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, busy])

  if (!open || !subDept || !deptId) return null

  const submit = async () => {
    if (!label.trim()) {
      setError('Label required')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await updateSubDepartment(deptId, subDept.id, {
        label: label.trim(),
        cardLabel: cardLabel.trim() || undefined,
        cardEmoji: cardEmoji.trim() || undefined,
        color,
        icon: icon.trim() || undefined,
        order,
        displayMode,
        status,
        description: description.trim(),
      })
      toast('success', `Sub-department "${cardLabel || label}" updated`)
      onSaved?.()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  const previewLabel = cardLabel || label || subDept.id

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
              <span>{cardEmoji || '·'}</span>
              <span>{previewLabel}</span>
            </span>
            {deptLabel && (
              <span className="text-[10px] text-text-muted ">
                under {deptLabel}
              </span>
            )}
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1 rounded hover:bg-surface-2 text-text-muted disabled:opacity-50">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">
              Sub-Department ID <span className="text-text-muted font-normal normal-case">(immutable — changing would orphan all members)</span>
            </label>
            <div className="px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg font-mono text-text-muted">
              {deptId}.{subDept.id}
            </div>
          </div>

          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Emoji</label>
              <input
                value={cardEmoji}
                onChange={(e) => setCardEmoji(e.target.value)}
                maxLength={4}
                placeholder="🛍️"
                className="w-full px-3 py-2 text-lg text-center bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Label</label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={80}
                autoFocus
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">
              Card Label <span className="text-text-muted font-normal normal-case">(optional — overrides Label on the card header)</span>
            </label>
            <input
              value={cardLabel}
              onChange={(e) => setCardLabel(e.target.value)}
              maxLength={80}
              placeholder={label || 'Same as Label'}
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
            />
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
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Icon (lucide)</label>
            <input
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              list="icon-suggestions"
              placeholder="Folder"
              className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none font-mono"
            />
            <datalist id="icon-suggestions">
              {SUGGESTED_ICONS.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Order</label>
              <input
                type="number"
                value={order}
                min={0}
                max={99}
                onChange={(e) => setOrder(Number.isFinite(+e.target.value) ? +e.target.value : 99)}
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full px-3 py-2 text-sm bg-surface-2 border border-border rounded-lg focus:border-accent focus:ring-2 focus:ring-accent/10 outline-none"
              >
                <option value="active">Active</option>
                <option value="planned">Planned</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Display Mode</label>
            <div className="flex gap-2">
              {(['expanded', 'collapsed', 'hidden'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDisplayMode(m)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border ${
                    displayMode === m
                      ? 'bg-accent text-white border-accent'
                      : 'bg-surface-2 text-text-muted border-border hover:text-text'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="text-[10px] text-text-muted mt-1">
              {displayMode === 'expanded' && 'Show full card with all members.'}
              {displayMode === 'collapsed' && 'Show header + member count only (click to expand).'}
              {displayMode === 'hidden' && 'Hide card entirely from org chart.'}
            </div>
          </div>

          <div>
            <label className="text-[11px] font-bold text-text-muted mb-1.5 block">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Tooltip shown on card hover…"
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
