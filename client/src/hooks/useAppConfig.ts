// Phase 2 — Static→Dynamic refactor
// Singleton cache + SSE subscription to /api/app-config/stream. Every UI
// page that needs tunable thresholds, time windows, API limits, UI caps,
// or default values reads from this hook. Drift between pages becomes
// impossible because each consumer subscribes to the same store.

import { useEffect, useState, useCallback } from 'react'
import {
  getAppConfig,
  type AppConfigResponse,
  type AppConfigData,
  type DispatchPolicy,
  type PodDef,
  type ModelDef,
  type ModelPolicyRow,
} from '../lib/api'

const FALLBACK: AppConfigResponse = {
  config: {
    health: { threshold_healthy: 90, threshold_degraded: 70 },
    time: {
      pip_window_days: 14,
      sweep_hours: 24,
      cadence_review_days: 7,
      drift_retention_days: 30,
      claim_expiry_minutes: 30,
    },
    api_limits: {
      runs_dashboard: 200,
      runs_analytics: 500,
      governance: 50,
      bulk_ops: 100,
      db_explorer: 50,
      logs_stream: 500,
      top_agents: 10,
    },
    ui_caps: {
      top_agents: 10,
      stack_trace_lines: 15,
      memory_preview_lines: 20,
      playground_history: 50,
      recent_runs: 8,
      memory_history_items: 14,
      schedules_dashboard: 6,
    },
    defaults: {
      model: 'claude-sonnet-4-6',
      tier: 'engineer',
      status: 'pending',
      budget_lines: 400,
      budget_chars: 16000,
    },
  },
  dispatchPolicy: {
    skill_weight: 0.5,
    load_weight: 0.2,
    success_weight: 0.2,
    cost_weight_normal: 0.1,
    cost_weight_downgrade: 0.45,
    priority_boost: { p0: 0.3, p1: 0.15, p2: 0, p3: -0.05 },
  },
  pods: [],
  models: [],
  modelPolicy: [],
  fallbackActive: true,
}

export interface UseAppConfigResult {
  config: AppConfigData
  dispatchPolicy: DispatchPolicy
  pods: PodDef[]
  models: ModelDef[]
  modelPolicy: ModelPolicyRow[]
  fallbackActive: boolean
  loading: boolean
  refetch: () => void
}

let _cache: AppConfigResponse | null = null
let _inflight: Promise<AppConfigResponse> | null = null
const _listeners = new Set<(d: AppConfigResponse) => void>()

async function fetchAndBroadcast(): Promise<AppConfigResponse> {
  if (_inflight) return _inflight
  _inflight = getAppConfig()
    .then((data) => {
      _cache = data
      _listeners.forEach((fn) => fn(data))
      return data
    })
    .catch((err) => {
      console.error('[useAppConfig] fetch failed, using fallback:', err instanceof Error ? err.message : err)
      _cache = FALLBACK
      _listeners.forEach((fn) => fn(FALLBACK))
      return FALLBACK
    })
    .finally(() => {
      _inflight = null
    })
  return _inflight
}

// SSE subscription — initialized lazily once per browser session.
let _sseStarted = false
function ensureSseSubscription() {
  if (_sseStarted) return
  _sseStarted = true
  try {
    const es = new EventSource('/api/app-config/stream')
    es.addEventListener('config:update', () => {
      // Invalidate cache + refetch on any write — covers app_config keys,
      // dispatch policy, pods, models, model policy.
      fetchAndBroadcast()
    })
    es.onerror = () => {
      // SSE will auto-reconnect; nothing to do here. Hook still returns last
      // cached value until the connection resumes.
    }
  } catch (err) {
    console.error('[useAppConfig] SSE subscribe failed:', err instanceof Error ? err.message : err)
  }
}

export function useAppConfig(): UseAppConfigResult {
  const [data, setData] = useState<AppConfigResponse>(() => _cache || FALLBACK)
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    const onChange = (d: AppConfigResponse) => {
      setData(d)
      setLoading(false)
    }
    _listeners.add(onChange)
    ensureSseSubscription()
    if (!_cache) {
      fetchAndBroadcast().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => {
      _listeners.delete(onChange)
    }
  }, [])

  const refetch = useCallback(() => {
    fetchAndBroadcast()
  }, [])

  return {
    config: data.config,
    dispatchPolicy: data.dispatchPolicy,
    pods: data.pods,
    models: data.models,
    modelPolicy: data.modelPolicy,
    fallbackActive: data.fallbackActive,
    loading,
    refetch,
  }
}
