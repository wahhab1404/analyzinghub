'use client'

import { useState, useEffect } from 'react'

export default function DebugReportsPage() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        console.log('[Debug Page] Starting fetch...')

        const response = await fetch('/api/debug/reports-test', {
          cache: 'no-store'
        })

        console.log('[Debug Page] Response status:', response.status)

        if (!response.ok) {
          const text = await response.text()
          console.error('[Debug Page] Error response:', text)
          throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const json = await response.json()
        console.log('[Debug Page] Data received:', json)
        setData(json)
      } catch (err: any) {
        console.error('[Debug Page] Error:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Debug Reports Page</h1>
        <p>Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <h1>Debug Reports Page</h1>
        <div style={{ color: 'red' }}>
          <h2>Error:</h2>
          <pre>{error}</pre>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', fontFamily: 'monospace' }}>
      <h1>Debug Reports Page</h1>

      <h2>User Info:</h2>
      <pre>{JSON.stringify(data?.user, null, 2)}</pre>

      <h2>Profile:</h2>
      <pre>{JSON.stringify(data?.profile, null, 2)}</pre>

      <h2>Simple Query Result:</h2>
      <pre>{JSON.stringify(data?.simpleQuery, null, 2)}</pre>

      <h2>Full Query Result:</h2>
      <pre>{JSON.stringify(data?.fullQuery, null, 2)}</pre>

      <h2>Full Response:</h2>
      <details>
        <summary>Click to expand</summary>
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </details>
    </div>
  )
}
