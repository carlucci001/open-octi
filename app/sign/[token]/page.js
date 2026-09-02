'use client'

import { useEffect, useMemo, useState } from 'react'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

function renderDoc(body) {
  return marked.parse(body || '')
}

export default function SignaturePage({ params }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [document, setDocument] = useState(null)
  const [signerName, setSignerName] = useState('')
  const [signerEmail, setSignerEmail] = useState('')
  const [signatureText, setSignatureText] = useState('')
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/signatures/${encodeURIComponent(params.token)}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j.ok) throw new Error(j.error || 'Unable to load signing request')
        setDocument(j.document)
        setSignerName(j.document.signature?.signerName || '')
        setSignerEmail(j.document.signature?.signerEmail || '')
        setSignatureText(j.document.signature?.signerName || '')
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [params.token])

  const canSign = useMemo(() => {
    return consent && signerName.trim() && signatureText.trim() && !busy && document?.signature?.status === 'pending'
  }, [consent, signerName, signatureText, busy, document])

  const submit = async () => {
    if (!canSign) return
    setBusy(true)
    setError('')
    try {
      const r = await fetch(`/api/signatures/${encodeURIComponent(params.token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signerName, signerEmail, signatureText, consent }),
      }).then(r => r.json())
      if (!r.ok) throw new Error(r.error || 'Signature failed')
      setDocument(r.document)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f4f6f8', color: '#111827', padding: '32px 16px', fontFamily: '-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 13, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Farrington Development</div>
          <h1 style={{ margin: '6px 0 4px', fontSize: 32, lineHeight: 1.1 }}>{document?.title || 'Electronic Signature'}</h1>
          {document?.clientName && <div style={{ color: '#64748b', fontSize: 15 }}>{document.clientName}</div>}
        </header>

        {loading && <section style={panel}>Loading signing request...</section>}
        {error && <section style={{ ...panel, borderColor: '#ef4444', color: '#991b1b' }}>{error}</section>}

        {document && (
          <>
            {document.signature?.status === 'signed' && (
              <section style={{ ...panel, borderColor: '#16a34a', background: '#f0fdf4' }}>
                <strong>Signed.</strong>
                <div style={{ marginTop: 6, color: '#166534', fontSize: 14 }}>
                  Signed at {new Date(document.signature.signedAt).toLocaleString()}.
                  Audit id: {document.signature.eventId}
                </div>
              </section>
            )}

            <section style={{ ...panel, background: '#fff' }}>
              <div
                style={{ fontSize: 15, lineHeight: 1.6 }}
                dangerouslySetInnerHTML={{ __html: renderDoc(document.body) }}
              />
            </section>

            {document.signature?.status === 'pending' && (
              <section style={panel}>
                <h2 style={{ margin: '0 0 12px', fontSize: 22 }}>Electronic Signature</h2>
                <p style={{ margin: '0 0 16px', color: '#475569', lineHeight: 1.5 }}>
                  By signing, you agree to use electronic records and signatures for this document. You can download or print the signed record after completion.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                  <label style={label}>Signer name
                    <input style={input} value={signerName} onChange={e => { setSignerName(e.target.value); if (!signatureText) setSignatureText(e.target.value) }} />
                  </label>
                  <label style={label}>Signer email
                    <input style={input} value={signerEmail} onChange={e => setSignerEmail(e.target.value)} />
                  </label>
                </div>
                <label style={{ ...label, marginTop: 12 }}>Typed signature
                  <input style={{ ...input, fontSize: 24, fontFamily: 'Georgia,serif' }} value={signatureText} onChange={e => setSignatureText(e.target.value)} />
                </label>
                <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', margin: '14px 0', fontSize: 14, color: '#334155' }}>
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 2, width: 18, height: 18 }} />
                  <span>I consent to sign electronically, and I intend my typed signature to bind me to this document.</span>
                </label>
                <button onClick={submit} disabled={!canSign} style={{
                  width: '100%',
                  minHeight: 48,
                  border: 0,
                  borderRadius: 8,
                  background: canSign ? '#2563eb' : '#cbd5e1',
                  color: '#fff',
                  fontWeight: 800,
                  fontSize: 16,
                  cursor: canSign ? 'pointer' : 'not-allowed',
                }}>{busy ? 'Signing...' : 'Sign Document'}</button>
                <div style={{ marginTop: 12, fontSize: 12, color: '#64748b' }}>
                  Document SHA-256: <span style={{ fontFamily: 'ui-monospace,monospace' }}>{document.signature.documentHash}</span>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}

const panel = {
  background: '#ffffff',
  border: '1px solid #d9e1ea',
  borderRadius: 10,
  padding: 22,
  marginBottom: 16,
  boxShadow: '0 12px 30px rgba(15,23,42,0.06)',
}

const label = {
  display: 'block',
  fontSize: 13,
  fontWeight: 700,
  color: '#334155',
}

const input = {
  display: 'block',
  width: '100%',
  boxSizing: 'border-box',
  marginTop: 6,
  border: '1px solid #cbd5e1',
  borderRadius: 8,
  minHeight: 44,
  padding: '10px 12px',
  fontSize: 15,
}
