import { useEffect, useState } from 'react'
import { CheckSquare, Square, Plus, ShieldAlert, Pencil, Trash2 } from 'lucide-react'
import { SkeletonCards } from '../Skeleton'
import { ErrorState } from '../ErrorState'
import EmptyState from '../EmptyState'
import { toast } from '../Toast'
import { InfoIcon } from '../Tooltip'
import { confirmDialog } from '../../lib/confirm'
import { InlineMd } from '../../lib/inlineMd'
import { useBuildSection } from '../../hooks/useBuildSection'
import {
  getWorkspaceBuildChanges, toggleWorkspaceChange, addWorkspaceChangeItem,
  removeWorkspaceChangeItem, editWorkspaceChangeItem, addWorkspaceChangeWaiver,
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
  const [editing, setEditing] = useState<number | null>(null) // index being edited
  const [editText, setEditText] = useState('')
  const [addingWaiver, setAddingWaiver] = useState(false)
  const [waiverText, setWaiverText] = useState('')

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

  const onEdit = async (index: number) => {
    const text = editText.trim()
    if (!text) return
    try { setLocal(await editWorkspaceChangeItem(buildId, index, text)); setEditing(null); setEditText(''); toast('success', 'Item updated') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Edit failed') }
  }

  const onRemove = async (index: number, text: string) => {
    const ok = await confirmDialog({
      title: 'Delete this item?', danger: true, confirmLabel: 'Delete',
      message: `Remove this acceptance item from CHANGES.md:\n\n"${text.slice(0, 160)}${text.length > 160 ? '…' : ''}"`,
    })
    if (!ok) return
    try { setLocal(await removeWorkspaceChangeItem(buildId, index)); toast('success', 'Item deleted') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Delete failed') }
  }

  const onAddWaiver = async () => {
    const reason = waiverText.trim()
    if (!reason) return
    const ok = await confirmDialog({
      title: 'Accept this blocker?', danger: true, confirmLabel: 'Accept blocker',
      message: `This records an accepted exception in CHANGES.md so the build can publish despite the blocker:\n\n"${reason}"`,
    })
    if (!ok) return
    try { setLocal(await addWorkspaceChangeWaiver(buildId, reason)); setWaiverText(''); setAddingWaiver(false); toast('warn', 'Exception recorded') }
    catch (e) { toast('error', e instanceof Error ? e.message : 'Could not record exception') }
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
          <div key={i} className="group flex items-start gap-2 px-4 py-2.5 text-[13px] hover:bg-text-muted/5 transition-colors">
            {editing === i ? (
              <div className="flex items-center gap-2 flex-1">
                <input autoFocus value={editText} onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onEdit(i); if (e.key === 'Escape') { setEditing(null); setEditText('') } }}
                  className="input input-sm flex-1 text-[13px]" />
                <button onClick={() => onEdit(i)} disabled={!editText.trim()} className="btn-primary btn-sm disabled:opacity-50">Save</button>
                <button onClick={() => { setEditing(null); setEditText('') }} className="btn-ghost btn-sm">Cancel</button>
              </div>
            ) : (
              <>
                <button onClick={() => onToggle(i, !it.checked)} disabled={busy === i}
                  className="flex items-start gap-2.5 flex-1 min-w-0 text-left hover:opacity-80 transition-opacity disabled:opacity-60">
                  {it.checked
                    ? <CheckSquare className="w-4 h-4 text-green shrink-0 mt-0.5" />
                    : <Square className="w-4 h-4 text-text-muted shrink-0 mt-0.5" />}
                  <span className={it.checked ? 'text-text-muted line-through' : ''}><InlineMd text={it.text} /></span>
                </button>
                <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  <button onClick={() => { setEditing(i); setEditText(it.text) }} title="Edit item" className="text-text-muted hover:text-accent p-1 rounded"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => onRemove(i, it.text)} title="Delete item" className="text-text-muted hover:text-red p-1 rounded"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </>
            )}
          </div>
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
          <h4 className="font-semibold text-[13px] text-amber flex items-center gap-1">Accepted exceptions ({d.waivers.length})
            <InfoIcon label="When a quality blocker is acceptable (a known limitation or client-approved), record the reason here so the build can publish despite it." />
          </h4>
          {!addingWaiver && <button onClick={() => setAddingWaiver(true)} className="btn-ghost btn-sm flex items-center gap-1.5 text-[11px] text-amber"><ShieldAlert className="w-3.5 h-3.5" /> Add exception</button>}
        </div>
        {addingWaiver && (
          <div className="flex items-center gap-2 mb-3">
            <input autoFocus value={waiverText} onChange={(e) => setWaiverText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onAddWaiver(); if (e.key === 'Escape') { setAddingWaiver(false); setWaiverText('') } }}
              placeholder="Why is this blocker acceptable? (e.g. client approved)" className="input input-sm flex-1 text-[12px]" />
            <button onClick={onAddWaiver} disabled={!waiverText.trim()} className="btn-sm rounded-md px-2.5 bg-amber text-white disabled:opacity-50">Record</button>
            <button onClick={() => { setAddingWaiver(false); setWaiverText('') }} className="btn-ghost btn-sm">Cancel</button>
          </div>
        )}
        {d.waivers.length > 0
          ? <ul className="space-y-1 text-[12px] text-text-muted">{d.waivers.map((w, i) => <li key={i}>• <InlineMd text={w} /></li>)}</ul>
          : !addingWaiver && <p className="text-[12px] text-text-muted">None. An accepted exception records why a quality blocker was deliberately allowed.</p>}
      </div>
    </div>
  )
}
