// Hover/focus prefetch: warm the lazy route chunk AND the page's data cache
// before the user clicks, so the target page renders instantly on navigation.
//
// import('../pages/X') uses the SAME module specifier as React.lazy in App.tsx,
// so Vite/Rollup dedupes to one chunk that's now warm. prefetch() warms the data.

import { useCallback } from 'react'
import { prefetch } from '../lib/cacheCore'
import { CacheKeys } from '../lib/cacheKeys'
import {
  getUnifiedAgents, getOrgChart, getHrRegistry, getProjects, getCategories,
  getAnalyticsSummary, getLearningInbox, getAnalyticsRuns,
} from '../lib/api'

// Keyed by route path. Each warmer fires the chunk import + the data prefetch.
const PREFETCHERS: Record<string, () => void> = {
  '/agents': () => {
    void import('../pages/AllAgents')
    prefetch(CacheKeys.unifiedAgents, getUnifiedAgents)
    prefetch(CacheKeys.projects, getProjects)
    prefetch(CacheKeys.categories, getCategories)
  },
  '/org-chart': () => {
    void import('../pages/OrgChart')
    prefetch(CacheKeys.orgChart, getOrgChart)
  },
  '/hr': () => {
    void import('../pages/Hr')
    prefetch(CacheKeys.hrRegistry, getHrRegistry)
  },
  '/playground': () => {
    void import('../pages/Playground')
    prefetch(CacheKeys.unifiedAgents, getUnifiedAgents)
  },
  '/studio': () => {
    void import('../pages/Orchestration')
    prefetch(CacheKeys.unifiedAgents, getUnifiedAgents)
  },
  '/prompts': () => {
    void import('../pages/Prompts')
    prefetch(CacheKeys.unifiedAgents, getUnifiedAgents)
  },
  '/context-hub': () => {
    void import('../pages/ContextHub')
  },
  '/tracing': () => {
    void import('../pages/Tracing')
    prefetch('analytics/runs', () => getAnalyticsRuns({ limit: 500 }))
  },
  '/monitoring': () => {
    void import('../pages/AnalyticsHub')
    prefetch('analytics/summary', getAnalyticsSummary)
  },
  '/annotation': () => {
    void import('../pages/LearningInbox')
    prefetch(CacheKeys.learningInbox('pending'), () => getLearningInbox('pending'))
  },
}

export function usePrefetch() {
  return useCallback((path: string) => {
    // Normalize to the registered route root (e.g. "/agents/x" → "/agents").
    const warm = PREFETCHERS[path]
    if (warm) warm()
  }, [])
}
