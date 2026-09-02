import { buildPublicStatusSnapshot } from '@/lib/incidents'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Command Center Service Status' }

function statusColor(status) {
  if (status === 'ok') return '#15803d'
  if (status === 'degraded') return '#b45309'
  if (status === 'down') return '#b91c1c'
  return '#475569'
}

export default function PublicStatusPage() {
  const snapshot = buildPublicStatusSnapshot()
  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '48px 24px', fontFamily: 'system-ui, sans-serif', color: '#172033', lineHeight: 1.5 }}>
      <h1 style={{ marginBottom: 8 }}>Command Center Service Status</h1>
      <p style={{ color: '#64748b', marginTop: 0 }}>Current reported health for managed platforms. Only incident notes explicitly published by Carl appear here.</p>
      <section aria-labelledby="platform-health" style={{ marginTop: 32 }}>
        <h2 id="platform-health">Platform health</h2>
        {snapshot.platforms.length ? <ul style={{ listStyle: 'none', padding: 0 }}>{snapshot.platforms.map(platform => <li key={platform.platformId} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '12px 0', borderBottom: '1px solid #e2e8f0' }}><span>{platform.name}</span><strong style={{ color: statusColor(platform.status) }}>{platform.status}</strong></li>)}</ul> : <p>No platform health report is available yet.</p>}
      </section>
      <section aria-labelledby="public-incidents" style={{ marginTop: 32 }}>
        <h2 id="public-incidents">Open notices</h2>
        {snapshot.incidents.length ? <ul>{snapshot.incidents.map(incident => <li key={incident.id} style={{ marginBottom: 12 }}><strong>{incident.title}</strong><br /><span style={{ color: '#64748b' }}>Last updated {new Date(incident.lastSeen).toLocaleString()}</span></li>)}</ul> : <p>No public incidents are open.</p>}
      </section>
      <p style={{ color: '#64748b', fontSize: 14, marginTop: 40 }}>Last checked: {snapshot.generatedAt ? new Date(snapshot.generatedAt).toLocaleString() : 'not yet available'}</p>
    </main>
  )
}
