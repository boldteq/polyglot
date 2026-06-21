import { useState, useRef, useEffect, useCallback } from 'react'
import { confirmDialog } from '../lib/confirm'
import { toast } from '../components/Toast'
import { runWorkspaceAction, getWorkspaceAction, type ActionRun, type ActionDef } from '../lib/api'

// Shared cockpit-action runner: confirm → POST → poll (1.5s) → toast verdict →
// onChanged(). Used by both ActionsBar and WorkflowTab so the safe-action flow
// lives in ONE place. Returns the live run + a `run(actionDef)` trigger.
export function useWorkspaceAction(buildId: string, onChanged?: () => void) {
  const [run, setRun] = useState<ActionRun | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const startPolling = useCallback((runId: string, label: string) => {
    if (poll.current) clearInterval(poll.current)
    poll.current = setInterval(async () => {
      try {
        const r = await getWorkspaceAction(runId)
        setRun(r)
        if (r.status !== 'running') {
          if (poll.current) clearInterval(poll.current)
          if (r.status === 'done') toast('success', `${label} — passed`)
          else if (r.status === 'failed') toast('warn', `${label} — exit ${r.exitCode} (see Gates tab)`)
          else if (r.status === 'blocked') toast('warn', `${label} blocked — ${r.log}`)
          else toast('error', `${label} ${r.status}`)
          onChanged?.()
        }
      } catch { if (poll.current) clearInterval(poll.current) }
    }, 1500)
  }, [onChanged])

  const trigger = useCallback(async (a: ActionDef) => {
    if (!a.available) { toast('warn', a.unavailableReason || `${a.label} unavailable`); return }
    const ok = await confirmDialog({ title: a.confirm.title, message: a.confirm.message, confirmLabel: a.confirm.confirmLabel || 'Run' })
    if (!ok) return
    try {
      const r = await runWorkspaceAction(buildId, a.id)
      setRun(r)
      if (r.status === 'blocked') { toast('warn', `${a.label} blocked — ${r.log}`); return }
      toast('warn', `${a.label} started…`)
      startPolling(r.runId, a.label)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : `Failed to start ${a.label}`)
    }
  }, [buildId, startPolling])

  return { run, trigger }
}
