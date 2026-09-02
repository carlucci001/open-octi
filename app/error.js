'use client'

import { useEffect } from 'react'

import { reportClientError } from './components/reportClientError'

// Segment-level boundary. Without this, a single throw in any panel replaced the
// entire Command Center with Next's bare "Application error" screen and logged
// nothing anywhere. Now the shell survives, Carl gets a readable panel, and the
// stack is posted to /api/client-error + ntfy.
export default function CommandCenterError({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { kind: 'render' })
  }, [error])

  return (
    <div
      className="flex min-h-[60vh] items-center justify-center p-6"
      style={{ color: 'var(--text)' }}
    >
      <div
        className="w-full max-w-xl rounded-xl p-6"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
      >
        <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
          Command Center
        </div>
        <h1 className="mt-1 text-xl font-semibold" style={{ fontFamily: "'Outfit', sans-serif" }}>
          This screen hit an error
        </h1>
        <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
          The rest of Command Center is still running. The fault has been logged and pushed to your
          alerts topic.
        </p>

        {error?.message ? (
          <pre
            className="mt-4 overflow-auto rounded-lg p-3 text-xs"
            style={{
              background: 'var(--bg, #020711)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              maxHeight: 180,
            }}
          >
            {error.message}
            {error.digest ? `\n\ndigest: ${error.digest}` : ''}
          </pre>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: 'var(--accent)', color: '#02121f' }}
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/?tab=dashboard')}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ border: '1px solid var(--border)', color: 'var(--text)' }}
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )
}
