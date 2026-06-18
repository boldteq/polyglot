// DependencyBanner — surfaces a degraded/down subsystem (Ollama, Claude CLI, the
// VS Code hook) at the top of the pages that depend on it, so a silently-offline
// dependency reads as an actionable message instead of "the feature is broken."
//
// Self-contained: it fetches the cached /system/status and renders NOTHING when
// the subsystem is healthy. Drop it at the top of any page: e.g.
//   <DependencyBanner subsystem="memory" hint="Run `ollama serve` in a terminal." />
import { AlertTriangle } from 'lucide-react'
import { useCachedApi } from '../hooks/useCachedApi'
import { getSystemStatus, type SystemStatus, type SubState } from '../lib/api'

type Subsystem = 'memory' | 'evaluation' | 'vscode' | 'server'

const LABEL: Record<Subsystem, string> = {
  memory: 'Memory & search',
  evaluation: 'Evaluation',
  vscode: 'VS Code learning loop',
  server: 'Server',
}

function pick(status: SystemStatus, s: Subsystem): { state: SubState; note: string } {
  return { state: status[s].state, note: status[s].note }
}

export default function DependencyBanner({ subsystem, hint }: { subsystem: Subsystem; hint?: string }) {
  // Shared cache key — many banners on different pages reuse the one fetch.
  const { data } = useCachedApi<SystemStatus>('system/status', getSystemStatus)
  if (!data) return null
  const { state, note } = pick(data, subsystem)
  if (state === 'ok') return null

  const tone = state === 'down'
    ? 'text-red bg-red/10 border-red/20'
    : 'text-amber bg-amber/10 border-amber/20'

  return (
    <div className={`flex items-start gap-2 text-xs rounded-lg border px-3 py-2 mb-4 ${tone}`} role="status">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
      <span className="leading-relaxed">
        <span className="font-semibold">{LABEL[subsystem]} degraded — </span>
        {note}
        {hint && <span className="text-text-muted"> · {hint}</span>}
      </span>
    </div>
  )
}
