import { useEffect, useState, useCallback } from 'react'
import { getWorkspaceBuild, type BuildDetail } from '../lib/api'
import { useWorkspaceStream } from './useWorkspaceStream'

// Loads one build's detail and refreshes it when the SSE stream reports a
// score/gate/changes/lens change. Returns data + loading/error + a reloadKey
// that child tabs depend on so they refetch their own sections together.
export function useBuild(buildId: string | undefined) {
  const [data, setData] = useState<BuildDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(() => {
    if (!buildId) return
    setLoading(true); setError(null)
    getWorkspaceBuild(buildId)
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load build'))
      .finally(() => setLoading(false))
  }, [buildId])

  useEffect(() => { load() }, [load])

  // live: on any workspace event, refetch detail + bump reloadKey for tabs
  useWorkspaceStream(useCallback(() => {
    if (!buildId) return
    getWorkspaceBuild(buildId).then(setData).catch(() => { /* keep last good */ })
    setReloadKey((k) => k + 1)
  }, [buildId]))

  return { data, loading, error, reload: () => { load(); setReloadKey((k) => k + 1) }, reloadKey }
}
