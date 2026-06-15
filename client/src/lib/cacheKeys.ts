// Canonical cache keys + centralized SSE/file-write invalidation wiring.
//
// Keys map 1:1 to API endpoints so they're collision-free and obvious. Shared
// resources (agents, org-chart, projects…) use a static key so every page that
// reads them shares ONE cache entry across navigation. Parameterized resources
// use a key factory.

import { invalidate, invalidateKey } from './cacheCore'
import { onOrgChartEvent } from './sseBus'

export const CacheKeys = {
  projects: 'projects',
  unifiedAgents: 'unified/agents',
  unifiedCommands: 'unified/commands',
  unifiedRules: 'unified/rules',
  categories: 'categories',
  templates: 'templates',
  config: 'config',
  globalSettings: 'global/settings',
  globalClaudeMd: 'global/claude-md',
  orgChart: 'org-chart',
  hrRegistry: 'hr/registry',
  drift: 'org/drift',
  taxonomy: 'taxonomy',
  projectAgents: (id: string) => `projects/${id}/agents`,
  projectCommands: (id: string) => `projects/${id}/commands`,
  projectRules: (id: string) => `projects/${id}/rules`,
  projectClaudeMd: (id: string) => `projects/${id}/claude-md`,
  training: (name: string) => `training/${name}`,
  learningInbox: (status: string) => `learning/inbox/${status}`,
  learningStatus: 'learning/status',
} as const

// Keys that reflect the agent registry — refetched on any agent mutation.
const AGENT_REGISTRY_KEYS: string[] = [
  CacheKeys.unifiedAgents,
  CacheKeys.orgChart,
  CacheKeys.hrRegistry,
  CacheKeys.drift,
]

let _wired = false

/**
 * Wire SSE + file-write events to targeted cache invalidation. Idempotent —
 * call once from App. Replaces the per-page subscribeOrgChart() refetch blocks.
 */
export function initCacheInvalidation(): void {
  if (_wired) return
  _wired = true

  onOrgChartEvent((ev) => {
    if (ev.type === 'agent:upsert' || ev.type === 'agent:remove') {
      invalidate((k) => AGENT_REGISTRY_KEYS.includes(k) || k.startsWith('projects/'))
    } else if (ev.type === 'taxonomy:update') {
      invalidateKey(CacheKeys.taxonomy)
      invalidateKey(CacheKeys.orgChart)
    }
    // task:* events are consumed directly by pages that need live capacity
    // patching (OrgChart load dots, Orchestration step status) via onOrgChartEvent.
  })

  if (typeof window !== 'undefined') {
    // A file write (AI apply, editor save) can touch anything — invalidate all.
    // SWR means only currently-mounted resources actually refetch.
    window.addEventListener('polyglot:file-applied', () => { invalidate(() => true) })
  }
}
