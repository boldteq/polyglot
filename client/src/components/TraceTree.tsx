import { useState } from 'react'
import { ChevronRight, ChevronDown, CheckCircle2, XCircle, Circle, CornerDownRight } from 'lucide-react'
import { formatAgentDisplay } from '../lib/agentDisplay'
import type { TraceNode } from '../lib/api'

// Recursive trace-tree row (LangSmith-style waterfall). Each node shows the
// agent, status, a timing bar positioned within the whole trace span, and
// cost/token badges; expanding reveals its event spans + nested children.

function statusIcon(status: string) {
  if (status === 'success') return <CheckCircle2 className="w-3.5 h-3.5 text-green shrink-0" aria-hidden="true" />
  if (status === 'error' || status === 'crashed' || status === 'timeout') return <XCircle className="w-3.5 h-3.5 text-red shrink-0" aria-hidden="true" />
  return <Circle className="w-3.5 h-3.5 text-text-muted shrink-0" aria-hidden="true" />
}

function fmtDuration(ms: number): string {
  if (!ms) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

const EVENT_COLORS: Record<string, string> = {
  gate: 'text-blue', retry: 'text-amber', file: 'text-text-muted',
  tool: 'text-purple', delegation: 'text-accent', judge: 'text-emerald',
  output: 'text-text-muted', note: 'text-text-muted',
}

interface RowProps {
  node: TraceNode
  depth: number
  rootStartMs: number
  spanMs: number
}

function TraceRow({ node, depth, rootStartMs, spanMs }: RowProps) {
  const [open, setOpen] = useState(depth < 1)
  const d = formatAgentDisplay({ name: node.agentName, id: node.agentName })
  const hasDetail = node.children.length > 0 || node.events.length > 0

  // Waterfall bar geometry: offset + width as a % of the whole trace span.
  const startMs = node.startTs ? Date.parse(node.startTs) : NaN
  const offsetPct = spanMs > 0 && Number.isFinite(startMs) ? Math.max(0, Math.min(100, ((startMs - rootStartMs) / spanMs) * 100)) : 0
  const widthPct = spanMs > 0 ? Math.max(1.5, Math.min(100 - offsetPct, (node.durationMs / spanMs) * 100)) : 0

  return (
    <div>
      <div
        className="group flex items-center gap-2 py-1.5 pr-3 rounded-lg hover:bg-surface-2/40 transition-colors"
        style={{ paddingLeft: `${depth * 18 + 4}px` }}
      >
        <button
          onClick={() => hasDetail && setOpen(o => !o)}
          aria-label={hasDetail ? (open ? 'Collapse' : 'Expand') : 'No details'}
          aria-expanded={hasDetail ? open : undefined}
          className={`shrink-0 text-text-muted ${hasDetail ? 'hover:text-text' : 'opacity-0 pointer-events-none'}`}
        >
          {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        {statusIcon(node.status)}
        <span className="text-xs font-medium truncate min-w-0" title={d.fullName}>
          {d.emoji && <span className="mr-1">{d.emoji}</span>}{d.realName}
        </span>
        {node.task && <span className="text-[10px] text-text-muted truncate hidden sm:inline">· {node.task}</span>}

        {/* Waterfall timing bar */}
        <div className="flex-1 min-w-[80px] h-2 mx-2 relative hidden md:block" title={fmtDuration(node.durationMs)}>
          <div className="absolute inset-0 bg-surface-2 rounded-full" />
          <div
            className="absolute h-2 rounded-full bg-accent/70"
            style={{ left: `${offsetPct}%`, width: `${widthPct}%` }}
          />
        </div>

        <span className="text-[10px] text-text-muted tabular-nums w-12 text-right shrink-0">{fmtDuration(node.durationMs)}</span>
        <span className="text-[10px] text-text-muted tabular-nums w-16 text-right shrink-0" title={node.estimated ? 'Estimated' : 'Measured'}>
          {node.tokens ? node.tokens.toLocaleString() : '—'} tok
        </span>
        <span className="text-[10px] text-text-muted tabular-nums w-16 text-right shrink-0">
          {node.costUsd ? `$${node.costUsd.toFixed(4)}` : '—'}
        </span>
      </div>

      {open && (
        <>
          {/* Events for this node */}
          {node.events.length > 0 && (
            <div className="space-y-0.5 py-1" style={{ paddingLeft: `${depth * 18 + 30}px` }}>
              {node.events.map((e, i) => (
                <div key={i} className="flex items-center gap-2 text-[10px] text-text-muted">
                  <CornerDownRight className="w-3 h-3 opacity-50 shrink-0" aria-hidden="true" />
                  <span className={`font-mono font-semibold uppercase ${EVENT_COLORS[e.type] || 'text-text-muted'}`}>{e.type}</span>
                  <span className="truncate min-w-0">{eventSummary(e.type, e.data)}</span>
                  <span className="ml-auto tabular-nums shrink-0">{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          )}
          {/* Nested children */}
          {node.children.map((child, i) => (
            <TraceRow key={child.runId || `${child.agentName}-${i}`} node={child} depth={depth + 1} rootStartMs={rootStartMs} spanMs={spanMs} />
          ))}
        </>
      )}
    </div>
  )
}

function eventSummary(type: string, data: Record<string, unknown>): string {
  if (type === 'delegation') return `→ ${String(data.childAgent ?? '')}`
  if (type === 'judge') return `overall ${String(data.overall ?? '?')}${data.pass ? ' · pass' : ' · fail'}`
  if (type === 'output' && typeof data.text === 'string') return data.text.slice(0, 120)
  const keys = Object.keys(data)
  if (!keys.length) return ''
  return keys.slice(0, 3).map(k => `${k}=${String(data[k]).slice(0, 40)}`).join(' ')
}

export default function TraceTree({ tree, spanMs }: { tree: TraceNode; spanMs: number }) {
  const rootStartMs = tree.startTs ? Date.parse(tree.startTs) : 0
  return (
    <div className="card p-2">
      <TraceRow node={tree} depth={0} rootStartMs={rootStartMs} spanMs={spanMs || 1} />
    </div>
  )
}
