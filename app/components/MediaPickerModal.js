'use client'
import { useEffect, useMemo, useState } from 'react'
import { Check, Image as ImageIcon, Search, X } from 'lucide-react'
import ThemedSelect from './ThemedSelect'

// Reusable "pick from my Media library" modal. Lists /api/media (images by
// default), lets the operator filter by folder / search, click one, confirm.
// onSelect(item) receives the full media item ({ id, url, title, file, ... }).
export default function MediaPickerModal({ open, onClose, onSelect, title = 'Choose from Media', mediaType = 'image', busy = false }) {
  const [items, setItems] = useState([])
  const [folders, setFolders] = useState([])
  const [folder, setFolder] = useState('')
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [picked, setPicked] = useState(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true); setError(''); setPicked(null)
    const params = new URLSearchParams()
    if (folder) params.set('folder', folder)
    if (q.trim()) params.set('q', q.trim())
    fetch(`/api/media?${params.toString()}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return
        if (!j.ok) throw new Error(j.error || 'Could not load media')
        setItems(j.items || [])
        setFolders(j.folders || [])
      })
      .catch(e => { if (!cancelled) setError(e.message || 'Could not load media') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, folder, q])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const visible = useMemo(() => {
    if (!mediaType) return items
    return items.filter(i => (i.mediaType || (String(i.mimeType || '').startsWith('video/') ? 'video' : 'image')) === mediaType)
  }, [items, mediaType])

  if (!open) return null

  const field = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none' }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.55)', display: 'grid', placeItems: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: 'min(960px, 100%)', maxHeight: 'min(84vh, 900px)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: '0 24px 64px rgba(0,0,0,0.35)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <ImageIcon size={18} color="var(--accent)" />
          <strong style={{ color: 'var(--text)', fontSize: 16, flex: 1 }}>{title}</strong>
          <button type="button" onClick={onClose} aria-label="Close" style={{ ...field, padding: 6, cursor: 'pointer', display: 'grid', placeItems: 'center' }}><X size={16} /></button>
        </div>

        <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--text-muted)' }} />
            <input style={{ ...field, width: '100%', paddingLeft: 30 }} placeholder="Search title, file, client, campaign..." value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <ThemedSelect style={{ ...field, minWidth: 180 }} value={folder} onChange={e => setFolder(e.target.value)}>
            <option value="">All folders</option>
            {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </ThemedSelect>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          {loading ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>Loading your media...</div>
          ) : error ? (
            <div style={{ color: 'var(--red)', textAlign: 'center', padding: 40 }}>{error}</div>
          ) : visible.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 40 }}>No {mediaType || 'media'} files here yet. Upload some in Media first.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
              {visible.map(item => {
                const active = picked?.id === item.id
                return (
                  <button key={item.id} type="button" onClick={() => setPicked(item)} onDoubleClick={() => onSelect?.(item)}
                    title={item.title || item.originalName || item.file}
                    style={{ position: 'relative', padding: 0, border: `2px solid ${active ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 10, overflow: 'hidden', background: 'var(--surface2)', cursor: 'pointer', textAlign: 'left' }}>
                    <div style={{ aspectRatio: '1 / 1', background: 'var(--surface2)' }}>
                      <img src={item.url} alt={item.title || item.file || ''} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                    <div style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || item.originalName || item.file}</div>
                    {active && <span style={{ position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: 11, background: 'var(--accent)', color: 'var(--accent-text)', display: 'grid', placeItems: 'center' }}><Check size={14} /></span>}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{picked ? `Selected: ${picked.title || picked.originalName || picked.file}` : `${visible.length} file${visible.length === 1 ? '' : 's'} · click to select, double-click to use`}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={onClose} style={{ ...field, cursor: 'pointer' }}>Cancel</button>
            <button type="button" disabled={!picked || busy} onClick={() => picked && onSelect?.(picked)}
              style={{ ...field, background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)', fontWeight: 700, cursor: picked && !busy ? 'pointer' : 'not-allowed', opacity: picked && !busy ? 1 : 0.6 }}>
              {busy ? 'Attaching...' : 'Use this image'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
