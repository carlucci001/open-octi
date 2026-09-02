'use client'
import { useState, useEffect, useRef } from 'react'

export default function VoiceSettings() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [agentName, setAgentName] = useState('Matilda')
  const [currentVoice, setCurrentVoice] = useState(null)
  const [voices, setVoices] = useState([])
  const [pickedId, setPickedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)
  const [filter, setFilter] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

  const load = async () => {
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/voice/config').then(r => r.json())
      if (r.error) { setError(r.error); return }
      setAgentName(r.agentName)
      setCurrentVoice(r.currentVoice)
      setVoices(r.voices || [])
      setPickedId(r.currentVoice?.voice_id || null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const preview = (v) => {
    if (!v.preview_url) return
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null }
    if (playingId === v.voice_id) { setPlayingId(null); return }
    const a = new Audio(v.preview_url)
    audioRef.current = a
    setPlayingId(v.voice_id)
    a.onended = () => setPlayingId(null)
    a.onerror = () => setPlayingId(null)
    a.play().catch(() => setPlayingId(null))
  }

  const save = async () => {
    if (!pickedId) return
    const picked = voices.find(v => v.voice_id === pickedId)
    setSaving(true); setSaveMsg(null)
    try {
      const r = await fetch('/api/voice/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voiceId: pickedId, voiceName: picked?.name }),
      }).then(r => r.json())
      if (r.error) { setSaveMsg({ ok: false, text: r.error }); return }
      setSaveMsg({ ok: true, text: `Saved — ${agentName} now uses ${picked?.name}.` })
      setCurrentVoice(picked ? { voice_id: picked.voice_id, name: picked.name, preview_url: picked.preview_url, labels: picked.labels } : null)
    } catch (e) {
      setSaveMsg({ ok: false, text: e.message })
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ color: 'var(--text-muted)', padding: 24 }}>Loading voices…</div>
  if (error) return <div style={{ color: '#dc2626', padding: 16, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>{error}</div>

  const q = filter.trim().toLowerCase()
  const filtered = q
    ? voices.filter(v => v.name.toLowerCase().includes(q) || Object.values(v.labels || {}).some(l => String(l).toLowerCase().includes(q)))
    : voices
  const dirty = pickedId && pickedId !== currentVoice?.voice_id

  return (
    <div>
      <div className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 20, marginBottom: 20 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
          Current Voice · {agentName}
        </div>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)' }}>{currentVoice?.name || 'None set'}</div>
            {currentVoice?.labels && (
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                {Object.entries(currentVoice.labels).map(([k, v]) => `${k}: ${v}`).join(' · ')}
              </div>
            )}
          </div>
          {currentVoice?.preview_url && (
            <button
              onClick={() => preview(currentVoice)}
              style={{
                padding: '12px 20px', minHeight: 48, fontSize: 15, fontWeight: 500,
                background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
                borderRadius: 10, cursor: 'pointer',
              }}
            >
              {playingId === currentVoice.voice_id ? '⏸ Stop' : '▶ Preview'}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap" style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Filter voices by name or label…"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '12px 16px', minHeight: 48, fontSize: 15, flex: 1, minWidth: 240,
            background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 10, outline: 'none',
          }}
        />
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            padding: '12px 24px', minHeight: 48, fontSize: 15, fontWeight: 600,
            background: dirty && !saving ? 'var(--accent)' : 'var(--surface2)',
            color: dirty && !saving ? 'var(--accent-text)' : 'var(--text-muted)',
            border: '1px solid var(--border)', borderRadius: 10,
            cursor: dirty && !saving ? 'pointer' : 'not-allowed',
          }}
        >
          {saving ? 'Saving…' : dirty ? 'Save Voice' : 'Saved'}
        </button>
      </div>

      {saveMsg && (
        <div style={{
          padding: 14, marginBottom: 16, borderRadius: 10, fontSize: 14,
          background: saveMsg.ok ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)',
          border: `1px solid ${saveMsg.ok ? '#16a34a' : '#dc2626'}`,
          color: saveMsg.ok ? '#16a34a' : '#dc2626',
        }}>
          {saveMsg.text}
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        {filtered.map(v => {
          const selected = pickedId === v.voice_id
          return (
            <div
              key={v.voice_id}
              onClick={() => setPickedId(v.voice_id)}
              className="rounded-xl cursor-pointer transition"
              style={{
                padding: 16,
                background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                border: `2px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                minHeight: 120,
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{v.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {Object.entries(v.labels || {}).slice(0, 3).map(([k, val]) => `${val}`).join(' · ') || v.category}
                  </div>
                </div>
                {selected && (
                  <span style={{ color: 'var(--accent)', fontSize: 20, lineHeight: 1 }}>✓</span>
                )}
              </div>
              {v.preview_url && (
                <button
                  onClick={(e) => { e.stopPropagation(); preview(v) }}
                  style={{
                    marginTop: 12, padding: '10px 16px', minHeight: 44, fontSize: 14, fontWeight: 500,
                    background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
                    borderRadius: 8, cursor: 'pointer', width: '100%',
                  }}
                >
                  {playingId === v.voice_id ? '⏸ Stop preview' : '▶ Play preview'}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
