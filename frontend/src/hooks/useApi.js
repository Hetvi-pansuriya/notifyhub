import { useState, useEffect, useCallback, useRef } from 'react'
import { request } from '../api'

/**
 * Hook to fetch API endpoints with loading, error, and refresh.
 */
export function useApi(path, options = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const isMounted = useRef(true)

  const optionsKey = JSON.stringify(options)

  const fetchData = useCallback(
    async (silent = false) => {
      if (!path) return null
      if (!silent) setLoading(true)
      setError(null)
      try {
        const res = await request(path, options)
        if (isMounted.current) {
          setData(res)
          setLoading(false)
        }
        return res
      } catch (err) {
        if (isMounted.current) {
          setError(err.message || 'Failed to load data')
          setLoading(false)
        }
        throw err
      }
    },
    [path, optionsKey]
  )

  useEffect(() => {
    isMounted.current = true
    if (path) {
      fetchData(false).catch(() => {})
    }
    return () => {
      isMounted.current = false
    }
  }, [fetchData, path])

  const refresh = useCallback(
    (silent = false) => {
      return fetchData(silent).catch(() => {})
    },
    [fetchData]
  )

  return { data, loading, error, refresh, setData }
}

/**
 * Polls a refresh function periodically (default: 15s).
 */
export function usePolling(refreshFn, intervalMs = 15000) {
  useEffect(() => {
    if (!refreshFn) return
    const id = setInterval(() => {
      refreshFn(true)
    }, intervalMs)
    return () => clearInterval(id)
  }, [refreshFn, intervalMs])
}
