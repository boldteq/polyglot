import { useEffect, useState } from 'react'

// Generic lazy loader for a Build Detail section (changes/agents/schedules/
// results/files). Fetches when mounted and refetches when `reloadKey` changes
// (e.g. driven by SSE in the parent). Keeps last-good data on refetch error.
export function useBuildSection<T>(fetcher: () => Promise<T>, reloadKey?: number) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetcher()
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : 'Failed to load') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // fetcher is recreated per render; we intentionally key on reloadKey only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey])

  return { data, loading, error }
}
