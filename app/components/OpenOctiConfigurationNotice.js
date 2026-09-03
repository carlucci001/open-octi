'use client'

import Link from 'next/link'
import { settingsLinksForNeeds } from '@/lib/openocti-settings-links'

export function OpenOctiConfigurationLinks({ needs = [], prefix = 'Configure' }) {
  const links = settingsLinksForNeeds(needs)
  if (!links.length) return null
  return (
    <span>
      {prefix}{' '}
      {links.map((link, index) => (
        <span key={link.need}>
          {index > 0 ? ', ' : ''}
          <Link href={link.href} style={{ color: '#30c0f0', fontWeight: 700, textDecoration: 'underline' }}>{link.need}</Link>
        </span>
      ))}
    </span>
  )
}

export default function OpenOctiConfigurationNotice({ needs = [], title = 'Not configured', children }) {
  return (
    <div role="status" className="rounded-xl p-4" style={{ color: 'var(--text)', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.38)' }}>
      <div className="font-semibold">{title}</div>
      {children && <div className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{children}</div>}
      <div className="mt-2 text-sm"><OpenOctiConfigurationLinks needs={needs} prefix="Open settings for" /></div>
    </div>
  )
}
