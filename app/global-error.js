'use client'

import { useEffect } from 'react'

import { reportClientError } from './components/reportClientError'

// Last line of defence: catches faults in the root layout itself, where the
// segment boundary in app/error.js cannot reach. Must render its own <html>/<body>
// and stays on inline styles because globals.css may not have loaded.
export default function GlobalError({ error, reset }) {
  useEffect(() => {
    reportClientError(error, { kind: 'global-render' })
  }, [error])

  return (
    <html lang="en" data-theme="command">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#020711',
          color: '#F8FBFF',
          fontFamily: "'Outfit', system-ui, sans-serif",
          padding: 24,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            width: '100%',
            background: '#0A1626',
            border: '1px solid #1E3A55',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase', color: '#8EA4B8' }}>
            Command Center
          </div>
          <h1 style={{ margin: '4px 0 0', fontSize: 20 }}>Command Center failed to start</h1>
          <p style={{ color: '#8EA4B8', fontSize: 14, lineHeight: 1.5 }}>
            The fault has been logged and pushed to your alerts topic. Reloading usually clears it.
          </p>
          {error?.message ? (
            <pre
              style={{
                background: '#020711',
                border: '1px solid #1E3A55',
                borderRadius: 8,
                padding: 12,
                fontSize: 12,
                color: '#8EA4B8',
                maxHeight: 180,
                overflow: 'auto',
              }}
            >
              {error.message}
              {error.digest ? `\n\ndigest: ${error.digest}` : ''}
            </pre>
          ) : null}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: '#38BDF8',
                color: '#02121f',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.location.reload()}
              style={{
                background: 'transparent',
                color: '#F8FBFF',
                border: '1px solid #1E3A55',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
