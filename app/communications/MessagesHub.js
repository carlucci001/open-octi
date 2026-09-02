'use client'

import { useEffect, useState } from 'react'
import { Hash, RefreshCw, Send, Users } from 'lucide-react'

const CHANNELS = [
  { id: 'internal', label: 'CRM team', Icon: Users },
  { id: 'telegram', label: 'Telegram', Icon: Send },
  { id: 'discord', label: 'Discord', Icon: Hash },
]

export default function MessagesHub() {
  const [channel, setChannel] = useState('internal')
  const [me, setMe] = useState(null)
  const [users, setUsers] = useState([])
  const [inbox, setInbox] = useState([])
  const [activeUserId, setActiveUserId] = useState(null)
  const [thread, setThread] = useState([])
  const [draft, setDraft] = useState('')
  const [botActivity, setBotActivity] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadPeople = async () => {
    const [meResponse, usersResponse, inboxResponse] = await Promise.all([
      fetch('/api/auth/me').then(response => response.json()).catch(() => ({})),
      fetch('/api/users/online').then(response => response.json()).catch(() => ({})),
      fetch('/api/messages').then(response => response.json()).catch(() => ({})),
    ])
    setMe(meResponse.user || null)
    setUsers(usersResponse.users || [])
    setInbox(inboxResponse.inbox || [])
  }

  const loadBotActivity = async (selectedChannel = channel) => {
    if (selectedChannel === 'internal') return
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/openclaw/channel-activity?channel=${encodeURIComponent(selectedChannel)}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Bot activity unavailable')
      setBotActivity(data)
    } catch (cause) {
      setError(cause.message || 'Bot activity unavailable')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (channel === 'internal') {
      loadPeople()
      const timer = setInterval(loadPeople, 5000)
      return () => clearInterval(timer)
    }
    loadBotActivity(channel)
    const timer = setInterval(() => loadBotActivity(channel), 10000)
    return () => clearInterval(timer)
  }, [channel])

  useEffect(() => {
    if (!activeUserId) { setThread([]); return }
    let stopped = false
    const loadThread = async () => {
      const response = await fetch(`/api/messages?with=${encodeURIComponent(activeUserId)}`).then(result => result.json()).catch(() => ({}))
      if (stopped) return
      setThread(response.messages || [])
      fetch('/api/messages', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ from: activeUserId }),
      }).catch(() => {})
    }
    loadThread()
    const timer = setInterval(loadThread, 4000)
    return () => { stopped = true; clearInterval(timer) }
  }, [activeUserId])

  const sendMessage = async event => {
    event.preventDefault()
    if (!activeUserId || !draft.trim()) return
    const response = await fetch('/api/messages', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: activeUserId, body: draft.trim() }),
    })
    const data = await response.json()
    if (data.ok) { setThread(current => [...current, data.message]); setDraft('') }
  }

  const totalUnread = inbox.reduce((sum, peer) => sum + (peer.unread || 0), 0)
  const activeUser = users.find(user => user.id === activeUserId)

  return <section className="rounded-xl p-3 sm:p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
    <div className="mb-3">
      <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>Messaging</h2>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>CRM conversations and connected OpenClaw channels in one workspace.</p>
    </div>

    <div className="mb-4 grid grid-cols-3 gap-1" role="tablist" aria-label="Message channels">
      {CHANNELS.map(({ id, label, Icon }) => <button key={id} type="button" role="tab" aria-selected={channel === id} onClick={() => { setChannel(id); setActiveUserId(null) }} className="relative flex min-h-11 items-center justify-center gap-1 rounded-lg px-2 text-xs font-semibold sm:gap-2 sm:text-sm" style={{ background: channel === id ? 'var(--accent)' : 'var(--surface2)', color: channel === id ? 'var(--accent-text)' : 'var(--text-muted)', border: '1px solid var(--border)' }}><Icon size={16} /><span>{label}</span>{id === 'internal' && totalUnread > 0 && <span className="absolute right-1 top-1 rounded-full px-1 text-[9px]" style={{ background: 'var(--red)', color: '#fff' }}>{totalUnread}</span>}</button>)}
    </div>

    {channel === 'internal' ? <div className="grid gap-3 lg:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
      <div>
        <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>People</h3>
        <div className="grid gap-1">
          {users.filter(user => user.id !== me?.id).map(user => {
            const unread = inbox.find(peer => peer.peerId === user.id)?.unread || 0
            const active = activeUserId === user.id
            return <button key={user.id} type="button" onClick={() => setActiveUserId(active ? null : user.id)} className="flex min-h-[52px] items-center gap-2 rounded-lg px-3 text-left text-sm" style={{ background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? 'var(--accent-text)' : 'var(--text)', border: '1px solid var(--border)' }}><span className="size-2.5 shrink-0 rounded-full" style={{ background: user.online ? 'var(--green)' : 'var(--text-muted)' }} /><span className="min-w-0 flex-1 truncate">{user.displayName || user.username}</span>{unread > 0 && <span className="rounded-full px-2 py-0.5 text-xs" style={{ background: 'var(--red)', color: '#fff' }}>{unread}</span>}</button>
          })}
          {users.filter(user => user.id !== me?.id).length === 0 && <p className="p-3 text-sm" style={{ color: 'var(--text-muted)' }}>No other CRM members yet.</p>}
        </div>
      </div>
      <div className="flex min-h-[300px] flex-col rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
        {activeUserId ? <>
          <h3 className="mb-2 text-sm font-bold" style={{ color: 'var(--text)' }}>{activeUser?.displayName || activeUser?.username || 'Conversation'}</h3>
          <div className="flex max-h-[45vh] flex-1 flex-col gap-1 overflow-y-auto py-2">
            {thread.map(message => <div key={message.id} className="max-w-[85%] rounded-xl px-3 py-2 text-sm" style={{ alignSelf: message.from === me?.id ? 'flex-end' : 'flex-start', background: message.from === me?.id ? 'var(--accent)' : 'var(--surface)', color: message.from === me?.id ? 'var(--accent-text)' : 'var(--text)' }}><div className="break-words">{message.body}</div><div className="mt-1 text-[10px] opacity-70">{new Date(message.at).toLocaleTimeString()}</div></div>)}
            {thread.length === 0 && <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No messages yet. Say hi.</p>}
          </div>
          <form onSubmit={sendMessage} className="mt-2 flex gap-2"><input value={draft} onChange={event => setDraft(event.target.value)} placeholder="Message this CRM member..." className="min-h-11 min-w-0 flex-1 rounded-lg px-3 text-sm" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} /><button type="submit" disabled={!draft.trim()} className="min-h-11 rounded-lg px-4 text-sm font-bold disabled:opacity-40" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Send</button></form>
        </> : <div className="m-auto text-center"><Users size={28} className="mx-auto mb-2" style={{ color: 'var(--text-muted)' }} /><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Choose a CRM member to open a conversation.</p></div>}
      </div>
    </div> : <BotActivityPanel channel={channel} data={botActivity} loading={loading} error={error} onRefresh={() => loadBotActivity(channel)} />}
  </section>
}

function BotActivityPanel({ channel, data, loading, error, onRefresh }) {
  const selected = data?.selected || {}
  const events = data?.events || []
  const working = selected.works && selected.running
  return <div className="rounded-xl p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
    <div className="mb-3 flex items-start justify-between gap-2"><div><h3 className="flex items-center gap-2 text-sm font-bold" style={{ color: 'var(--text)' }}>{channel === 'telegram' ? <Send size={17} /> : <Hash size={17} />}{channel === 'telegram' ? 'Telegram bot activity' : 'Discord bot activity'}</h3><p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{selected.bot || (channel === 'telegram' ? '@CarlucciBot' : '@Open Claw')} · {selected.detail || 'Checking OpenClaw channel status'}</p></div><button type="button" onClick={onRefresh} disabled={loading} aria-label={`Refresh ${channel}`} className="flex size-11 shrink-0 items-center justify-center rounded-lg" style={{ border: '1px solid var(--border)', color: 'var(--text)' }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button></div>
    <div className="mb-3 flex gap-2"><span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase" style={{ background: working ? 'var(--green-soft)' : 'var(--amber-soft)', color: working ? 'var(--green)' : 'var(--amber)' }}>{working ? 'works' : 'review'}</span>{selected.connected && <span className="rounded-full px-2 py-1 text-[10px] font-bold uppercase" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>connected</span>}</div>
    {error && <p className="mb-2 text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
    {data?.accessNote && <p className="mb-3 text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{data.accessNote}</p>}
    <div className="grid gap-1">{events.slice(0, 20).map(event => <div key={event.id} className="grid gap-1 rounded-lg p-2 text-xs sm:grid-cols-[100px_minmax(0,1fr)]" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}><span style={{ color: 'var(--text-muted)' }}>{event.at ? new Date(event.at).toLocaleTimeString() : 'recent'}</span><span className="break-words">{event.text}</span></div>)}{!loading && events.length === 0 && !error && <p className="p-4 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No recent gateway activity in the last 24 hours.</p>}</div>
  </div>
}
