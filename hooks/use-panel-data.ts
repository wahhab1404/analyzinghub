'use client'

/**
 * usePanelData
 *
 * Polls /api/indices/panel-data?symbol={symbol} every POLL_INTERVAL_MS.
 * Provides typed data for all RightPanel widget sections.
 *
 * Features:
 * - Immediate fetch on mount and on symbol change
 * - Polling every 30 s (configurable)
 * - Cleans up interval on unmount and on symbol change to prevent race conditions
 * - Independent loading / error state
 * - Exposes last-updated timestamp from the server
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import type { PanelData } from '@/app/api/indices/panel-data/route'

const POLL_INTERVAL_MS = 30_000 // 30 seconds

interface UsePanelDataResult {
  data: PanelData | null
  loading: boolean
  error: string | null
  lastUpdated: string | null
  refresh: () => void
}

export function usePanelData(symbol: string): UsePanelDataResult {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)

  // Ref to track current in-flight fetch so we can ignore stale results
  const abortRef = useRef<AbortController | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchData = useCallback(async (sym: string, isPolling = false) => {
    // Cancel any in-flight fetch for this slot
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    if (!isPolling) setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/indices/panel-data?symbol=${sym}`, {
        signal: controller.signal,
        cache: 'no-store',
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(body.error ?? `Request failed with status ${res.status}`)
      }

      const json: PanelData = await res.json()

      if (json.errors?.length) {
        console.warn('[usePanelData] Non-fatal server errors:', json.errors)
      }

      setData(json)
      setLastUpdated(json.lastUpdated)
    } catch (err: any) {
      if (err.name === 'AbortError') return // Stale fetch — ignore
      console.error('[usePanelData] Fetch error:', err)
      setError(err.message ?? 'Failed to load panel data')
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    // Immediate fetch on mount or symbol change
    fetchData(symbol, false)

    // Set up polling
    intervalRef.current = setInterval(() => {
      fetchData(symbol, true)
    }, POLL_INTERVAL_MS)

    return () => {
      // Cleanup: cancel in-flight fetch and clear interval
      abortRef.current?.abort()
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [symbol, fetchData])

  const refresh = useCallback(() => {
    fetchData(symbol, false)
  }, [symbol, fetchData])

  return { data, loading, error, lastUpdated, refresh }
}
