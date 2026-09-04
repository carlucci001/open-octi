'use client'

function display(value) {
  if (Array.isArray(value)) return value.join(', ')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value ?? '')
}

export default function CustomFieldsPanel({ fields, compact = false }) {
  const entries = Object.entries(fields || {}).filter(([, value]) => value !== '' && value !== null && value !== undefined)
  if (!entries.length) return null
  return <section className={`rounded-lg ${compact ? 'p-3' : 'p-4'} my-3`} style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
    <h3 className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Imported custom fields</h3>
    <dl className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
      {entries.map(([key, value]) => <div key={key} className="min-w-0"><dt className="text-[10px] uppercase truncate" title={key} style={{ color: 'var(--text-muted)' }}>{key}</dt><dd className="text-sm break-words" style={{ color: 'var(--text)' }}>{display(value)}</dd></div>)}
    </dl>
  </section>
}
