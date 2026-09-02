'use client'

export default function OpenOctiUnavailable({ name = 'This capability' }) {
  return (
    <section role="status" style={{ margin: 24, padding: 20, border: '1px solid var(--border)', borderRadius: 12 }}>
      <h2 style={{ marginTop: 0 }}>{name} is not included in OpenOcti</h2>
      <p style={{ marginBottom: 0 }}>This surface is available in Octi CC.</p>
    </section>
  )
}
