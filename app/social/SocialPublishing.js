'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import PageHeader, { ViewToggle } from '../components/PageHeader'

const VIEWS = [
  { id: 'planner', label: 'Planner' },
  { id: 'channels', label: 'Channels' },
  { id: 'media', label: 'Media' },
  { id: 'integrations', label: 'Integrations' },
]

const CALENDAR_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default function SocialPublishing({ embedded = false, onNavigate, onOpenCampaigns }) {
  const [view, setView] = useState('planner')
  const [channels, setChannels] = useState([])
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const onSub = (e) => {
      const next = String(e.detail?.path || '').trim()
      if (VIEWS.some(item => item.id === next)) setView(next)
    }
    window.addEventListener('fcc:social-sub', onSub)
    return () => window.removeEventListener('fcc:social-sub', onSub)
  }, [])

  useEffect(() => {
    const saved = window.localStorage.getItem('fcc:campaigns-planner-view')
    if (VIEWS.some(item => item.id === saved)) setView(saved)
  }, [])

  useEffect(() => {
    window.localStorage.setItem('fcc:campaigns-planner-view', view)
  }, [view])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.allSettled([
      fetch('/api/postiz/channels', { cache: 'no-store' }).then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) {
          return []
        }
        return j.channels || []
      }),
      fetch('/api/campaign-studio', { cache: 'no-store' }).then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok || j.error) throw new Error(j.error || `Campaign check failed (${r.status})`)
        return j.campaigns || []
      }),
    ])
      .then(([channelResult, campaignResult]) => {
        if (!alive) return
        if (channelResult.status === 'fulfilled') setChannels(channelResult.value)
        else setChannels([])
        if (campaignResult.status === 'fulfilled') setCampaigns(campaignResult.value)
      })
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [])

  const activeChannels = useMemo(() => channels.filter(channel => !channel.disabled), [channels])
  const scheduledPosts = useMemo(() => {
    return campaigns
      .flatMap(campaign => (campaign.posts || []).map(post => ({ ...post, campaignName: campaign.name, campaignId: campaign.id })))
      .filter(post => post.scheduledFor)
      .sort((a, b) => new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime())
  }, [campaigns])
  const calendarDays = useMemo(() => buildCalendarDays(scheduledPosts), [scheduledPosts])
  const upcomingPosts = scheduledPosts
    .filter(post => new Date(post.scheduledFor).getTime() >= Date.now() - 86400000)
    .slice(0, 8)

  const navigate = (tab) => {
    if (tab === 'campaign-studio' && onOpenCampaigns) {
      onOpenCampaigns()
      return
    }
    if (onNavigate) {
      onNavigate(tab)
      return
    }
    window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab } }))
  }

  return (
    <div className="command-workspace" style={pageStyle}>
      {!embedded && (
        <PageHeader
          icon={<CalendarDays size={20} />}
          title="Campaign Planner"
          subtitle="Campaign calendar, publishing assets, and connected channels stay inside Command Center."
          viewToggle={<ViewToggle view={view} setView={setView} options={VIEWS} />}
          actions={<div style={statusStyle}>{loading ? 'Checking' : `${activeChannels.length} channels`}</div>}
        />
      )}

      {embedded && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
          <ViewToggle view={view} setView={setView} options={VIEWS} />
          <div style={statusStyle}>{loading ? 'Checking' : `${activeChannels.length} connected channels`}</div>
        </div>
      )}

      <section style={gridStyle}>
        <div style={panelStyle}>
          <div style={panelHeaderStyle}>
            <div>
              <div style={eyebrowStyle}>{view}</div>
              <h2 style={sectionTitleStyle}>{viewTitle(view)}</h2>
            </div>
            <button type="button" onClick={() => navigate('campaign-studio')} style={primaryButtonStyle}>Campaign workspace</button>
          </div>

          {view === 'planner' && (
            <>
              <div style={calendarStyle} aria-label="Publishing calendar">
                {CALENDAR_WEEKDAYS.map(day => (
                  <div key={day} style={calendarWeekdayStyle}>{day}</div>
                ))}
                {calendarDays.map(day => (
                  <div key={day.key} style={day.inMonth ? calendarDayStyle : calendarMutedDayStyle}>
                    <strong style={calendarDateStyle}>{day.label}</strong>
                    <span style={calendarCountStyle}>{day.posts.length ? `${day.posts.length} post${day.posts.length === 1 ? '' : 's'}` : ''}</span>
                  </div>
                ))}
              </div>
              <div style={upcomingStyle}>
                <div style={eyebrowStyle}>Upcoming</div>
                {upcomingPosts.map(post => (
                  <button key={`${post.campaignId}-${post.id}`} type="button" onClick={() => navigate('campaign-studio')} style={upcomingRowStyle}>
                    <span style={{ minWidth: 0 }}>
                      <strong style={rowTitleStyle}>{post.campaignName || 'Campaign post'}</strong>
                      <small style={rowMetaStyle}>{post.platform || 'Social'} / {formatWhen(post.scheduledFor)}</small>
                    </span>
                    <span style={pillStyle}>{post.status || 'scheduled'}</span>
                  </button>
                ))}
                {!upcomingPosts.length && <div style={emptyStyle}>No scheduled posts yet.</div>}
              </div>
              <div style={actionGridStyle}>
                <Action title="Draft campaign posts" body="Build posts, choose channels, and send them through the included Postiz engine." onClick={() => navigate('campaign-studio')} />
                <Action title="Create content" body="Start with a blog, story, social post, meme, image brief, or reel brief." onClick={() => navigate('content-lab')} />
                <Action title="Use media" body="Pick saved client or campaign assets before scheduling." onClick={() => navigate('media')} />
              </div>
            </>
          )}

          {view === 'channels' && (
            <div style={listStyle}>
              {loading && <div style={emptyStyle}>Checking channels</div>}
              {error && <div style={warningStyle}>{error}</div>}
              {!loading && !error && activeChannels.map(channel => (
                <div key={channel.id} style={rowStyle}>
                  <span style={avatarStyle}>{String(channel.name || channel.identifier || '?').slice(0, 1).toUpperCase()}</span>
                  <span style={{ minWidth: 0 }}>
                    <strong style={rowTitleStyle}>{channel.name || channel.identifier || 'Connected channel'}</strong>
                    <small style={rowMetaStyle}>{channel.providerIdentifier || channel.profile || channel.tenantId || 'connected'}</small>
                  </span>
                </div>
              ))}
              {!loading && !error && activeChannels.length === 0 && <div style={emptyStyle}>No active channels loaded.</div>}
            </div>
          )}

          {view === 'media' && (
            <div style={actionGridStyle}>
              <Action title="Media" body="Review saved images, videos, and source assets." onClick={() => navigate('media')} />
              <Action title="Content Lab" body="Create new visual briefs and campaign copy." onClick={() => navigate('content-lab')} />
            </div>
          )}

          {view === 'integrations' && (
            <div style={listStyle}>
              <div style={rowStyle}>
                <span style={avatarStyle}>P</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={rowTitleStyle}>Postiz engine</strong>
                  <small style={rowMetaStyle}>Local sidecar through Command Center API</small>
                </span>
              </div>
              <button type="button" onClick={() => navigate('credentials')} style={secondaryButtonStyle}>Credentials</button>
            </div>
          )}
        </div>

        <aside style={sideStyle}>
          <div style={eyebrowStyle}>Queue</div>
          <h2 style={sectionTitleStyle}>Next publishing step</h2>
          <p style={subtitleStyle}>Use Campaign Studio for scheduling. Postiz stays behind the scenes as the open-source publishing engine.</p>
          <button type="button" onClick={() => navigate('campaign-studio')} style={primaryButtonStyle}>Open campaigns</button>
        </aside>
      </section>
    </div>
  )
}

function viewTitle(view) {
  if (view === 'channels') return 'Connected channels'
  if (view === 'media') return 'Publishing assets'
  if (view === 'integrations') return 'Local integration'
  return 'Plan the next post'
}

function buildCalendarDays(posts = []) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const start = new Date(monthStart)
  start.setDate(start.getDate() - start.getDay())
  return Array.from({ length: 35 }, (_, index) => {
    const date = new Date(start)
    date.setDate(start.getDate() + index)
    const key = date.toISOString().slice(0, 10)
    const dayPosts = posts.filter(post => String(post.scheduledFor || '').slice(0, 10) === key)
    return {
      key,
      label: date.getDate(),
      inMonth: date.getMonth() === now.getMonth(),
      posts: dayPosts,
    }
  })
}

function formatWhen(value) {
  if (!value) return 'Not scheduled'
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function Action({ title, body, onClick }) {
  return (
    <button type="button" onClick={onClick} style={actionStyle}>
      <strong>{title}</strong>
      <span>{body}</span>
    </button>
  )
}

const pageStyle = { minHeight: 'calc(100dvh - 52px)', padding: 16, color: 'var(--text)', background: 'var(--base)', boxSizing: 'border-box' }
const eyebrowStyle = { color: 'var(--text-muted)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase' }
const subtitleStyle = { margin: '7px 0 0', color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.45 }
const statusStyle = { border: '1px solid var(--border)', borderRadius: 999, background: 'var(--surface)', color: 'var(--text-muted)', padding: '7px 11px', fontSize: 12, fontWeight: 900, whiteSpace: 'nowrap' }
const gridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 14, alignItems: 'start' }
const panelStyle = { border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: 14 }
const sideStyle = { ...panelStyle, background: 'var(--surface2)' }
const panelHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12 }
const sectionTitleStyle = { margin: '4px 0 0', fontSize: 20, lineHeight: 1.15 }
const actionGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }
const actionStyle = { minHeight: 110, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: 13, textAlign: 'left', display: 'grid', alignContent: 'start', gap: 8, cursor: 'pointer' }
const calendarStyle = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginBottom: 14 }
const calendarWeekdayStyle = { color: 'var(--text-muted)', fontSize: 11, fontWeight: 900, textAlign: 'center', textTransform: 'uppercase' }
const calendarDayStyle = { minHeight: 72, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 8, display: 'grid', alignContent: 'start', gap: 6 }
const calendarMutedDayStyle = { ...calendarDayStyle, opacity: 0.42 }
const calendarDateStyle = { fontSize: 14, lineHeight: 1 }
const calendarCountStyle = { minHeight: 18, color: 'var(--accent)', fontSize: 11, fontWeight: 900 }
const upcomingStyle = { display: 'grid', gap: 8, marginBottom: 14 }
const upcomingRowStyle = { minHeight: 54, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: 10, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }
const listStyle = { display: 'grid', gap: 8 }
const rowStyle = { minHeight: 58, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', padding: 10, display: 'grid', gridTemplateColumns: '38px minmax(0, 1fr)', alignItems: 'center', gap: 10 }
const avatarStyle = { width: 38, height: 38, borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }
const rowTitleStyle = { display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const rowMetaStyle = { display: 'block', marginTop: 2, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const pillStyle = { border: '1px solid var(--border)', borderRadius: 999, color: 'var(--text-muted)', padding: '4px 8px', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }
const emptyStyle = { border: '1px dashed var(--border)', borderRadius: 8, padding: 18, color: 'var(--text-muted)', textAlign: 'center' }
const warningStyle = { border: '1px solid #f59e0b', borderRadius: 8, padding: 12, background: '#fffbeb', color: '#92400e', fontWeight: 800 }
const primaryButtonStyle = { minHeight: 48, borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-text)', padding: '0 16px', fontSize: 16, fontWeight: 900, cursor: 'pointer', whiteSpace: 'nowrap' }
const secondaryButtonStyle = { minHeight: 48, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', padding: '0 16px', fontSize: 16, fontWeight: 800, cursor: 'pointer', justifySelf: 'start' }
