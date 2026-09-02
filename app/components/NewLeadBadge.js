'use client'
// Minimal inline NEW badge. Renders for any lead whose status indicates "new".
// Kept dead simple so React/Next.js HMR can't strip it.
export default function NewLeadBadge({ lead }) {
  const status = lead?.st || lead?.status
  if (status !== 'new' && status !== 'prospect') return null
  return (
    <span
      data-fcc-new-badge="1"
      style={{
        display: 'inline-block',
        background: '#dc2626',
        color: 'white',
        fontSize: 12,
        fontWeight: 800,
        letterSpacing: '0.1em',
        padding: '4px 10px',
        borderRadius: 4,
        boxShadow: '0 2px 6px rgba(220,38,38,0.5)',
        marginRight: 6,
        flexShrink: 0,
        lineHeight: 1.1,
      }}
    >
      NEW
    </span>
  )
}
