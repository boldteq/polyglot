import { useEffect, useState } from 'react'
import { CheckSquare, Square, Plus, ShieldAlert } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import EmptyState from '../EmptyState'
import { toast } from '../Toast'
import { confirmDialog } from '../../lib/confirm'
import { useBuildSection } from '../../hooks/useBuildSection'
import {
  getWorkspaceBuildChanges, toggleWorkspaceChange, addWorkspaceChangeItem, addWorkspaceChangeWaiver,
  type ChangesData,
} from '../../lib/api'

// Editable CHANGES.md (Phase A): tick acceptance items, add items, add waivers —
// the project's acceptance checklist, managed from the panel. Writes are bounded
// (one git-tracked file) and the disk-watcher auto-refreshes the build score.
export default function ChangesTab({ buildId, reloadKey }: { buildId: string; reloadKey?: number }) {
  const { data, loading, error } = useBuildSection<ChangesData>(() => getWorkspaceBuildChanges(buildId), reloadKey)
  const [local, setLocal] = useState<ChangesData | null>(null)
  const [busy, setBusy] = useState<number | null>(null) // index being toggled
  const [adding, setAdding] = useState(false)
  const [newItem, setNewItem] = useState('')

  useEffect(() => { if (data) setLocal(data) }, [data])

  const d = local || data
  if (loading && !d) return <SkeletonCards count={3} />
  if (error) return <ErrorState message={error} />
  if (!d?.present) return <EmptyState icon={Square} title="No CHANGES.md" description="This build has no changes list yet. Atrium writes one per client ask at intake." />

  const onToggle = async (index: number, checked: boolean) => {
    setBusy(index)
    try { setLocal(await toggleWorkspaceChange(buildId, index, checked)) }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Toggle failed') }
    finally { setBusy(null) }
  }

  const onAddItem = async () => {
    const text = newItem.trim()
    if (!text) return
    try { setLocal(await addWorkspaceChangeItem(buildId, text)); setNewItem(''); setAdding(false); toast('success', 'Item added') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Add failed') }
  }

  const onAddWaiver = async () => {
    const reason = window.prompt('Waiver reason (why this blocker is accepted):')?.trim()
    if (!reason) return
    const ok = await confirmDialog({
      title: 'Add waiver?', danger: true, confirmLabel: 'Add waiver',
      message: `Waivers bypass a quality gate. This will be recorded in CHANGES.md:\n\n"${reason}"`,
    })
    if (!ok) return
    try { setLocal(await addWorkspaceChangeWaiver(buildId, reason)); toast('warn', 'Waiver added') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Waiver failed') }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between text-[13px] mb-2">
          <span className="font-medium">{d.checked}/{d.total} complete</span>
          <span className="text-text-muted">{d.rate}%</span>
        </div>
        <div className="h-2 bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${d.rate}%` }} />
        </div>
      </div>

      <div className="card divide-y divide-border">
        {d.items.map((it, i) => (
          <button key={i} onClick={() => onToggle(i, !it.checked)} disabled={busy === i}
            className="w-full flex items-start gap-2.5 px-4 py-2.5 text-[13px] text-left hover:bg-text-muted/5 transition-colors disabled:opacity-60">
            {it.checked
              ? <CheckSquare className="w-4 h-4 text-green shrink-0 mt-0.5" />
              : <Square className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />}
            <span className={it.checked ? 'text-text-muted line-through' : ''}>{it.text}</span>
          </button>
        ))}
        {adding ? (
          <div className="flex items-center gap-2 px-4 py-2.5">
            <input autoFocus value={newItem} onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAddItem(); if (e.key === 'Escape') { setAdding(false); setNewItem('') } }}
              placeholder="New acceptance item…" className="input input-sm flex-1 text-[13px]" />
            <button onClick={onAddItem} className="btn-primary btn-sm">Add</button>
            <button onClick={() => { setAdding(false); setNewItem('') }} className="btn-ghost btn-sm">Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="w-full flex items-center gap-2 px-4 py-2.5 text-[12px] text-text-muted hover:text-text hover:bg-text-muted/5 transition-colors">
            <Plus className="w-3.5 h-3.5" /> Add item
          </button>
        )}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-semibold text-[13px] text-amber">Waivers ({d.waivers.length})</h4>
          <button onClick={onAddWaiver} className="btn-ghost btn-sm flex items-center gap-1.5 text-[11px] text-amber"><ShieldAlert className="w-3.5 h-3.5" /> Add waiver</button>
        </div>
        {d.waivers.length > 0
          ? <ul className="space-y-1 text-[12px] text-text-muted">{d.waivers.map((w, i) => <li key={i}>• {w}</li>)}</ul>
          : <p className="text-[12px] text-text-muted">None. A waiver records why a gate blocker was accepted.</p>}
      </div>
    </div>
  )
}
