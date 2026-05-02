import { useState, useCallback } from 'react'
import { updateOrgAgent, bulkUpdateOrgAgents, undoOrgChange, undoOrgBatch } from '../lib/api'
import { toast } from '../components/Toast'
import { useTaxonomy } from './useTaxonomy'

/**
 * Shared hook for bulk agent selection + squad/status assignment.
 * Used by AllAgents and Hr registry tab to eliminate duplicated logic.
 *
 * `getIdFromItem` lets each page map its own item type to a string ID
 * (AllAgents uses `filename`, Hr uses `id`).
 */
export function useAgentBulkActions<T>(
  filteredItems: T[],
  getIdFromItem: (item: T) => string,
  onRefresh?: () => void,
) {
  const { squadById: SQUAD_BY_ID } = useTaxonomy()
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [squadPickerFor, setSquadPickerFor] = useState<string | null>(null)

  const toggleSel = useCallback((id: string) =>
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    }), [])

  const selectAll = useCallback(() =>
    setSelectedIds(new Set(filteredItems.map(getIdFromItem))),
    [filteredItems, getIdFromItem])

  const clearSel = useCallback(() => setSelectedIds(new Set()), [])

  const setAgentSquad = useCallback(async (agentId: string, agentName: string, squad: string | null) => {
    try {
      const res = await updateOrgAgent(agentId, { squad })
      const hid = res?.historyId ?? null
      const sqLabel = squad ? SQUAD_BY_ID[squad]?.label || squad : 'no squad'
      if (hid != null) {
        toast('success', `${agentName} → ${sqLabel}`, {
          action: {
            label: 'Undo',
            onClick: async () => {
              try {
                await undoOrgChange(hid)
                toast('success', 'Reverted')
                onRefresh?.()
              } catch (err) {
                toast('error', err instanceof Error ? err.message : 'Undo failed')
              }
            },
          },
        })
      } else {
        toast('success', `${agentName} → ${sqLabel}`)
      }
      setSquadPickerFor(null)
      onRefresh?.()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Failed to update squad')
    }
  }, [SQUAD_BY_ID, onRefresh])

  const bulkApply = useCallback(async (patch: Record<string, unknown>, label: string) => {
    if (selectedIds.size === 0) return
    setBulkBusy(true)
    try {
      const ids = [...selectedIds]
      const res = await bulkUpdateOrgAgents(ids, patch)
      const okCount = res.updated.filter(u => u.ok).length
      toast('success', `${okCount} ${okCount === 1 ? 'agent' : 'agents'} → ${label}`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await undoOrgBatch(res.batchId)
              toast('success', `${okCount} reverted`)
              onRefresh?.()
            } catch (err) {
              toast('error', err instanceof Error ? err.message : 'Undo failed')
            }
          },
        },
      })
      setSelectedIds(new Set())
      onRefresh?.()
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Bulk update failed')
    } finally {
      setBulkBusy(false)
    }
  }, [selectedIds, onRefresh])

  return {
    selectedIds,
    bulkBusy,
    squadPickerFor,
    setSquadPickerFor,
    toggleSel,
    selectAll,
    clearSel,
    setAgentSquad,
    bulkApply,
  }
}
