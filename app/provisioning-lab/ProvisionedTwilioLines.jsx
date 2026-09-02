'use client'

import { useMemo } from 'react'

function fmtPhone(value = '') {
  const digits = String(value).replace(/\D/g, '').slice(-10)
  if (digits.length !== 10) return value || 'No number'
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

export default function ProvisionedTwilioLines({ lines = [] }) {
  const owners = useMemo(() => {
    const grouped = new Map()
    for (const line of lines) {
      const key = line.tenantId || line.company
      if (!grouped.has(key)) grouped.set(key, { id: key, company: line.company || key, lines: [] })
      grouped.get(key).lines.push(line)
    }
    return [...grouped.values()]
  }, [lines])

  return (
    <section className="rounded-lg p-3 mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Provisioned Twilio lines</h2>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Verified local assignments already owned by the business.</p>
        </div>
        <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>{lines.length} active</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        {owners.map(owner => (
          <article key={owner.id} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{owner.company}</h3>
            <div className="mt-2 space-y-2">
              {owner.lines.map(line => (
                <div key={line.id}>
                  <div className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>{fmtPhone(line.phoneNumber)}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{line.agent || 'Assigned line'} · Twilio live</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
