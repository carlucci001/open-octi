'use client'

export default function FrontEndPage() {
  return (
    <main style={{ minHeight: '100vh', margin: 0, background: '#faf7f0' }}>
      <iframe
        src="/cc-front/OpenOcti.html"
        title="Front-end workspace"
        style={{
          display: 'block',
          width: '100%',
          minHeight: '100vh',
          border: 0,
          background: '#faf7f0',
        }}
      />
    </main>
  )
}
