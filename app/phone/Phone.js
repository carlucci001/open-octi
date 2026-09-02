'use client'

import { useEffect, useState } from 'react'
import { BarChart3, History, Mail, MessageSquare, PhoneCall, Video } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import Dialer from '../dialer/Dialer'
import Voicemails from '../voicemails/Voicemails'
import ConferenceCenter from '../conference/ConferenceCenter'
import MessagesHub from '../communications/MessagesHub'
import CommsInbox from '../comms/CommsInbox'
import CommunicationsOperations from '../communications/CommunicationsOperations'

const VIEWS = [
  { id: 'activity', label: 'Activity', Icon: History },
  { id: 'dialer', label: 'Phone', Icon: PhoneCall },
  { id: 'video', label: 'Video', Icon: Video },
  { id: 'messages', label: 'Messages', Icon: MessageSquare },
  { id: 'email', label: 'Email', Icon: Mail },
]

export default function Phone({ initialView = 'dialer' }) {
  const [view, setView] = useState(initialView)
  const [unread, setUnread] = useState(0)
  const [showOperations, setShowOperations] = useState(false)

  useEffect(() => {
    setView(initialView)
  }, [initialView])

  useEffect(() => {
    let active = true
    const refresh = () => fetch('/api/voicemails').then(r => r.json()).then(data => {
      if (active) setUnread((data.messages || []).filter(message => message.status !== 'done').length)
    }).catch(() => {})
    refresh()
    const timer = setInterval(refresh, 60000)
    return () => { active = false; clearInterval(timer) }
  }, [])

  const handleTabKey = (event, currentIndex) => {
    let nextIndex = null
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % VIEWS.length
    if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + VIEWS.length) % VIEWS.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = VIEWS.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    setView(VIEWS[nextIndex].id)
    document.getElementById(`communications-tab-${VIEWS[nextIndex].id}`)?.focus()
  }

  return (
    <div className="command-workspace px-3 py-4 sm:p-5 lg:p-6">
      <PageHeader
        icon="☎"
        title="Communications"
        subtitle="Call, review email and conversations, and start video meetings from one workspace."
      />

      <div className="mb-3 flex justify-end">
        <button type="button" onClick={() => setShowOperations(value => !value)} aria-expanded={showOperations} className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold" style={{ background: showOperations ? 'var(--accent)' : 'var(--surface)', color: showOperations ? 'var(--accent-text)' : 'var(--text)', border: '1px solid var(--border)' }}><BarChart3 size={17} />Costs & Lines</button>
      </div>
      {showOperations && <CommunicationsOperations onClose={() => setShowOperations(false)} />}

      <div role="tablist" className="mb-4 grid overflow-hidden rounded-lg p-1" style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 4, background: 'var(--surface2)', border: '1px solid var(--border)' }} aria-label="Communications views">
        {VIEWS.map(({ id, label, Icon }, index) => {
          const selected = view === id
          return (
            <button key={id} id={`communications-tab-${id}`} type="button" role="tab" aria-selected={selected} aria-controls={`communications-panel-${id}`} tabIndex={selected ? 0 : -1}
              onClick={() => setView(id)} onKeyDown={event => handleTabKey(event, index)}
              className="relative flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:text-sm"
              style={{ background: selected ? 'var(--accent)' : 'transparent', color: selected ? 'var(--accent-text)' : 'var(--text-muted)', border: selected ? '1px solid var(--accent)' : '1px solid transparent', boxShadow: selected ? 'var(--shadow-sm)' : 'none', outlineColor: 'var(--border-hover)' }}>
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
              {selected && <span className="sr-only"> selected</span>}
              {id === 'activity' && unread > 0 && <span className="absolute right-1 top-1 min-w-4 rounded-full px-1 py-0.5 text-[9px] leading-none" style={{ background: 'var(--red)', color: 'white' }}>{unread > 99 ? '99+' : unread}</span>}
            </button>
          )
        })}
      </div>

      <div id={`communications-panel-${view}`} role="tabpanel" aria-labelledby={`communications-tab-${view}`}>
        {view === 'dialer' && <Dialer compact />}
        {view === 'activity' && <Voicemails compact />}
        {view === 'video' && <ConferenceCenter compact />}
        {view === 'messages' && <MessagesHub />}
        {view === 'email' && <CommsInbox />}
      </div>
    </div>
  )
}
