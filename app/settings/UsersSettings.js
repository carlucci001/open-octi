'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect } from 'react'

const ROLES = [
  { id: 'owner', label: 'Owner (full control)' },
  { id: 'admin', label: 'Admin (team + CRM)' },
  { id: 'member', label: 'Member (CRM work)' },
]
const LOCATIONS = [
  { id: 'public', label: 'Public CRM' },
  { id: 'local', label: 'Office LAN' },
  { id: 'remote', label: 'Tailscale' },
  { id: 'both', label: 'Public + LAN' },
]

export default function UsersSettings() {
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [endpoints, setEndpoints] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Add-user form
  const blankForm = { username: '', displayName: '', email: '', password: '', role: 'member', location: 'public', sendInvite: true }
  const [form, setForm] = useState(blankForm)
  const [showAddForm, setShowAddForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const cancelAdd = () => { setForm(blankForm); setShowAddForm(false); setError('') }

  // Per-user UI state
  const [editing, setEditing] = useState(null)
  const [shareFor, setShareFor] = useState(null)

  const refresh = async () => {
    setLoading(true)
    setError('')
    try {
      const [rMe, rUsers, rInfo] = await Promise.all([
        fetch('/api/auth/me').then(r => r.json()).catch(() => ({})),
        fetch('/api/users').then(r => r.json()).catch(() => ({})),
        fetch('/api/server-info').then(r => r.json()).catch(() => ({})),
      ])
      setMe(rMe.user || null)
      setUsers(rUsers.users || [])
      setEndpoints(rInfo.endpoints || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const addUser = async (e) => {
    e.preventDefault()
    if (!form.username || !form.password) return
    setSaving(true)
    setError('')
    try {
      const r = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        setError(j.error || 'failed to add user')
      } else {
        if (form.sendInvite) {
          if (j.invite?.ok) alert(`User created and invite emailed to ${form.email}.`)
          else if (j.invite) alert(`User created — but invite email failed: ${j.invite.error}`)
        }
        setForm(blankForm)
        setShowAddForm(false)
        await refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  const removeUser = async (id, username) => {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return
    const r = await fetch(`/api/users/${id}`, { method: 'DELETE' })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'delete failed'); return }
    refresh()
  }

  const bootUser = async (id, displayName) => {
    if (!confirm(`Force ${displayName} off the CRM? They'll be sent back to /login within 30 seconds. Their account stays intact.`)) return
    const r = await fetch(`/api/users/${id}/boot`, { method: 'POST' })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'boot failed'); return }
    refresh()
  }

  const toggleSuspend = async (u) => {
    const next = !u.suspended
    const verb = next ? 'suspend' : 'reactivate'
    if (!confirm(`${verb[0].toUpperCase()+verb.slice(1)} ${u.displayName || u.username}? ${next ? 'They will be logged out and unable to sign in until reactivated.' : 'They will be able to sign in again.'}`)) return
    const r = await fetch(`/api/users/${u.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ suspended: next }),
    })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'update failed'); return }
    refresh()
  }

  const saveEdit = async (e) => {
    e.preventDefault()
    if (!editing) return
    const patch = { ...editing }
    if (!patch.password) delete patch.password
    delete patch.id
    delete patch.passwordHash
    delete patch.createdAt
    delete patch.updatedAt
    delete patch.lastLoginAt
    const r = await fetch(`/api/users/${editing.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'update failed'); return }
    setEditing(null)
    refresh()
  }

  const shareLinkFor = (user) => {
    if (!endpoints) return null
    const wantPublic = !user.location || user.location === 'public' || user.location === 'both'
    const wantRemote = user.location === 'remote'
    const wantLan = user.location === 'local' || user.location === 'both'
    return {
      public: wantPublic ? endpoints.public : null,
      lan: wantLan ? (endpoints.lan?.[0]?.url || null) : null,
      lanAll: wantLan ? (endpoints.lan || []) : [],
      tailscale: wantRemote ? endpoints.tailscale : null,
    }
  }

  const canManageUsers = me?.role === 'owner' || me?.role === 'admin'

  if (me && !canManageUsers) {
    return <div style={{ color: 'var(--text-muted)' }}>Only admins can manage users.</div>
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
          Users
        </h2>
        {!showAddForm && (
          <button type="button" onClick={() => setShowAddForm(true)} style={btnPrimary()}>
            + Add user
          </button>
        )}
      </div>

      {/* Add user form (collapsed by default — opens via the + Add user button) */}
      {showAddForm && (
        <form onSubmit={addUser} style={{
          background: 'var(--surface2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
        }}>
          <div style={{ gridColumn: '1 / -1', fontWeight: 600, fontSize: 16, color: 'var(--text)' }}>
            Add user
          </div>
          <Field label="Username" value={form.username} onChange={v => setForm({...form, username: v})} required />
          <Field label="Display name" value={form.displayName} onChange={v => setForm({...form, displayName: v})} />
          <Field label="Email" type="email" value={form.email} onChange={v => setForm({...form, email: v})} />
          <Field label="Password" type="password" value={form.password} onChange={v => setForm({...form, password: v})} required minLength={6} />
          <Select label="Role" value={form.role} onChange={v => setForm({...form, role: v})} options={me?.role === 'owner' ? ROLES : ROLES.filter(r => r.id !== 'owner')} />
          <Select label="Location" value={form.location} onChange={v => setForm({...form, location: v})} options={LOCATIONS} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
            <input
              type="checkbox"
              id="sendInvite"
              checked={form.sendInvite}
              onChange={e => setForm({...form, sendInvite: e.target.checked})}
              style={{ width: 18, height: 18 }}
            />
            <label htmlFor="sendInvite" style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}>
              Email invitation with login link, username, and password (requires email address)
            </label>
          </div>
          <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <button type="submit" disabled={saving || !form.username || !form.password || (form.sendInvite && !form.email)}
              style={btnPrimary(saving)}>
              {saving ? 'Adding…' : (form.sendInvite ? 'Add user & send invite' : 'Add user')}
            </button>
            <button type="button" onClick={cancelAdd} disabled={saving} style={btnSecondary()}>
              Cancel
            </button>
            {error && <span style={{ color: '#ef4444', fontSize: 14 }}>{error}</span>}
          </div>
        </form>
      )}

      {/* User list */}
      {loading && <div style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && users.length === 0 && <div style={{ color: 'var(--text-muted)' }}>No users yet.</div>}

      {!loading && users.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {users.map(u => (
            <div key={u.id} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 16,
            }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {(() => {
                      const last = u.lastSeenAt ? new Date(u.lastSeenAt).getTime() : 0
                      const online = !!last && (Date.now() - last) < 90000
                      return (
                        <span title={online ? 'Online' : (last ? 'Last seen ' + new Date(last).toLocaleString() : 'Never signed in')}
                          style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 999,
                                   background: online ? '#10b981' : '#6b7280',
                                   boxShadow: online ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
                                   flexShrink: 0 }} />
                      )
                    })()}
                    {u.displayName || u.username}
                    {me?.id === u.id && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>(you)</span>}
                  </div>
                  <div style={{ fontSize: 14, color: 'var(--text-muted)' }}>
                    {u.username} · {u.role} · {LOCATIONS.find(l => l.id === u.location)?.label || u.location}
                    {u.email && ` · ${u.email}`}
                    {u.suspended && (
                      <span style={{ marginLeft: 8, padding: '2px 8px', background: 'rgba(245,158,11,0.15)', color: '#f59e0b', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
                        SUSPENDED
                      </span>
                    )}
                  </div>
                  {u.lastLoginAt && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      Last sign-in: {new Date(u.lastLoginAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => setShareFor(shareFor === u.id ? null : u.id)} style={btnSecondary()}>
                    {shareFor === u.id ? 'Hide link' : 'Share link'}
                  </button>
                  <button onClick={() => setEditing({ ...u, password: '' })} style={btnSecondary()}>
                    Edit
                  </button>
                  {me?.id !== u.id && (
                    <>
                      <button onClick={() => bootUser(u.id, u.displayName || u.username)} style={btnSecondary()} title="Force-logout — they go back to login. Account stays.">
                        🚪 Boot
                      </button>
                      <button onClick={() => toggleSuspend(u)} style={u.suspended ? btnPrimary() : btnSecondary()} title={u.suspended ? 'Allow this user to sign in again.' : 'Block this user from signing in (account preserved).'}>
                        {u.suspended ? '♻ Reactivate' : '🛑 Suspend'}
                      </button>
                      <button onClick={() => removeUser(u.id, u.username)} style={btnDanger()}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>

              {shareFor === u.id && (
                <ShareLinkPanel user={u} info={shareLinkFor(u)} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24,
        }}>
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={saveEdit}
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: 24,
              width: '100%',
              maxWidth: 480,
              display: 'grid',
              gap: 12,
            }}
          >
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>
              Edit user: {editing.username}
            </div>
            <Field label="Display name" value={editing.displayName || ''} onChange={v => setEditing({...editing, displayName: v})} />
            <Field label="Email" type="email" value={editing.email || ''} onChange={v => setEditing({...editing, email: v})} />
            <Field label="New password (leave blank to keep current)" type="password" value={editing.password || ''} onChange={v => setEditing({...editing, password: v})} />
            <Select label="Role" value={editing.role} onChange={v => setEditing({...editing, role: v})} options={me?.role === 'owner' ? ROLES : ROLES.filter(r => r.id !== 'owner')} />
            <Select label="Location" value={editing.location} onChange={v => setEditing({...editing, location: v})} options={LOCATIONS} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <button type="button" onClick={() => setEditing(null)} style={btnSecondary()}>Cancel</button>
              <button type="submit" style={btnPrimary()}>Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}

function ShareLinkPanel({ user, info }) {
  if (!info) return null
  const copy = (s) => { navigator.clipboard.writeText(s).then(() => {}, () => {}) }
  const wantsPublic = !user.location || user.location === 'public' || user.location === 'both'
  return (
    <div style={{ marginTop: 12, padding: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8 }}>
        Send {user.displayName || user.username} the right link. They sign in with their username and password once on each device.
      </div>

      {info.public && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
            🌍 Anywhere (recommended for remote users — no install needed)
          </div>
          <LinkRow url={info.public.url} onCopy={copy} />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            Public CRM at openocti.local. Auth-protected for anyone with valid credentials.
          </div>
        </div>
      )}

      {info.lanAll.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>📡 Office (same Wi-Fi)</div>
          {info.lanAll.map(x => (
            <LinkRow key={x.url} url={x.url} label={x.label} onCopy={copy} />
          ))}
        </div>
      )}

      {info.tailscale && (
        <details style={{ marginBottom: 4 }}>
          <summary style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', marginBottom: 4 }}>
            🔒 Tailscale (advanced — recipient must install Tailscale and be invited to your tailnet)
          </summary>
          <div style={{ marginTop: 6 }}>
            <LinkRow url={info.tailscale.url} label={info.tailscale.hostname} onCopy={copy} />
          </div>
        </details>
      )}

      {wantsPublic && !info.public && (
        <div style={{ fontSize: 13, color: '#f59e0b', padding: 8, background: 'rgba(245,158,11,0.1)', borderRadius: 6 }}>
          No public CRM URL detected. Check PUBLIC_APP_URL or the public DNS/tunnel configuration.
        </div>
      )}
    </div>
  )
}

function LinkRow({ url, label, onCopy }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
      <code style={{
        flex: 1,
        padding: '8px 10px',
        background: 'var(--bg, #000)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        fontSize: 13,
        color: 'var(--text)',
        overflow: 'auto',
        whiteSpace: 'nowrap',
      }}>{url}</code>
      <button onClick={() => onCopy(url)} style={btnSecondary({ padding: '8px 12px', minHeight: 36, fontSize: 13 })}>Copy</button>
      {label && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</span>}
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', required, minLength }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}{required && ' *'}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        style={{
          width: '100%',
          padding: '10px 12px',
          minHeight: 44,
          fontSize: 15,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

function Select({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-muted)', marginBottom: 4 }}>
        {label}
      </label>
      <ThemedSelect
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%',
          padding: '10px 12px',
          minHeight: 44,
          fontSize: 15,
          border: '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--surface)',
          color: 'var(--text)',
          boxSizing: 'border-box',
        }}
      >
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </ThemedSelect>
    </div>
  )
}

function btnPrimary(busy = false, extra = {}) {
  return {
    padding: '12px 18px',
    minHeight: 48,
    fontSize: 15,
    fontWeight: 600,
    background: busy ? 'var(--surface2)' : 'var(--accent, #3b82f6)',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    cursor: busy ? 'wait' : 'pointer',
    ...extra,
  }
}
function btnSecondary(extra = {}) {
  return {
    padding: '10px 16px',
    minHeight: 44,
    fontSize: 14,
    fontWeight: 500,
    background: 'var(--surface2)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    cursor: 'pointer',
    ...extra,
  }
}
function btnDanger(extra = {}) {
  return {
    padding: '10px 16px',
    minHeight: 44,
    fontSize: 14,
    fontWeight: 500,
    background: 'rgba(239,68,68,0.1)',
    color: '#ef4444',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: 8,
    cursor: 'pointer',
    ...extra,
  }
}
