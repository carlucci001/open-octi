'use client'
import { useState, useEffect, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import { Activity, Hash, RefreshCw, Send } from 'lucide-react'

// Filter pills for the rolling timeline. "All" shows posts + activities mixed by time.
const FILTERS = [
  { id: 'all',        label: 'Everything',  match: () => true },
  { id: 'posts',      label: 'Team posts',  match: (it) => it.kind === 'post' },
  { id: 'activity',   label: 'Activity',    match: (it) => it.kind === 'activity' },
  { id: 'mine',       label: 'Mine',        match: (it, meId) => it.kind === 'post' && it.authorId === meId },
]

function activityDocumentId(activity = {}) {
  return activity.linkedTo?.documentId || activity.meta?.documentId || ''
}

function isTranscriptActivity(activity = {}) {
  return activity.type === 'transcript' || activity.source === 'maggie-live-transcription' || /transcription|transcript/i.test(activity.subject || '')
}

export default function Feed({ onNavigate }) {
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [activities, setActivities] = useState([])
  const [posts, setPosts] = useState([])
  const [filter, setFilter] = useState('all')
  // Legacy hidden markup remains below for compatibility; messaging now lives in Communications.
  const inbox = []
  const activeUserId = null
  const thread = []
  const dmDraft = ''
  const setActiveUserId = () => {}
  const setDmDraft = () => {}

  // Composer state
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState([])  // attachments queued for upload
  const [uploading, setUploading] = useState(0)
  const [posting, setPosting] = useState(false)
  const fileInputRef = useRef(null)

  // Voice recording
  const [recording, setRecording] = useState(false)
  const recorderRef = useRef(null)
  const recordingChunksRef = useRef([])

  const openActivityDocument = (activity) => {
    const documentId = activityDocumentId(activity)
    if (!documentId) return
    onNavigate?.('documents')
    setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:open-document', {
      detail: { documentId, view: isTranscriptActivity(activity) ? 'transcripts' : 'documents' },
    })), 250)
  }

  // ---------- POLLERS ----------
  useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const [rMe, rUsers, rActs, rPosts] = await Promise.all([
          fetch('/api/auth/me').then(r => r.json()).catch(() => ({})),
          fetch('/api/users/online').then(r => r.json()).catch(() => ({})),
          fetch('/api/activities?limit=50').then(r => r.json()).catch(() => ({})),
          fetch('/api/feed/posts?limit=80').then(r => r.json()).catch(() => ({})),
        ])
        if (stop) return
        setMe(rMe.user || null)
        setUsers(rUsers.users || [])
        setActivities(Array.isArray(rActs.activities) ? rActs.activities : (rActs.items || []))
        setPosts(rPosts.posts || [])
      } catch {}
    }
    tick()
    const t = setInterval(tick, 5000)
    return () => { stop = true; clearInterval(t) }
  }, [])

  // ---------- COMPOSER ----------
  const uploadFile = async (file) => {
    setUploading(n => n + 1)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await fetch('/api/feed/upload', { method: 'POST', body: fd })
      const j = await r.json()
      if (!j.ok) { alert(j.error || 'upload failed'); return null }
      return j.attachment
    } finally {
      setUploading(n => n - 1)
    }
  }

  const onFilesPicked = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''  // allow re-picking the same file
    for (const f of files) {
      const att = await uploadFile(f)
      if (att) setPending(p => [...p, att])
    }
  }

  const removePending = (i) => setPending(p => p.filter((_, j) => j !== i))

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      recordingChunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) recordingChunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const file = new File([blob], 'voice-' + Date.now() + '.webm', { type: blob.type })
        const att = await uploadFile(file)
        if (att) setPending(p => [...p, att])
      }
      recorderRef.current = recorder
      recorder.start()
      setRecording(true)
    } catch (e) {
      alert('Could not start recording: ' + e.message)
    }
  }
  const stopRecording = () => {
    try { recorderRef.current?.stop() } catch {}
    setRecording(false)
  }

  const editPost = async (id, newBody) => {
    const text = (newBody || '').trim()
    if (!text) return false
    const r = await fetch('/api/feed/posts/' + id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'edit failed'); return false }
    setPosts(prev => prev.map(p => p.id === id ? { ...p, body: text, editedAt: j.post.editedAt } : p))
    return true
  }

  const deletePost = async (id) => {
    if (!confirm('Delete this post? Any attached files will also be removed.')) return
    const r = await fetch('/api/feed/posts/' + id, { method: 'DELETE' })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'delete failed'); return }
    setPosts(prev => prev.filter(p => p.id !== id))
  }

  const clearFeed = async () => {
    if (!confirm('Clear the ENTIRE feed? This deletes every post and every attached file. Activities (call logs, etc.) are not affected. This cannot be undone.')) return
    const r = await fetch('/api/feed/posts', { method: 'DELETE' })
    const j = await r.json()
    if (!j.ok) { alert(j.error || 'clear failed'); return }
    setPosts([])
  }

  const submitPost = async (e) => {
    e?.preventDefault()
    if (posting) return
    if (!draft.trim() && pending.length === 0) return
    setPosting(true)
    try {
      const r = await fetch('/api/feed/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: draft, attachments: pending }),
      })
      const j = await r.json()
      if (!j.ok) { alert(j.error || 'failed to post'); return }
      setPosts(prev => [j.post, ...prev])
      setDraft('')
      setPending([])
    } finally {
      setPosting(false)
    }
  }

  // ---------- TIMELINE ----------
  // Merge posts + activities into a single rolling timeline, sorted by time desc.
  const timeline = [
    ...posts.map(p => ({ kind: 'post', id: 'p_' + p.id, at: p.at, post: p, authorId: p.authorId })),
    ...activities.map(a => ({ kind: 'activity', id: 'a_' + a.id, at: a.at, activity: a })),
  ]
    .filter(it => (FILTERS.find(f => f.id === filter) || FILTERS[0]).match(it, me?.id))
    .sort((a, b) => (b.at || '').localeCompare(a.at || ''))

  const onlineCount = users.filter(u => u.online && u.id !== me?.id).length
  const userById = id => users.find(user => user.id === id)
  const sendDm = event => event?.preventDefault()

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<Activity size={22} />}
        title="Feed"
        subtitle="Live rolling stream - team posts and command activity in one place."
        actions={(
          <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
            <span style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: '#10b981' }}>online</span> {onlineCount}
            </span>
          </div>
        )}
      />
      <div style={{ display: 'none' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Feed</h1>
          <div style={{ fontSize: 14, color: 'var(--text-muted)', marginTop: 4 }}>
            Live rolling stream — team posts and CRM activity in one place.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, fontSize: 13 }}>
          <span style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: '#10b981' }}>●</span> {onlineCount} online
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
        {/* LEFT: Composer + Timeline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Composer */}
          <form onSubmit={submitPost} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
            padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
          }}>
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={`What's on your mind, ${me?.displayName?.split(' ')[0] || 'team'}?`}
              rows={3}
              style={{
                width: '100%', padding: '12px 14px', fontSize: 15,
                background: 'var(--surface2)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical',
                fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
            {pending.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {pending.map((a, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 8px',
                    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6,
                    fontSize: 12, color: 'var(--text)',
                  }}>
                    <span>{a.kind === 'image' ? '🖼' : a.kind === 'audio' ? '🎙' : a.kind === 'video' ? '🎬' : '📎'}</span>
                    <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                    <button type="button" onClick={() => removePending(i)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }} aria-label="Remove attachment">×</button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={onFilesPicked} />
              <button type="button" onClick={() => fileInputRef.current?.click()} style={attachBtn()}>
                📎 File
              </button>
              <button type="button" onClick={() => { fileInputRef.current.accept = 'image/*'; fileInputRef.current?.click(); setTimeout(() => fileInputRef.current.accept = '', 200) }} style={attachBtn()}>
                🖼 Photo
              </button>
              {!recording && (
                <button type="button" onClick={startRecording} style={attachBtn()}>
                  🎙 Record voice
                </button>
              )}
              {recording && (
                <button type="button" onClick={stopRecording} style={{ ...attachBtn(), background: '#ef4444', color: '#fff', borderColor: '#ef4444' }}>
                  ⏹ Stop recording
                </button>
              )}
              {uploading > 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Uploading…</span>}
              <div style={{ flex: 1 }} />
              <button type="submit" disabled={posting || (!draft.trim() && pending.length === 0)} style={postBtn(posting)}>
                {posting ? 'Posting…' : 'Post'}
              </button>
            </div>
          </form>

          {/* Filter pills + admin-only Clear */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '8px 14px', minHeight: 40, fontSize: 13, fontWeight: 500,
                background: filter === f.id ? 'var(--accent, #3b82f6)' : 'var(--surface2)',
                color: filter === f.id ? '#fff' : 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 999, cursor: 'pointer',
              }}>{f.label}</button>
            ))}
            {(me?.role === 'owner' || me?.role === 'admin') && (
              <>
                <div style={{ flex: 1 }} />
                <button onClick={clearFeed} title="Delete every post and attached file. Activity entries are not affected." style={{
                  padding: '8px 14px', minHeight: 40, fontSize: 13, fontWeight: 500,
                  background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.3)', borderRadius: 999, cursor: 'pointer',
                }}>🗑 Clear feed</button>
              </>
            )}
          </div>

          {/* Timeline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {timeline.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 14, padding: 20, textAlign: 'center' }}>Nothing in the feed yet. Be the first to post.</div>}
            {timeline.map(it => it.kind === 'post' ? (
              <PostRow key={it.id} post={it.post} me={me} onDelete={deletePost} onEdit={editPost} />
            ) : (
              <ActivityRow key={it.id} a={it.activity} onOpenDocument={openActivityDocument} />
            ))}
          </div>
        </div>

        {/* RIGHT: People + DMs */}
        <div style={{ display: 'none', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0, marginBottom: 12 }}>People</h2>
            {users.filter(u => u.id !== me?.id).length === 0 && (
              <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>No other users yet.</div>
            )}
            {users.filter(u => u.id !== me?.id).map(u => {
              const peer = inbox.find(p => p.peerId === u.id)
              const unread = peer?.unread || 0
              const isActive = activeUserId === u.id
              return (
                <button
                  key={u.id}
                  onClick={() => setActiveUserId(isActive ? null : u.id)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', minHeight: 56,
                    background: isActive ? 'var(--accent, #3b82f6)' : 'var(--surface2)',
                    color: isActive ? '#fff' : 'var(--text)',
                    border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer',
                    marginBottom: 6, textAlign: 'left', fontSize: 15,
                  }}
                >
                  <span style={{
                    display: 'inline-block', width: 10, height: 10, borderRadius: 999,
                    background: u.online ? '#10b981' : '#6b7280',
                    boxShadow: u.online ? '0 0 8px rgba(16,185,129,0.6)' : 'none',
                    flexShrink: 0,
                  }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.displayName || u.username}
                  </span>
                  {unread > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', padding: '1px 8px', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>{unread}</span>
                  )}
                </button>
              )
            })}
          </div>

          {activeUserId && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 400 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h2 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: 0 }}>
                  {userById(activeUserId)?.displayName || userById(activeUserId)?.username || 'Chat'}
                </h2>
                <button onClick={() => setActiveUserId(null)} style={closeBtn()}>Close</button>
              </div>
              <div style={{ flex: 1, maxHeight: '50vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, padding: '6px 4px' }}>
                {thread.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No messages yet. Say hi.</div>}
                {thread.map(m => (
                  <div key={m.id} style={{
                    alignSelf: m.from === me?.id ? 'flex-end' : 'flex-start', maxWidth: '85%',
                    background: m.from === me?.id ? 'var(--accent, #3b82f6)' : 'var(--surface2)',
                    color: m.from === me?.id ? '#fff' : 'var(--text)',
                    padding: '8px 12px', borderRadius: 12, fontSize: 14, wordBreak: 'break-word',
                  }}>
                    <div>{m.body}</div>
                    <div style={{ fontSize: 10, opacity: 0.7, marginTop: 4 }}>{new Date(m.at).toLocaleTimeString()}</div>
                  </div>
                ))}
              </div>
              <form onSubmit={sendDm} style={{ display: 'flex', gap: 6 }}>
                <input value={dmDraft} onChange={e => setDmDraft(e.target.value)} placeholder="Message…"
                  style={{ flex: 1, padding: '10px 12px', minHeight: 44, fontSize: 15, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)' }} />
                <button type="submit" disabled={!dmDraft.trim()} style={postBtn(false)}>Send</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function PostRow({ post, me, onDelete, onEdit }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(post.body || '')
  const initials = (post.author?.displayName || post.author?.username || '?').split(' ').map(s => s[0]).join('').slice(0,2).toUpperCase()
  const canModify = me && (me.id === post.authorId || me.role === 'owner' || me.role === 'admin')

  const save = async () => {
    const ok = await onEdit(post.id, draft)
    if (ok) setEditing(false)
  }

  return (
    <div style={{ padding: 14, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 999, background: 'var(--accent, #3b82f6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
          {initials}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{post.author?.displayName || post.author?.username}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {relTime(post.at)}
            {post.editedAt && <span style={{ marginLeft: 6, fontStyle: 'italic' }}>· edited {relTime(post.editedAt)}</span>}
          </div>
        </div>
        {canModify && !editing && (
          <>
            <button onClick={() => { setDraft(post.body || ''); setEditing(true) }} title="Edit this post" style={iconBtn()}>✏️</button>
            <button onClick={() => onDelete(post.id)} title="Delete this post" style={iconBtn()}>🗑</button>
          </>
        )}
      </div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            rows={3}
            autoFocus
            style={{
              width: '100%', padding: '10px 12px', fontSize: 14,
              background: 'var(--surface2)', color: 'var(--text)',
              border: '1px solid var(--border)', borderRadius: 8, resize: 'vertical',
              fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setEditing(false)} style={iconBtn({ padding: '6px 12px', fontSize: 13 })}>Cancel</button>
            <button onClick={save} disabled={!draft.trim()} style={{
              padding: '6px 14px', fontSize: 13, fontWeight: 600,
              background: 'var(--accent, #3b82f6)', color: '#fff',
              border: 'none', borderRadius: 6, cursor: 'pointer',
              opacity: !draft.trim() ? 0.5 : 1,
            }}>Save</button>
          </div>
        </div>
      ) : (
        post.body && <div style={{ fontSize: 14, color: 'var(--text)', whiteSpace: 'pre-wrap', marginBottom: post.attachments?.length ? 8 : 0 }}>{post.body}</div>
      )}

      {(post.attachments || []).map((a, i) => <Attachment key={i} a={a} />)}
    </div>
  )
}

function iconBtn(extra = {}) {
  return {
    padding: '4px 8px', fontSize: 12,
    background: 'transparent', color: 'var(--text-muted)',
    border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer',
    ...extra,
  }
}

function BotActivityPanel({ channel, data, loading, error, onRefresh, onClose }) {
  const selected = data?.selected || {}
  const events = data?.events || []
  const title = channel === 'telegram' ? 'Telegram bot activity' : 'Discord bot activity'
  const botName = selected.bot || (channel === 'telegram' ? '@CarlucciBot' : '@Open Claw')
  const ok = selected.works && selected.running
  return (
    <section style={{
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: 14,
      display: 'grid',
      gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>
            {channel === 'telegram' ? <Send size={17} aria-hidden="true" /> : <Hash size={17} aria-hidden="true" />}
            <span>{title}</span>
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
            {botName} - {selected.detail || 'Checking OpenClaw channel status'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={statusChip(ok ? 'green' : 'amber')}>{ok ? 'works' : 'review'}</span>
          {selected.connected && <span style={statusChip('blue')}>connected</span>}
          <button type="button" onClick={onRefresh} disabled={loading} title="Refresh bot activity" style={iconActionBtn()}>
            <RefreshCw size={15} aria-hidden="true" />
          </button>
          <button type="button" onClick={onClose} style={closeBtn()}>Close</button>
        </div>
      </div>

      {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
      {!error && data?.accessNote && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.45 }}>
          {data.accessNote}
        </div>
      )}

      <div style={{ display: 'grid', gap: 6 }}>
        {loading && events.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading bot activity...</div>}
        {!loading && events.length === 0 && (
          <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            No recent gateway lines for this bot in the last 24 hours.
          </div>
        )}
        {events.slice(0, 12).map(event => (
          <div key={event.id} style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(76px, 112px) minmax(0, 1fr)',
            gap: 8,
            padding: '8px 10px',
            borderRadius: 8,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            fontSize: 12,
            color: 'var(--text)',
          }}>
            <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{event.at ? new Date(event.at).toLocaleTimeString() : 'recent'}</span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{event.text}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function Attachment({ a }) {
  if (a.kind === 'image') {
    return <img src={a.url} alt={a.name} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, marginTop: 4 }} />
  }
  if (a.kind === 'audio') {
    return <audio controls src={a.url} style={{ width: '100%', marginTop: 4 }} />
  }
  if (a.kind === 'video') {
    return <video controls src={a.url} style={{ maxWidth: '100%', maxHeight: 360, borderRadius: 8, marginTop: 4 }} />
  }
  return (
    <a href={a.url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 10px', marginTop: 4, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 13, color: 'var(--text)', textDecoration: 'none' }}>
      📎 {a.name} <span style={{ color: 'var(--text-muted)' }}>· {formatBytes(a.sizeBytes)}</span>
    </a>
  )
}

function ActivityRow({ a, onOpenDocument }) {
  const docId = activityDocumentId(a)
  const transcript = isTranscriptActivity(a)
  const canOpen = Boolean(docId)
  return (
    <div
      role={canOpen ? 'button' : undefined}
      tabIndex={canOpen ? 0 : undefined}
      onClick={canOpen ? () => onOpenDocument?.(a) : undefined}
      onKeyDown={canOpen ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDocument?.(a)
        }
      } : undefined}
      style={{
        padding: '10px 12px',
        background: transcript ? 'var(--surface)' : 'var(--surface2)',
        border: transcript ? '1px solid var(--accent)' : '1px solid var(--border)',
        borderRadius: 8,
        cursor: canOpen ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
          {iconFor(a.type)} {a.subject || a.type}
          {canOpen && <span style={{ marginLeft: 8, color: 'var(--accent)', fontSize: 12 }}>Open {transcript ? 'transcript' : 'document'}</span>}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relTime(a.at)}</span>
      </div>
      {a.body && <div style={{ fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{a.body.slice(0, 240)}{a.body.length > 240 ? '…' : ''}</div>}
    </div>
  )
}

function iconFor(t) {
  if (!t) return '•'
  if (/call|phone/i.test(t)) return '📞'
  if (/email/i.test(t)) return '✉️'
  if (/note/i.test(t)) return '📝'
  if (/lead/i.test(t)) return '🌱'
  if (/deal|opportunit/i.test(t)) return '🎯'
  if (/task/i.test(t)) return '✅'
  if (/payment|invoice|finance/i.test(t)) return '💰'
  return '•'
}
function relTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'just now'
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago'
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago'
  return Math.floor(ms / 86400000) + 'd ago'
}
function formatBytes(b) {
  if (!b) return ''
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB'
  return (b / 1024 / 1024).toFixed(1) + ' MB'
}
function attachBtn() {
  return { padding: '8px 12px', minHeight: 40, fontSize: 13, fontWeight: 500, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }
}
function postBtn(busy) {
  return { padding: '10px 18px', minHeight: 44, fontSize: 14, fontWeight: 600, background: busy ? 'var(--surface2)' : 'var(--accent, #3b82f6)', color: '#fff', border: 'none', borderRadius: 8, cursor: busy ? 'wait' : 'pointer' }
}
function closeBtn() {
  return { padding: '6px 12px', fontSize: 12, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }
}
function botChannelBtn(active) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    padding: '6px 11px',
    borderRadius: 999,
    border: '1px solid ' + (active ? 'var(--accent, #3b82f6)' : 'var(--border)'),
    background: active ? 'var(--accent, #3b82f6)' : 'var(--surface2)',
    color: active ? '#fff' : 'var(--text)',
    fontWeight: 800,
    cursor: 'pointer',
  }
}
function iconActionBtn() {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    cursor: 'pointer',
  }
}
function statusChip(tone) {
  const colors = {
    green: ['#ecfdf5', '#047857', '#a7f3d0'],
    amber: ['#fffbeb', '#b45309', '#fde68a'],
    blue: ['#eff6ff', '#1d4ed8', '#bfdbfe'],
  }
  const [background, color, border] = colors[tone] || colors.blue
  return {
    padding: '4px 8px',
    borderRadius: 999,
    background,
    color,
    border: '1px solid ' + border,
    fontSize: 11,
    fontWeight: 900,
    textTransform: 'uppercase',
  }
}
