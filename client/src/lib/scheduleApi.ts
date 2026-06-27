// Schedule command-center API — the global activity feed + upcoming timeline.
// Kept separate from api.ts so it doesn't entangle with that file's in-progress
// WIP; reuses the same '/api' base + JSON-error convention via a tiny local GET.
import type { ScheduleKind, ScheduleRun } from './api'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const j = await res.json(); if (j && j.error) msg = j.error } catch { /* non-JSON body */ }
    throw new Error(msg)
  }
  return res.json() as Promise<T>
}

export interface ScheduleRunMetadata {
  scheduleId?: string
  systemId?: string
  handler?: string
  retryCount?: number
  realTokens?: number
  realCostUsd?: number
  model?: string
  faults?: { where: string; message: string }[]
  outputPreview?: string
}

export interface ScheduleActivityRun extends Omit<ScheduleRun, 'metadata'> {
  metadata: ScheduleRunMetadata
}

export interface ScheduleActivityParams {
  limit?: number
  offset?: number
  status?: string // comma list, e.g. 'error,crashed'
  kind?: 'user' | 'system'
  scheduleId?: string
  since?: string // ISO
  q?: string // free-text search across agent/error/prompt (server-side, all history)
}

export interface ScheduleActivityStats {
  total: number
  success: number
  failed: number
  running: number
  cancelled: number
  avgDurationMs: number
  totalCostUsd: number
}

export function getScheduleActivity(p: ScheduleActivityParams = {}) {
  const q = new URLSearchParams()
  if (p.limit != null) q.set('limit', String(p.limit))
  if (p.offset != null) q.set('offset', String(p.offset))
  if (p.status) q.set('status', p.status)
  if (p.kind) q.set('kind', p.kind)
  if (p.scheduleId) q.set('scheduleId', p.scheduleId)
  if (p.since) q.set('since', p.since)
  if (p.q) q.set('q', p.q)
  const qs = q.toString()
  return get<{ runs: ScheduleActivityRun[]; total: number; stats: ScheduleActivityStats }>(`/schedules/activity${qs ? `?${qs}` : ''}`)
}

export interface UpcomingRun { id: string; name: string; agentName: string; kind: ScheduleKind; cron: string; fireAt: string }
export interface EventDrivenSchedule { id: string; name: string; agentName: string; kind: ScheduleKind; trigger: string }

export function getScheduleUpcoming(count = 60, perSchedule = 3) {
  return get<{ upcoming: UpcomingRun[]; eventDriven: EventDrivenSchedule[] }>(
    `/schedules/upcoming?count=${count}&perSchedule=${perSchedule}`,
  )
}
