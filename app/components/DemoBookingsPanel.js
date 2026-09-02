'use client'
import { useEffect, useState } from 'react'

async function fetchJson(url, options) {
  const res = await fetch(url, options)
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(text?.slice(0, 160) || `HTTP ${res.status}`)
  }
  if (!res.ok && !data?.error) throw new Error(`HTTP ${res.status}`)
  return data
}

export default function DemoBookingsPanel({ onLeadCreated }) {
  const [status, setStatus] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState(null)
  const [showDetails, setShowDetails] = useState(false)

  const refresh = async () => {
    try {
      const r = await fetchJson('/api/demo-bookings/listener')
      setStatus(r)
    } catch (e) {
      setStatus({ running: false, lastError: e.message })
    }
  }

  useEffect(() => {
    refresh()
    const h = setInterval(refresh, 30000)
    return () => clearInterval(h)
  }, [])

  const syncNow = async () => {
    setSyncing(true)
    setSyncMsg(null)
    try {
      const r = await fetchJson('/api/demo-bookings/sync', { method: 'POST' })
      if (r.ok) {
        setSyncMsg({
          ok: true,
          text: `Retry checked ${r.pulled} booking${r.pulled === 1 ? '' : 's'} - imported ${r.imported}${r.skipped ? ` - skipped ${r.skipped}` : ''}${r.errored ? ` - errored ${r.errored}` : ''}`,
        })
        if (r.imported > 0 && onLeadCreated) onLeadCreated()
      } else {
        setSyncMsg({ ok: false, text: r.error || 'Retry failed' })
      }
    } catch (e) {
      setSyncMsg({ ok: false, text: e.message })
    } finally {
      setSyncing(false)
      refresh()
    }
  }

  if (!status) return null

  const hasError = !!status.lastError || !status.running
  if (!hasError && !showDetails) return null

  const dotColor = status.running ? '#16a34a' : (status.lastError ? '#dc2626' : '#6b7084')
  const dotShadow = status.running ? '0 0 8px rgba(22,163,74,0.6)' : 'none'
  const lastImported = status.lastImported?.name || status.lastImported?.email || status.lastImported?.bookingId

  return (
    <div
      className="rounded-lg mb-3"
      style={{
        background: hasError ? 'var(--surface)' : 'transparent',
        border: '1px solid var(--border)',
        padding: '8px 10px',
      }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span style={{ width: 10, height: 10, borderRadius: 999, background: dotColor, boxShadow: dotShadow, display: 'inline-block' }} />
            <span style={{ fontSize: 12, fontWeight: 650, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              Demo bookings auto-import {status.running ? 'live' : (status.lastError ? 'needs attention' : 'idle')}
            </span>
          </div>
          <span className="truncate" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {status.importedCount || 0} imported{status.skippedCount ? ` - ${status.skippedCount} dedup'd` : ''}
            {lastImported && ` - last: ${lastImported}`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {hasError && (
            <button
              onClick={syncNow}
              disabled={syncing}
              style={{
                padding: '8px 12px',
                minHeight: 36,
                fontSize: 12,
                fontWeight: 650,
                background: syncing ? 'var(--surface2)' : 'var(--surface)',
                color: syncing ? 'var(--text-muted)' : 'var(--accent)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                cursor: syncing ? 'not-allowed' : 'pointer',
              }}
            >
              {syncing ? 'Retrying...' : 'Retry import'}
            </button>
          )}
          <button
            onClick={() => setShowDetails(v => !v)}
            style={{
              minHeight: 36,
              padding: '8px 10px',
              fontSize: 12,
              fontWeight: 600,
              background: 'transparent',
              color: 'var(--text-muted)',
              border: '1px solid var(--border)',
              borderRadius: 8,
            }}
          >
            {showDetails ? 'Hide details' : 'Details'}
          </button>
        </div>
      </div>

      {showDetails && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
          Firestore listener imports new demo bookings automatically. Manual retry appears only when the listener needs attention.
        </div>
      )}
      {status.lastError && (
        <div style={{ fontSize: 12, color: '#dc2626', marginTop: 8, fontFamily: 'monospace' }}>
          {status.lastError}
        </div>
      )}
      {syncMsg && (
        <div style={{ fontSize: 13, marginTop: 8, color: syncMsg.ok ? '#16a34a' : '#dc2626' }}>
          {syncMsg.text}
        </div>
      )}
    </div>
  )
}
