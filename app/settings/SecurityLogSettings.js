'use client'
import { useEffect, useMemo, useState } from 'react'

const ACTION_LABELS = {
  login_success: 'Login',
  login_failed: 'Failed login',
  login_suspended_rejected: 'Suspended login blocked',
  login_solo_mode_rejected: 'Solo-mode login blocked',
  owner_gate_denied: 'Owner-only access blocked',
  owner_gate_denied_unauthenticated: 'Unauthenticated owner-only access blocked',
  credentials_vault_opened: 'Credentials opened',
  credential_add: 'Credential added',
  credential_update: 'Credential updated',
  credential_delete: 'Credential deleted',
  credential_test_started: 'Credential test started',
  credential_test_finished: 'Credential test finished',
  credential_usage_checked: 'Credential usage checked',
  credential_field_revealed: 'Credential field revealed',
  credential_field_copied: 'Credential field copied',
  tab_opened: 'CRM section opened',
  tab_denied_client: 'Client-side tab blocked',
}

function fmtTime(at) {
  try { return new Date(at).toLocaleString() } catch { return at || '' }
}

function actor(event) {
  const u = event.user
  if (!u) return 'Unknown visitor'
  return u.displayName || u.username || u.id
}

function severityColor(severity) {
  if (severity === 'warn') return 'var(--amber)'
  if (severity === 'error') return 'var(--red)'
  return 'var(--accent)'
}

export default function SecurityLogSettings() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    const r = await fetch('/api/audit-log?limit=300', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
    setEvents(r?.events || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    return events.filter(e => e.area === filter || e.severity === filter)
  }, [events, filter])

  const filters = [
    { id: 'all', label: 'All' },
    { id: 'credentials', label: 'Credentials' },
    { id: 'auth', label: 'Logins' },
    { id: 'navigation', label: 'Navigation' },
    { id: 'warn', label: 'Warnings' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 700, margin: 0 }}>Owner Activity Log</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>
            Sensitive CRM events, blocked owner-only attempts, credential actions, and sign-ins.
          </p>
        </div>
        <button onClick={load} className="px-4 rounded-lg text-sm font-medium" style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
          Refresh
        </button>
      </div>

      <div className="flex gap-1 p-1 rounded-xl mb-4 overflow-x-auto" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', width: 'fit-content' }}>
        {filters.map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)} className="rounded-lg transition" style={{
            padding: '9px 14px',
            minHeight: 40,
            fontSize: 13,
            fontWeight: 600,
            background: filter === f.id ? 'var(--accent)' : 'transparent',
            color: filter === f.id ? 'var(--accent-text)' : 'var(--text-muted)',
            border: 'none',
            whiteSpace: 'nowrap',
          }}>
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        {loading ? (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading activity...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}>No matching activity yet.</div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {filtered.map(event => (
              <div key={event.id} className="p-4 grid gap-2 md:grid-cols-[180px_1fr_160px]" style={{ borderBottom: '1px solid var(--border)' }}>
                <div>
                  <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 700 }}>{actor(event)}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{event.user?.role || 'no session'}</div>
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span style={{ color: severityColor(event.severity), fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>{event.area}</span>
                    <span style={{ color: 'var(--text)', fontSize: 14, fontWeight: 600 }}>{ACTION_LABELS[event.action] || event.action}</span>
                  </div>
                  {(event.targetName || event.targetId) && (
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
                      {event.targetName || event.targetId}
                    </div>
                  )}
                  {event.meta && Object.keys(event.meta).length > 0 && (
                    <div className="mt-2 flex gap-1 flex-wrap">
                      {Object.entries(event.meta).map(([k, v]) => (
                        <span key={k} className="px-2 py-1 rounded-md" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 11 }}>
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="md:text-right">
                  <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{fmtTime(event.at)}</div>
                  {event.ip && <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 4 }}>{event.ip}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
