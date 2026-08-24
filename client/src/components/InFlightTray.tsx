import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Activity, X, Bot, Clock, Wrench, ChevronRight } from 'lucide-react'
import { getAnalyticsRuns, getInflightSchedules, getActiveBuilds } from '../lib/api'
import { onOrgChartEvent } from '../lib/sseBus'

// Global in-flight runs tray — one place to see everything running across the
// whole app. Sticky bottom-left pill (badge with N). Click to expand a small
// panel enumerating each run with a click-to-jump. Auto-refreshes on the
// shared `agent_run.recorded` SSE event and a 15s tick fallback.

interface InFlightItem {
  id: string
  label: string
  source: string
  startedAt: number
  goto: string
  kind: 'agent' | 'schedule' | 'build'
}

const REFRESH_MS = 15000

function timeAgoShort(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 0 || !Number.isFinite(diff)) return ''
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h`
}

async function fetchAll(): Promise<InFlightItem[]> {
  const [runsRes, sched, builds] = await Promise.all([
    getAnalyticsRuns({ status: 'running', limit: 50 }).catch(() => ({ runs: [], total: 0 })),
    getInflightSchedules().catch(() => ({ inflight: [] })),
    getActiveBuilds().catch(() => ({ builds: [] })),
  ])
  const items: InFlightItem[] = []
  for (const r of runsRes.runs ?? []) {
    items.push({
      id: `run-${r.id}`,
      label: r.agentName || r.prompt?.slice(0, 40) || r.id,
      source: r.source || 'agent',
      startedAt: Date.parse(r.timestamp) || Date.now(),
      goto: `/tracing/${r.id}`,
      kind: 'agent',
    })
  }
  for (const s of sched.inflight ?? []) {
    if (items.some((it) => it.id === `run-${s.runId}`)) continue
    items.push({
      id: `sched-${s.id}`,
      label: s.agentName ? `${s.agentName} · schedule` : `schedule ${s.id}`,
      source: 'schedule',
      startedAt: Date.parse(s.startedAt) || Date.now(),
      goto: `/tracing/${s.runId}`,
      kind: 'schedule',
    })
  }
  for (const b of builds.builds ?? []) {
    items.push({
      id: `build-${b.id}`,
      label: b.store ? `${b.store} build` : `build ${b.id}`,
      source: 'build',
      startedAt: b.startedAt,
      goto: b.previewUrl ? `/shopify/${b.id}` : `/workspace`,
      kind: 'build',
    })
  }
  items.sort((a, b) => b.startedAt - a.startedAt)
  return items
}

function iconFor(kind: InFlightItem['kind']) {
  if (kind === 'schedule') return Clock
  if (kind === 'build') return Wrench
  return Bot
}

export default function InFlightTray() {
  const navigate = useNavigate()
  const [items, setItems] = useState<InFlightItem[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const inFlightRef = useRef(false)

  const refresh = useMemo(() => async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    setLoading(true)
    try {
      const next = await fetchAll()
      setItems(next)
    } catch { /* transient — retry on next tick */ }
    finally {
      inFlightRef.current = false
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const t = window.setInterval(refresh, REFRESH_MS)
    const unsubscribe = onOrgChartEvent((ev) => {
      if (ev.type === 'agent_run.recorded') refresh()
    })
    return () => { window.clearInterval(t); unsubscribe() }
  }, [refresh])

  // Never render at all when there's nothing to show — no visual noise.
  if (items.length === 0) return null

  const count = items.length

  return (
    <>
      {/* Backdrop when expanded — click anywhere to collapse */}
      {open && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Pill / expanded panel */}
      <div
        className="fixed bottom-6 left-6 z-40"
        aria-live="polite"
      >
        {open ? (
          <div className="w-80 max-w-[90vw] bg-surface border border-border rounded-2xl shadow-pop overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border-subtle bg-accent/5">
              <Activity className={`w-4 h-4 text-accent ${loading ? 'animate-pulse' : ''}`} aria-hidden="true" />
              <span className="text-sm font-semibold">Running</span>
              <span className="text-[10px] text-text-muted bg-surface-2 px-1.5 py-0.5 rounded">{count}</span>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="ml-auto p-1 rounded hover:bg-surface-2 text-text-muted hover:text-text"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-border-subtle">
              {items.map((it) => {
                const Icon = iconFor(it.kind)
                return (
                  <button
                    key={it.id}
                    onClick={() => { setOpen(false); navigate(it.goto) }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-2/40 transition-colors"
                  >
                    <Icon className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium truncate">{it.label}</div>
                      <div className="text-[10px] text-text-muted truncate">{it.source} · {timeAgoShort(it.startedAt)} ago</div>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setOpen(true)}
            aria-label={`${count} running`}
            title={`${count} running`}
            className="flex items-center gap-2 px-3 py-2 rounded-full bg-surface border border-border shadow-soft hover:shadow-pop transition-shadow"
          >
            <span className="relative flex items-center">
              <Activity className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent animate-ping" aria-hidden="true" />
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent" aria-hidden="true" />
            </span>
            <span className="text-xs font-medium text-text">{count} running</span>
          </button>
        )}
      </div>
    </>
  )
}
