import { useCallback, useEffect, useRef, useState } from 'react'

export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const refetch = useCallback(() => {
    setLoading(true)
    setError(null)
    fetcher()
      .then(result => { if (mountedRef.current) setData(result) })
      .catch((e) => { if (mountedRef.current) setError(e.message) })
      .finally(() => { if (mountedRef.current) setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    refetch()
  }, [refetch])

  useEffect(() => {
    const handler = () => refetch()
    window.addEventListener('polyglot:file-applied', handler)
    return () => window.removeEventListener('polyglot:file-applied', handler)
  }, [refetch])

  return { data, loading, error, refetch, setData }
}
