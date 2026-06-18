// Canonical cache keys + centralized SSE/file-write invalidation wiring.
//
// Keys map 1:1 to API endpoints so they're collision-free and obvious. Shared
// resources (agents, org-chart, projects…) use a static key so every page that
// reads them shares ONE cache entry across navigation. Parameterized resources
// use a key factory.

import { invalidate, invalidateKey } from './cacheCore'
import { onOrgChartEvent } from './sseBus'
import { subscribeLearningStream, subscribeBrainStream } from './api'

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
  learningOverview: 'learning/overview',
  brainOverview: 'brain/overview',
  brainPatches: (status: string) => `brain/patches/${status}`,
  brainSignals: (status: string) => `brain/signals/${status}`,
  brainTimeline: 'brain/timeline',
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

  // Learning stream → keep the shared learning cache (inbox counts, status,
  // overview) fresh across navigation. Without this, approving/staging a
  // candidate on one page leaves stale counts on Dashboard/Sidebar/Learning
  // until a hard refresh — the #1 "data doesn't update after I do something"
  // complaint. Mounted pages with their own subscription still patch live; this
  // covers the cross-page cache.
  try {
    subscribeLearningStream((ev) => {
      if (ev.type === 'candidate' || ev.type === 'reviewed') {
        invalidate((k) => k.startsWith('learning/'))
      }
    })
  } catch { /* EventSource unavailable (SSR/test) — non-fatal */ }

  // Brain stream → keep the Brain tab's shared caches fresh cross-page. A `patch`
  // event (apply/reject) invalidates the patch queue + overview; a `memory` event
  // (reindex drained, hygiene pass) refreshes the overview's freshness panel. Same
  // rationale as the learning stream — no hard refresh to see a self-change land.
  try {
    subscribeBrainStream((ev) => {
      if (ev.type === 'patch' || ev.type === 'memory') {
        invalidate((k) => k.startsWith('brain/'))
      }
    })
  } catch { /* EventSource unavailable (SSR/test) — non-fatal */ }

  if (typeof window !== 'undefined') {
    // A file write (AI apply, editor save) can touch anything — invalidate all.
    // SWR means only currently-mounted resources actually refetch.
    window.addEventListener('polyglot:file-applied', () => { invalidate(() => true) })
  }
}
