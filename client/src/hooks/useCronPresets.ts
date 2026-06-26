// Server-curated cron expression presets, with a fail-safe fallback list so
// the UI keeps working even if /api/schedules/presets 500s. Singleton cache
// shared across mounts so the create/edit form opens instantly.

import { useEffect, useState } from 'react'
import { getCronPresets, type CronPreset } from '../lib/api'

// MIRRORS src/routes/schedules.js CRON_PRESETS (the server source of truth via
// /api/schedules/presets). Offline-only fallback — keep both in sync on change.
const FALLBACK_PRESETS: CronPreset[] = [
  { label: 'Every minute',         value: '* * * * *' },
  { label: 'Every 5 minutes',      value: '*/5 * * * *' },
  { label: 'Every hour',           value: '0 * * * *' },
  { label: 'Every day at 9am UTC', value: '0 9 * * *' },
  { label: 'Every Monday 9am UTC', value: '0 9 * * 1' },
  { label: 'Every Sunday 2am UTC', value: '0 2 * * 0' },
  { label: 'Every 1st of month',   value: '0 9 1 * *' },
]

let _cache: CronPreset[] | null = null
let _inflight: Promise<CronPreset[]> | null = null

function fetchPresets(): Promise<CronPreset[]> {
  if (_cache) return Promise.resolve(_cache)
  if (_inflight) return _inflight
  _inflight = getCronPresets()
    .then(res => {
      _cache = res.presets || FALLBACK_PRESETS
      return _cache
    })
    .catch(err => {
      console.warn('[useCronPresets] fetch failed, using fallback:', err?.message || err)
      _cache = FALLBACK_PRESETS
      return _cache
    })
    .finally(() => { _inflight = null })
  return _inflight
}

export function useCronPresets(): { presets: CronPreset[]; loading: boolean } {
  const [presets, setPresets] = useState<CronPreset[]>(_cache || FALLBACK_PRESETS)
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    let cancelled = false
    fetchPresets().then(p => { if (!cancelled) { setPresets(p); setLoading(false) } })
    return () => { cancelled = true }
  }, [])

  return { presets, loading }
}
