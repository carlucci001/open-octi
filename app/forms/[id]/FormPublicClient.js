'use client'

import { useState } from 'react'

export default function FormPublicClient({ form, embedded = false }) {
  const [values, setValues] = useState({})
  const [status, setStatus] = useState({ kind: '', msg: '' })
  const fields = Array.isArray(form?.fields) ? form.fields : []

  const update = (key, value) => setValues(v => ({ ...v, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setStatus({ kind: 'busy', msg: 'Submitting...' })
    try {
      const res = await fetch(`/api/forms/${encodeURIComponent(form.id)}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'Submission failed')
      setValues({})
      setStatus({ kind: 'success', msg: 'Submitted successfully.' })
    } catch (error) {
      setStatus({ kind: 'error', msg: error.message })
    }
  }

  return (
    <main style={{
      minHeight: embedded ? 'auto' : '100vh',
      background: embedded ? 'transparent' : '#f7f4ef',
      padding: embedded ? 0 : 24,
      fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif',
      color: '#181614',
    }}>
      <section style={{
        maxWidth: 720,
        margin: '0 auto',
        background: '#fff',
        border: '1px solid #ded6cb',
        borderRadius: 8,
        padding: 24,
        boxShadow: embedded ? 'none' : '0 12px 28px rgba(43,32,26,0.10)',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 24, lineHeight: 1.2 }}>{form.title}</h1>
        {form.description && <p style={{ margin: '0 0 20px', color: '#62584d', fontSize: 14 }}>{form.description}</p>}
        <form onSubmit={submit} style={{ display: 'grid', gap: 14 }}>
          {fields.map(field => (
            <label key={field.id || field.key} style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 700 }}>
              {field.label}{field.required ? ' *' : ''}
              {field.type === 'textarea' ? (
                <textarea required={field.required} value={values[field.key] || ''} onChange={e => update(field.key, e.target.value)} rows={5} style={inputStyle} />
              ) : field.type === 'select' ? (
                <select required={field.required} value={values[field.key] || ''} onChange={e => update(field.key, e.target.value)} style={inputStyle}>
                  <option value="">Select...</option>
                  {String(field.options || '').split(/\r?\n/).filter(Boolean).map(option => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : field.type === 'checkbox' ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 42 }}>
                  <input type="checkbox" checked={!!values[field.key]} onChange={e => update(field.key, e.target.checked)} />
                  <span style={{ color: '#62584d', fontWeight: 500 }}>Yes</span>
                </span>
              ) : (
                <input required={field.required} type={field.type === 'phone' ? 'tel' : field.type} value={values[field.key] || ''} onChange={e => update(field.key, e.target.value)} style={inputStyle} />
              )}
            </label>
          ))}
          {status.msg && (
            <div style={{
              borderRadius: 6,
              padding: 10,
              background: status.kind === 'error' ? '#fee2e2' : '#dcfce7',
              color: status.kind === 'error' ? '#991b1b' : '#166534',
              fontSize: 13,
              fontWeight: 700,
            }}>{status.msg}</div>
          )}
          <button type="submit" disabled={status.kind === 'busy'} style={{
            minHeight: 44,
            border: 0,
            borderRadius: 6,
            background: '#1f6f5b',
            color: '#fff',
            fontWeight: 800,
            cursor: 'pointer',
            opacity: status.kind === 'busy' ? 0.7 : 1,
          }}>Submit</button>
        </form>
      </section>
    </main>
  )
}

const inputStyle = {
  width: '100%',
  minHeight: 42,
  border: '1px solid #cfc5b9',
  borderRadius: 6,
  padding: '10px 12px',
  font: 'inherit',
  color: '#181614',
  background: '#fff',
}
