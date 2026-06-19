import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Play, FlaskConical, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { confirmDialog } from '../../lib/confirm'
import { toast } from '../Toast'
import { rerunWorkspaceGates, getWorkspaceAction, type ActionRun } from '../../lib/api'

// P4 — bounded mutating actions for a build. The ONLY mutation is "re-run static
// gates" (writes only to gate-reports/), confirm-gated. "Open in Playground" is
// pure navigation. Polls the action to completion and toasts the verdict.
export default function ActionsBar({ buildId, onChanged }: { buildId: string; onChanged?: () => void }) {
  const nav = useNavigate()
  const [run, setRun] = useState<ActionRun | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const startPolling = (runId: string) => {
    if (poll.current) clearInterval(poll.current)
    poll.current = setInterval(async () => {
      try {
        const r = await getWorkspaceAction(runId)
        setRun(r)
        if (r.status !== 'running') {
          if (poll.current) clearInterval(poll.current)
          if (r.status === 'done') toast('success', 'Gates re-ran — all passing')
          else if (r.status === 'failed') toast('warn', `Gates re-ran — exit ${r.exitCode} (a gate blocked; see Gates tab)`)
          else toast('error', `Gate run ${r.status}`)
          onChanged?.() // refresh build detail (score/gates moved)
        }
      } catch { if (poll.current) clearInterval(poll.current) }
    }, 1500)
  }

  const onRerun = async () => {
    const ok = await confirmDialog({
      title: 'Re-run static gates?',
      message: 'Runs the static gate suite against this build and overwrites its gate-reports/. Does NOT touch theme code or the store. Takes ~10–30s.',
      confirmLabel: 'Re-run gates',
    })
    if (!ok) return
    try {
      const r = await rerunWorkspaceGates(buildId)
      setRun(r)
      toast('warn', 'Gate re-run started…')
      startPolling(r.runId)
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Failed to start gate run')
    }
  }

  const running = run?.status === 'running'
  const Icon = running ? Loader2 : run?.status === 'done' ? CheckCircle2 : run?.status === 'failed' ? XCircle : Play

  return (
    <div className="flex items-center gap-2">
      <button onClick={onRerun} disabled={running}
        className="btn-ghost btn-sm flex items-center gap-1.5 disabled:opacity-50"
        title="Re-run static gates (writes only to gate-reports/)">
        <Icon className={`w-4 h-4 ${running ? 'animate-spin' : run?.status === 'done' ? 'text-green' : run?.status === 'failed' ? 'text-red' : ''}`} />
        {running ? 'Running…' : 'Re-run gates'}
      </button>
      <button onClick={() => nav('/playground')} className="btn-ghost btn-sm flex items-center gap-1.5" title="Open Playground">
        <FlaskConical className="w-4 h-4" /> Playground
      </button>
    </div>
  )
}
