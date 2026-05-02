// Reactive taxonomy hook: fetches squads + tag categories from the server,
// auto-refetches on `taxonomy:update` SSE events. Single source of truth for
// every UI that needs the live squad/tag list.

import { useEffect, useState, useCallback } from 'react'
import { getTaxonomy, subscribeOrgChart, type TaxonomyData, type SquadDef, type TagCategoryDef, type TierDef } from '../lib/api'
import { SQUADS as FALLBACK_SQUADS, TAG_TAXONOMY as FALLBACK_TAGS } from '../lib/orgConstants'

const FALLBACK_TIERS: TierDef[] = [
  { id: 'leadership', label: 'Leadership', icon: 'Shield',     color: '#a855f7', order: 1 },
  { id: 'engineer',   label: 'Engineer',   icon: 'Cpu',        color: '#3b82f6', order: 2 },
  { id: 'analyst',    label: 'Analyst',    icon: 'BarChart3',  color: '#06b6d4', order: 3 },
  { id: 'creative',   label: 'Creative',   icon: 'Paintbrush', color: '#ec4899', order: 4 },
]

// Static fallback so UI still renders if API offline (degraded but functional).
function fallback(): TaxonomyData {
  const cats: Record<string, TagCategoryDef> = {}
  for (const [k, v] of Object.entries(FALLBACK_TAGS)) {
    cats[k] = {
      label: v.label,
      tags: Object.fromEntries(v.tags.map(t => [t, { label: t }])),
    }
  }
  return {
    squads: FALLBACK_SQUADS.map(s => ({ ...s, description: s.description })),
    categories: cats,
    tiers: FALLBACK_TIERS,
  }
}

const PILL_STYLES: Record<string, { pill: string; pillActive: string }> = {
  tech: {
    pill: 'bg-blue-500/12 text-blue-400 border border-blue-500/25 hover:bg-blue-500/20',
    pillActive: 'bg-blue-500 text-white border border-blue-500',
  },
  'work-type': {
    pill: 'bg-purple-500/12 text-purple-400 border border-purple-500/25 hover:bg-purple-500/20',
    pillActive: 'bg-purple-500 text-white border border-purple-500',
  },
  domain: {
    pill: 'bg-emerald-500/12 text-emerald-400 border border-emerald-500/25 hover:bg-emerald-500/20',
    pillActive: 'bg-emerald-500 text-white border border-emerald-500',
  },
}

export function pillStyleFor(category: string): { pill: string; pillActive: string } {
  return PILL_STYLES[category] || PILL_STYLES.tech
}

export interface UseTaxonomyResult {
  squads: SquadDef[]
  squadById: Record<string, SquadDef>
  categories: Record<string, TagCategoryDef>
  tiers: TierDef[]
  tierById: Record<string, TierDef>
  /** Convenience array helpers per category. */
  tagsIn: (category: string) => string[]
  loading: boolean
  refetch: () => void
}

let _cache: TaxonomyData | null = null
const _listeners = new Set<(d: TaxonomyData) => void>()
let _inflight: Promise<TaxonomyData> | null = null

async function fetchAndBroadcast() {
  if (_inflight) return _inflight
  _inflight = getTaxonomy()
    .then(data => {
      _cache = data
      _listeners.forEach(fn => fn(data))
      return data
    })
    .catch(() => {
      const fb = fallback()
      _cache = fb
      _listeners.forEach(fn => fn(fb))
      return fb
    })
    .finally(() => { _inflight = null })
  return _inflight
}

export function useTaxonomy(): UseTaxonomyResult {
  const [data, setData] = useState<TaxonomyData>(() => _cache || fallback())
  const [loading, setLoading] = useState(!_cache)

  useEffect(() => {
    const onChange = (d: TaxonomyData) => { setData(d); setLoading(false) }
    _listeners.add(onChange)
    if (!_cache) {
      fetchAndBroadcast().finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    return () => { _listeners.delete(onChange) }
  }, [])

  // Subscribe to SSE so any taxonomy:update across pages auto-refetches
  useEffect(() => {
    const es = subscribeOrgChart((ev) => {
      if (ev.type === 'taxonomy:update') {
        fetchAndBroadcast()
      }
    })
    return () => es.close()
  }, [])

  const refetch = useCallback(() => { fetchAndBroadcast() }, [])

  const squadById = Object.fromEntries(data.squads.map(s => [s.id, s]))
  const tiers = data.tiers || []
  const tierById = Object.fromEntries(tiers.map(t => [t.id, t]))
  const tagsIn = useCallback(
    (category: string) => Object.keys(data.categories?.[category]?.tags || {}),
    [data]
  )

  return {
    squads: data.squads,
    squadById,
    categories: data.categories,
    tiers,
    tierById,
    tagsIn,
    loading,
    refetch,
  }
}
