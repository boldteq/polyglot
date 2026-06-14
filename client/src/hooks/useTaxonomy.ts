// Reactive taxonomy hook: fetches squads + tag categories from the server,
// auto-refetches on `taxonomy:update` SSE events. Single source of truth for
// every UI that needs the live squad/tag list.

import { useEffect, useState, useCallback, useMemo } from 'react'
import { getTaxonomy, type TaxonomyData, type SquadDef, type TagCategoryDef, type TierDef } from '../lib/api'
import { onOrgChartEvent } from '../lib/sseBus'
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
  squadOrder: string[]
  agentRoleBand: Record<string, string>
  roleBandLabels: Record<string, string>
  /** Resolve role band for an agent id with sensible fallback. */
  roleBandFor: (agentId: string) => string
  /** Human-readable label for a role band id. */
  roleBandLabel: (bandId: string) => string
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

  // Subscribe to SSE so any taxonomy:update across pages auto-refetches.
  // Shared bus = one app-wide connection instead of one per mounted consumer.
  useEffect(() => {
    return onOrgChartEvent((ev) => {
      if (ev.type === 'taxonomy:update') {
        fetchAndBroadcast()
      }
    })
  }, [])

  const refetch = useCallback(() => { fetchAndBroadcast() }, [])

  const squads = data.squads
  const tiers = useMemo(() => data.tiers || [], [data.tiers])
  const squadById = useMemo(
    () => Object.fromEntries(squads.map(s => [s.id, s])),
    [squads],
  )
  const tierById = useMemo(
    () => Object.fromEntries(tiers.map(t => [t.id, t])),
    [tiers],
  )
  const tagsIn = useCallback(
    (category: string) => Object.keys(data.categories?.[category]?.tags || {}),
    [data],
  )

  const squadOrder = useMemo(
    () => (data.squadOrder && data.squadOrder.length ? data.squadOrder : squads.map(s => s.id)),
    [data.squadOrder, squads],
  )
  const agentRoleBand = useMemo(() => data.agentRoleBand || {}, [data.agentRoleBand])
  const roleBandLabels = useMemo(() => data.roleBandLabels || {}, [data.roleBandLabels])
  const roleBandFor = useCallback(
    (agentId: string) => agentRoleBand[agentId] || 'lead',
    [agentRoleBand],
  )
  const roleBandLabel = useCallback(
    (bandId: string) => roleBandLabels[bandId] || bandId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    [roleBandLabels],
  )

  return {
    squads,
    squadById,
    squadOrder,
    agentRoleBand,
    roleBandLabels,
    roleBandFor,
    roleBandLabel,
    categories: data.categories,
    tiers,
    tierById,
    tagsIn,
    loading,
    refetch,
  }
}
