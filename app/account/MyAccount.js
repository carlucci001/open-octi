'use client'
import { useEffect, useState } from 'react'
import PageHeader from '../components/PageHeader'

function initials(user) {
  const text = user?.displayName || user?.username || 'User'
  return text.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

export default function MyAccount({ onSaved }) {
  const [user, setUser] = useState(null)
  const [form, setForm] = useState({ displayName: '', email: '', avatarUrl: '', currentPassword: '', newPassword: '', confirmPassword: '' })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/account', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error || 'Could not load account')
        setUser(j.user)
        setForm(f => ({ ...f, displayName: j.user.displayName || '', email: j.user.email || '', avatarUrl: j.user.avatarUrl || '' }))
      })
      .catch(e => setError(e.message))
  }, [])

  const setField = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const chooseAvatar = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const size = 512
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d')
        // JPEG on white, not PNG: a 512px PNG avatar lands around 600KB, the
        // same photo as JPEG is ~35KB. Nothing here needs transparency.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, size, size)
        const scale = Math.min(size / img.width, size / img.height)
        const width = Math.round(img.width * scale)
        const height = Math.round(img.height * scale)
        const x = Math.round((size - width) / 2)
        const y = Math.round((size - height) / 2)
        ctx.drawImage(img, x, y, width, height)
        setField('avatarUrl', canvas.toDataURL('image/jpeg', 0.85))
      }
      img.onerror = () => setField('avatarUrl', String(reader.result || ''))
      img.src = String(reader.result || '')
    }
    reader.readAsDataURL(file)
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      setError('New password and confirmation must match.')
      return
    }
    setSaving(true)
    try {
      const body = {
        displayName: form.displayName,
        email: form.email,
        avatarUrl: form.avatarUrl,
      }
      if (form.newPassword) {
        body.currentPassword = form.currentPassword
        body.newPassword = form.newPassword
      }
      const r = await fetch('/api/account', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'Save failed')
      setUser(j.user)
      setForm(f => ({ ...f, currentPassword: '', newPassword: '', confirmPassword: '' }))
      setMessage('Account updated.')
      onSaved?.(j.user)
      window.dispatchEvent(new CustomEvent('fcc:account-updated', { detail: j.user }))
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<span aria-hidden="true">ME</span>}
        title="My Account"
        subtitle="Update your profile photo, account details, and password."
      />

      <form onSubmit={save} style={{ maxWidth: 760, display: 'grid', gap: 16 }}>
        <section style={panelStyle}>
          <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={avatarStyle}>
              {form.avatarUrl ? <img src={form.avatarUrl} alt="" style={avatarImageStyle} /> : initials(user)}
            </div>
            <div style={{ flex: '1 1 260px' }}>
              <label style={labelStyle}>Avatar</label>
              <input type="file" accept="image/*" onChange={e => chooseAvatar(e.target.files?.[0])} style={inputStyle} />
              <input value={form.avatarUrl} onChange={e => setField('avatarUrl', e.target.value)} placeholder="Or paste an image URL" style={{ ...inputStyle, marginTop: 8 }} />
              {form.avatarUrl && <button type="button" onClick={() => setField('avatarUrl', '')} style={{ ...buttonStyle, marginTop: 8 }}>Remove avatar</button>}
            </div>
          </div>
        </section>

        <section style={panelStyle}>
          <div style={gridStyle}>
            <Field label="Display name" value={form.displayName} onChange={v => setField('displayName', v)} />
            <Field label="Email" type="email" value={form.email} onChange={v => setField('email', v)} />
          </div>
        </section>

        <section style={panelStyle}>
          <h2 style={sectionTitle}>Change password</h2>
          <div style={gridStyle}>
            <Field label="Current password" type="password" value={form.currentPassword} onChange={v => setField('currentPassword', v)} />
            <Field label="New password" type="password" value={form.newPassword} onChange={v => setField('newPassword', v)} minLength={6} />
            <Field label="Confirm new password" type="password" value={form.confirmPassword} onChange={v => setField('confirmPassword', v)} minLength={6} />
          </div>
        </section>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="submit" disabled={saving} style={primaryStyle(saving)}>{saving ? 'Saving...' : 'Save account'}</button>
          {message && <span style={{ color: 'var(--green)', fontSize: 14 }}>{message}</span>}
          {error && <span style={{ color: 'var(--red)', fontSize: 14 }}>{error}</span>}
        </div>
      </form>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', minLength }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <input type={type} value={value} minLength={minLength} onChange={e => onChange(e.target.value)} style={inputStyle} />
    </label>
  )
}

const panelStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }
const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }
const inputStyle = { width: '100%', minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', outline: 'none' }
const buttonStyle = { minHeight: 38, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', padding: '8px 12px', cursor: 'pointer' }
const primaryStyle = disabled => ({ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)', cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.7 : 1 })
const avatarStyle = { width: 112, height: 112, borderRadius: 12, overflow: 'hidden', background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 24, boxShadow: 'none', filter: 'none' }
const avatarImageStyle = { width: '100%', height: '100%', objectFit: 'contain', display: 'block', background: 'var(--surface)', boxShadow: 'none', filter: 'none', maskImage: 'none', WebkitMaskImage: 'none' }
const sectionTitle = { margin: '0 0 12px', color: 'var(--text)', fontSize: 16, fontWeight: 700 }
