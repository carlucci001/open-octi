'use client'
import { useState, useMemo, useRef, useEffect } from 'react'
import PageHeader from '../components/PageHeader'

// ─── Per-agent guides ────────────────────────────────────────────────────────
// Matilda has the full original SECTIONS — she's the all-tools default agent.
const MATILDA_SECTIONS = [
  {
    title: 'Daily Flow',
    icon: '🌅',
    desc: 'Status checks Matilda can deliver in seconds.',
    items: [
      { tool: 'daily_briefing', say: '"Good morning, Matilda — what does my day look like?"', does: 'Reads back today\'s meetings, tasks due, overdue count, pipeline value, monthly revenue.' },
      { tool: 'whats_next',     say: '"What\'s next on my calendar?"',                          does: 'Returns the next upcoming meeting with day and time.' },
      { tool: 'whats_overdue',  say: '"What am I behind on?"',                                  does: 'Lists up to 5 overdue tasks with their due dates.' },
      { tool: 'pipeline_status', say: '"Show me the pipeline status."',                         does: 'Total open deals, total value, breakdown by pipeline.' },
      { tool: 'account_summary', say: '"Tell me about Marjorie Farrington."',                   does: 'Verbal briefing: contact info, opportunities, projects, open tasks, last activity.' },
    ],
  },
  {
    title: 'Navigation & Records',
    icon: '🧭',
    desc: 'Move around the CRM hands-free.',
    items: [
      { tool: 'navigate_to',   say: '"Take me to the dashboard." / "Open the network menu."',  does: 'Switches to any section: dashboard, accounts, leads, pipelines, contacts, projects, tasks, billing, documents, calendar, notes, domains, credentials, phone, network.' },
      { tool: 'open_record',   say: '"Open Marjorie Farrington\'s record."',                    does: 'Finds and opens the matching account/lead/contact/domain detail panel.' },
      { tool: 'find_contact',  say: '"What\'s Marge\'s phone number?"',                         does: 'Looks up email and phone without opening the record.' },
      { tool: 'filter_leads',  say: '"Show me Farrington Development leads."',                  does: 'Opens the Leads page filtered by campaign: sponsors, newspapers, TDAs, or Farrington Development.' },
    ],
  },
  {
    title: 'Calls & Video',
    icon: '📞',
    desc: 'Real telephony — through your computer audio.',
    items: [
      { tool: 'dial_phone',       say: '"Dial Marge."',                                          does: 'Twilio in-browser call. Audio routes through your computer speakers and mic.' },
      { tool: 'start_video_call', say: '"Video call Marjorie Farrington."',                      does: 'Creates a Jitsi room, emails the link to the client, opens the call panel inline.' },
      { tool: 'kill_all_calls',   say: '"Hang up everything." / "Emergency hangup."',            does: 'Terminates every active or ringing Twilio call across the system.' },
    ],
  },
  {
    title: 'Tasks & Activities',
    icon: '✅',
    desc: 'Voice-driven task and timeline management.',
    items: [
      { tool: 'create_task',    say: '"Remind me to follow up with Marge by Friday." / "Add a task to call Justin tomorrow, high priority."', does: 'Creates a task. Optional due date, priority, and CRM link.' },
      { tool: 'complete_task',  say: '"Mark the Marge follow-up done."',                          does: 'Finds the matching open task by title and marks it complete.' },
      { tool: 'log_activity',   say: '"Log a call with Marge — discussed pricing."',              does: 'Adds a timeline entry (call/email/meeting/note) on a CRM record.' },
    ],
  },
  {
    title: 'Pipeline & Deals',
    icon: '🎯',
    desc: 'Move opportunities along without clicking.',
    items: [
      { tool: 'move_pipeline_stage', say: '"Move the WRAL deal to Proposal."',                   does: 'Advances an opportunity to a different stage in its pipeline.' },
    ],
  },
  {
    title: 'Documents & Email',
    icon: '📄',
    desc: 'Send things to clients on command.',
    items: [
      { tool: 'generate_and_send_document', say: '"Send an NDA to Marge — make it our standard." / "Generate a retainer for Justin and send it."', does: 'Picks the matching template, generates a fresh document filled with the client\'s info, saves it, and emails it. One shot.' },
      { tool: 'send_document',  say: '"Send the existing retainer I prepared for Marge."',       does: 'Sends a document that\'s ALREADY been generated and saved for the client.' },
      { tool: 'dictate_email',  say: '"Email Marge: thanks for the call today, I\'ll send the proposal Friday."', does: 'Composes and sends an email to anyone in the CRM by name or address.' },
      { tool: 'send_email',     say: '"Send an email to demo@example.com about pricing."',       does: 'Direct send when you already know the address.' },
    ],
  },
  {
    title: 'Calendar & Demos',
    icon: '📅',
    desc: 'Booking and looking ahead.',
    items: [
      { tool: 'list_upcoming_events', say: '"What\'s on my calendar this week?"',                does: 'Lists upcoming events in a chosen window (default 7 days).' },
      { tool: 'book_demo',            say: '"Book Justin Smith for a client call Tuesday at 2pm." / "Book a demo for Acme Tuesday at 2pm."',     does: 'Books normal appointments on Farrington Development, and only routes to ContentHub Demos when the request is explicitly a demo.' },
    ],
  },
  {
    title: 'Domains',
    icon: '🌐',
    desc: 'GoDaddy lookups via voice.',
    items: [
      { tool: 'check_domain_availability', say: '"Is widgetfactory.com available?"',             does: 'Live GoDaddy availability check with price.' },
    ],
  },
]

// New agents — each has scoped tools and example phrases.
const SASHA_SECTIONS = [
  {
    title: 'Social Posts & Captions',
    icon: '✍️',
    desc: 'Quick drafts in your brand voice for any platform.',
    items: [
      { tool: 'draft_post', say: '"Sasha, draft a LinkedIn post about our new sponsor signup with WRAL."', does: 'Returns a punchy LinkedIn draft. Ask for Instagram, X, or Facebook variants.' },
      { tool: 'caption',    say: '"Sasha, give me three Instagram captions for this photo of the new newsroom."', does: 'Returns multiple options at different lengths.' },
    ],
  },
  {
    title: 'Account Context',
    icon: '🔍',
    desc: 'Look up a client before posting about them.',
    items: [
      { tool: 'get_account', say: '"Sasha, who is Atlas Industries again?"', does: 'Reads back a quick summary so the post is accurate.' },
      { tool: 'log_activity', say: '"Sasha, log that we posted the WRAL announcement on LinkedIn today."', does: 'Records the post on the relevant account timeline.' },
    ],
  },
]

const LINDA_SECTIONS = [
  {
    title: 'Contract Review',
    icon: '⚖️',
    desc: 'Linda reads contracts before they go out.',
    items: [
      { tool: 'review_contract', say: '"Linda, review the MSA draft I just saved for Atlas."', does: 'Returns a structured report: summary, risk flags, missing clauses, jurisdiction check, suggested edits.' },
      { tool: 'jurisdiction_check', say: '"Linda, what\'s the governing law on the Atlas contract?"', does: 'Pulls the clause and flags if it\'s not North Carolina.' },
    ],
  },
  {
    title: 'Logging & Notes',
    icon: '📋',
    desc: 'Keep a paper trail of every review.',
    items: [
      { tool: 'log_activity', say: '"Linda, log that you reviewed the Atlas MSA and flagged the IP clause."', does: 'Creates an activity entry on the related account/opportunity.' },
      { tool: 'write_note',   say: '"Linda, save these review notes to the Atlas folder in Command Vault."', does: 'Writes a markdown note in the vault.' },
    ],
  },
]

const CAMERON_SECTIONS = [
  {
    title: 'SMS & Voice',
    icon: '📱',
    desc: 'Reach people on whatever channel works.',
    items: [
      { tool: 'send_sms', say: '"Cameron, text Marge: \'Running 5 minutes late, on my way.\'"', does: 'Sends an SMS via Twilio. Always confirms recipient and message before sending.' },
      { tool: 'log_activity', say: '"Cameron, log that I called Justin about the demo."', does: 'Records the call on his contact timeline.' },
    ],
  },
  {
    title: 'Discord & Telegram (drafting)',
    icon: '💬',
    desc: 'Drafts ready for you to post — auto-send pending plugin wiring.',
    items: [
      { tool: 'draft_discord', say: '"Cameron, draft an announcement for the #showcase channel about the new client."', does: 'Returns the message. Until plugins are wired you copy it over yourself.' },
      { tool: 'draft_telegram', say: '"Cameron, draft a Telegram broadcast for tomorrow\'s downtime."', does: 'Returns a short, clean Telegram-style message.' },
    ],
  },
  {
    title: 'Escalation',
    icon: '🚨',
    desc: 'Bubble urgent things up to Carl.',
    items: [
      { tool: 'create_task', say: '"Cameron, escalate this — high priority task to call Atlas back today."', does: 'Creates a high-priority task assigned to Carl.' },
    ],
  },
]

const MARK_SECTIONS = [
  {
    title: 'Long-Form Content',
    icon: '📰',
    desc: 'Mark writes the substantial pieces.',
    items: [
      { tool: 'press_release', say: '"Mark, draft a press release announcing our new partnership with WRAL."', does: 'Returns a full press release in Carl\'s voice.' },
      { tool: 'newsletter',    say: '"Mark, write this week\'s newsletter — three deals closed, two new domains."', does: 'Drafts a newsletter section by section.' },
      { tool: 'sales_page',    say: '"Mark, build a sales page for the $25k CRM install."', does: 'Hook → problem → solution → proof → offer → CTA.' },
    ],
  },
  {
    title: 'Document Send',
    icon: '📤',
    desc: 'Get things out the door.',
    items: [
      { tool: 'send_document', say: '"Mark, send the existing case study to Atlas."', does: 'Emails a saved document to the client.' },
      { tool: 'send_email',    say: '"Mark, email demo@example.com the pricing teaser."', does: 'Direct outbound email.' },
    ],
  },
]

const MAGGIE_SECTIONS = [
  {
    title: 'Office Manager — Daily Coordination',
    icon: '🎯',
    desc: 'Maggie keeps the day running.',
    items: [
      { tool: 'whats_priority', say: '"Maggie, what should I focus on today?"', does: 'Looks at overdue tasks, stalled opportunities, unpaid invoices, expiring domains and tells you the top 3.' },
      { tool: 'pipeline_status', say: '"Maggie, where are we on pipeline this week?"', does: 'Open deals, total value, what moved.' },
      { tool: 'command_center_action', say: '"Maggie, open the API meter." / "Close it."', does: 'Expands or collapses the live provider-spend meter hands-free without moving you away from your work.' },
    ],
  },
  {
    title: 'Invoicing & Payments',
    icon: '💰',
    desc: 'Send invoices and record payments by voice.',
    items: [
      { tool: 'create_invoice', say: '"Maggie, draft an invoice for Atlas, $5,000 retainer due in 14 days."', does: 'Creates a draft invoice. Always reads it back before sending.' },
      { tool: 'send_invoice_via_stripe', say: '"Maggie, send that invoice."', does: 'Pushes it through Stripe and emails the link to the client.' },
      { tool: 'record_payment', say: '"Maggie, record a $2,500 check payment from Marge today."', does: 'Logs a manual payment outside Stripe (cash, check, transfer).' },
    ],
  },
  {
    title: 'Projects & Tasks',
    icon: '🗂️',
    desc: 'Create, update, finish.',
    items: [
      { tool: 'create_project', say: '"Maggie, create a project for Atlas — install Q3, $45k budget, due September 30."', does: 'Spins up the project record.' },
      { tool: 'create_task',    say: '"Maggie, add a task to call Justin Friday — high priority."', does: 'Adds to the task board.' },
      { tool: 'complete_task',  say: '"Maggie, mark the WRAL follow-up done."', does: 'Closes out a task.' },
    ],
  },
]

const CRAIG_SECTIONS = [
  {
    title: 'Code Helper',
    icon: '🛠️',
    desc: 'Craig helps with engineering decisions.',
    items: [
      { tool: 'read_note',  say: '"Craig, read me the architecture note on OpenClaw plugins."', does: 'Reads a markdown file from the vault.' },
      { tool: 'write_note', say: '"Craig, save these debugging notes to Command Vault under engineering/openclaw."', does: 'Writes a markdown note.' },
      { tool: 'search',     say: '"Craig, find any account named Atlas in the CRM."', does: 'Cross-entity search.' },
      { tool: 'delegate_to_jules', say: '"Craig, send Jules a full production-readiness review of this repo."', does: 'Creates a Google Jules task for async engineering work.' },
      { tool: 'create_plugin_change_request', say: '"Craig, capture a plugin change request for the OpenClaw billing tool."', does: 'Creates a CRM engineering task with scope, guardrails, and acceptance criteria.' },
      { tool: 'check_jules_status', say: '"Craig, check Jules status."', does: 'Reports recent Jules task status and links.' },
    ],
  },
]

const AGENT_GUIDES = {
  matilda:                 { name: 'Matilda', emoji: '✨', role: 'Default voice assistant — full CRM, navigation, voice control', sections: MATILDA_SECTIONS },
  'social-media':          { name: 'Sasha',   emoji: '🎨', role: 'Graphic designer & social media marketer',                    sections: SASHA_SECTIONS },
  'legal':                 { name: 'Linda',   emoji: '⚖️', role: 'Legal advisor — reviews AI-drafted contracts',                 sections: LINDA_SECTIONS },
  'communications':        { name: 'Cameron', emoji: '📡', role: 'Communications coordinator — Twilio, Discord, Telegram',       sections: CAMERON_SECTIONS },
  'ContentHub-promoter': { name: 'Mark',    emoji: '📰', role: 'Marketing content lead — long-form writing, press, newsletters', sections: MARK_SECTIONS },
  'main':                  { name: 'Maggie',  emoji: '🤖', role: 'Office manager — broad CRM operations, invoicing',             sections: MAGGIE_SECTIONS },
  'coding':                { name: 'Craig',   emoji: '👨‍💻', role: 'Software engineering helper',                                sections: CRAIG_SECTIONS },
}

const TOP_TABS = [
  { id: 'voice-agents',   label: 'Voice Agents',   emoji: '🎙️' },
  { id: 'getting-started', label: 'Getting Started', emoji: '🚀' },
  { id: 'crm',            label: 'CRM Workflow',   emoji: '📊' },
  { id: 'communications', label: 'Communications', emoji: '📞' },
  { id: 'system',         label: 'System',         emoji: '⚙️' },
]

const TASK_FILTERS = [
  { id: 'all', label: 'All tasks', terms: [] },
  { id: 'daily', label: 'Daily flow', terms: ['daily', 'briefing', 'priority', 'overdue', 'calendar', 'focus'] },
  { id: 'crm', label: 'CRM records', terms: ['crm', 'account', 'lead', 'contact', 'record', 'pipeline', 'opportunity'] },
  { id: 'calls', label: 'Calls & messages', terms: ['call', 'phone', 'sms', 'email', 'video', 'twilio', 'telegram', 'discord'] },
  { id: 'tasks', label: 'Tasks & projects', terms: ['task', 'project', 'activity', 'follow up', 'complete'] },
  { id: 'content', label: 'Content & social', terms: ['post', 'caption', 'press', 'newsletter', 'sales page', 'content'] },
  { id: 'documents', label: 'Documents & legal', terms: ['document', 'contract', 'nda', 'retainer', 'legal', 'clause'] },
  { id: 'money', label: 'Billing', terms: ['invoice', 'payment', 'stripe', 'budget', 'revenue'] },
  { id: 'system', label: 'System & tools', terms: ['domain', 'plugin', 'engineering', 'openclaw', 'jules', 'search'] },
]

function guideSearchText(item, section) {
  return `${section.title} ${section.desc} ${item.tool} ${item.say} ${item.does}`.toLowerCase()
}

function matchesGuideFilters(item, section, query, taskFilter) {
  const text = guideSearchText(item, section)
  const q = String(query || '').toLowerCase().trim()
  const task = TASK_FILTERS.find(t => t.id === taskFilter) || TASK_FILTERS[0]
  const queryMatch = !q || text.includes(q)
  const taskMatch = task.id === 'all' || task.terms.some(term => text.includes(term))
  return queryMatch && taskMatch
}

function countGuideMatches(guide, query, taskFilter) {
  return guide.sections.reduce((sum, section) => (
    sum + section.items.filter(item => matchesGuideFilters(item, section, query, taskFilter)).length
  ), 0)
}

function guideSectionMatches(section, query) {
  const q = String(query || '').toLowerCase().trim()
  if (!q) return true
  return `${section.heading} ${section.body}`.toLowerCase().includes(q)
}

const GENERAL_GUIDES = {
  'getting-started': {
    title: 'Getting Started',
    intro: 'A quick orientation to the Farrington Command Center.',
    sections: [
      { heading: 'The Layout', body: 'Top header has the four global icons: AI assistant, help (this), settings, external website. Side menu lists every section. Click the AI icon any time to open the chat panel; it slides in from the right.' },
      { heading: 'Voice First', body: 'Click the audio button (in the AI panel header) or say "Hey Matilda" / "Hey Sasha" / etc. with the wake word listener on. The agent answers in their own voice through your speakers.' },
      { heading: 'Themes', body: 'Theme switcher is at the bottom of the side menu. Light, dark, and a few branded variants.' },
    ],
  },
  'crm': {
    title: 'CRM Workflow',
    intro: 'How leads, accounts, contacts, opportunities, projects, and tasks fit together.',
    sections: [
      { heading: 'Leads → Accounts', body: 'Leads come in from inbound calls (Doreen), forms, and outreach campaigns. When a lead qualifies, "qualify" converts it into an Account + Contact + Opportunity in the chosen pipeline.' },
      { heading: 'Pipelines & Stages', body: 'Each campaign type has its own pipeline: sponsors, newspapers, TDAs, Farrington Development, ContentHub demos. Move opportunities through stages as deals progress.' },
      { heading: 'Projects', body: 'Once a deal is signed, create a Project linked to the Account. Track budget, hours, due date, status.' },
      { heading: 'Tasks', body: 'Tasks can link to anything: account, contact, lead, opportunity, project. Voice-create them with Maggie or Matilda.' },
    ],
  },
  'communications': {
    title: 'Communications',
    intro: 'How phone, SMS, email, video, and chat platforms wire together.',
    sections: [
      { heading: 'Phone (Twilio)', body: 'Inbound calls go to Lucci (the voice-call plugin) who books demos and creates leads. Outbound calls dial through Twilio voice SDK in your browser.' },
      { heading: 'Email (Resend)', body: 'All outbound email goes through Resend from redacted@example.invalid. Replies come back to personal@example.invalid.' },
      { heading: 'Video (Jitsi)', body: 'Self-hosted Jitsi on your Ubuntu box, exposed via Tailscale Funnel. Voice command starts a meet room and emails the link.' },
      { heading: 'Discord & Telegram', body: 'Discord plugin enabled in OpenClaw. Telegram approved but needs a bot token to fully wire up.' },
    ],
  },
  'system': {
    title: 'System & Settings',
    intro: 'Where to find network status, credentials, and core config.',
    sections: [
      { heading: 'Network', body: 'Network section shows: local CRM, cloudflared tunnel, Tailscale mesh, Tailscale serve, OpenClaw, and external API status. Tabs at the top: Services, Topology, APIs & Tools.' },
      { heading: 'Credentials Vault', body: 'All API keys live in the credentials vault, not in env files. Each provider (Anthropic, OpenAI, ElevenLabs, etc.) has a card with key fields and "test" buttons.' },
      { heading: 'OpenClaw', body: 'OpenClaw runs on the Hetzner production box. Production talks to the local gateway on localhost:18789; Windows maintenance reaches Hetzner over the approved SSH path.' },
    ],
  },
}

export default function VoiceGuide() {
  const [topTab, setTopTab] = useState('voice-agents')
  const [agentTab, setAgentTab] = useState('matilda')
  const [filter, setFilter] = useState('')
  const [generalFilter, setGeneralFilter] = useState('')
  const [taskFilter, setTaskFilter] = useState('all')
  const [collapsed, setCollapsed] = useState({})
  const sectionRefs = useRef({})
  const [roster, setRoster] = useState([])
  const [diagnostics, setDiagnostics] = useState(null)
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false)
  const [diagnosticsError, setDiagnosticsError] = useState('')

  useEffect(() => {
    fetch('/api/voice/roster').then(r => r.json()).then(j => setRoster(j.agents || [])).catch(() => {})
  }, [])

  const runDiagnostics = async () => {
    setDiagnosticsLoading(true)
    setDiagnosticsError('')
    try {
      const res = await fetch('/api/voice/diagnostics', { cache: 'no-store' }).then(r => r.json())
      setDiagnostics(res)
      if (res.error) setDiagnosticsError(res.error)
    } catch (error) {
      setDiagnosticsError(error.message || 'Diagnostics failed')
    } finally {
      setDiagnosticsLoading(false)
    }
  }

  // Build the list of agent subtabs from roster (so deleted agents disappear automatically)
  const agentSubtabs = useMemo(() => {
    const out = []
    for (const a of roster) {
      const guide = AGENT_GUIDES[a.id]
      if (!guide) continue
      out.push({ id: a.id, name: guide.name, emoji: guide.emoji, role: guide.role })
    }
    if (!out.length && AGENT_GUIDES.matilda) {
      out.push({ id: 'matilda', name: 'Matilda', emoji: '✨', role: AGENT_GUIDES.matilda.role })
    }
    return out
  }, [roster])

  const hasGuideFilter = filter.trim() || taskFilter !== 'all'
  const visibleAgentSubtabs = useMemo(() => {
    const withMatches = agentSubtabs.map(agent => ({
      ...agent,
      matches: countGuideMatches(AGENT_GUIDES[agent.id] || AGENT_GUIDES.matilda, filter, taskFilter),
    }))
    return hasGuideFilter ? withMatches.filter(agent => agent.matches > 0) : withMatches
  }, [agentSubtabs, filter, taskFilter, hasGuideFilter])
  const totalMatches = visibleAgentSubtabs.reduce((sum, agent) => sum + (agent.matches || 0), 0)

  useEffect(() => {
    if (topTab !== 'voice-agents') return
    if (visibleAgentSubtabs.some(agent => agent.id === agentTab)) return
    setAgentTab(visibleAgentSubtabs[0]?.id || 'matilda')
  }, [agentTab, topTab, visibleAgentSubtabs])

  return (
    <div className="command-workspace p-6 max-w-5xl mx-auto">
      <PageHeader
        icon="❓"
        title="Help & Guides"
        subtitle="How to use the Command Center — voice agents, CRM workflow, communications, and system."
      />

      {/* Top tabs */}
      <div className="command-toolbar flex gap-1 mb-6 flex-wrap">
        {TOP_TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTopTab(t.id)}
            className="px-4 py-3 text-sm font-semibold"
            style={{
              background: topTab === t.id ? 'var(--surface)' : 'transparent',
              color: topTab === t.id ? 'var(--accent)' : 'var(--text-muted)',
              border: '1px solid ' + (topTab === t.id ? 'var(--border)' : 'transparent'),
              borderBottom: topTab === t.id ? '2px solid var(--surface)' : 'none',
              marginBottom: -2,
              borderTopLeftRadius: 8,
              borderTopRightRadius: 8,
              minHeight: 48,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: 16, marginRight: 6 }}>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {/* VOICE AGENTS TAB */}
      {topTab === 'voice-agents' && (
        <>
          <div className="mb-5 rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Find the right guide</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Filter by the job you are trying to do, then open the matching agent.</div>
              </div>
              <div className="text-xs font-semibold rounded-md px-2 py-1 self-start" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                {totalMatches || 0} matching tools
              </div>
            </div>
            <input
              type="text"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              placeholder="Search tasks, tools, examples, agents..."
              className="w-full px-4 py-3 rounded-lg text-base mb-3"
              style={{ background: 'var(--base)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', minHeight: 48 }}
            />
            <div className="flex gap-2 flex-wrap">
              {TASK_FILTERS.map(task => (
                <button
                  key={task.id}
                  type="button"
                  onClick={() => setTaskFilter(task.id)}
                  className="px-3 py-2 rounded-full text-xs font-semibold"
                  style={{
                    background: taskFilter === task.id ? 'var(--accent)' : 'var(--surface2)',
                    color: taskFilter === task.id ? 'var(--accent-text)' : 'var(--text)',
                    border: '1px solid ' + (taskFilter === task.id ? 'var(--accent)' : 'var(--border)'),
                    minHeight: 36,
                    cursor: 'pointer',
                  }}
                >
                  {task.label}
                </button>
              ))}
            </div>
          </div>

          {/* Agent subtabs */}
          <div className="mb-5 rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Voice transfer diagnostics</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Checks every voice agent binding, provider signed URL, and recent transfer timing.</div>
              </div>
              <button
                onClick={runDiagnostics}
                disabled={diagnosticsLoading}
                className="px-4 py-2 rounded-md text-sm font-semibold"
                style={{
                  background: diagnosticsLoading ? 'var(--surface2)' : 'var(--accent)',
                  color: diagnosticsLoading ? 'var(--text-muted)' : 'var(--accent-text)',
                  border: '1px solid var(--border)',
                  cursor: diagnosticsLoading ? 'wait' : 'pointer',
                }}
              >
                {diagnosticsLoading ? 'Checking...' : 'Run diagnostics'}
              </button>
            </div>
            {diagnosticsError && (
              <div className="mt-3 text-xs font-semibold" style={{ color: 'var(--red)' }}>{diagnosticsError}</div>
            )}
            {diagnostics?.summary && (
              <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                <div className="text-xs rounded-md p-2" style={{ background: 'var(--surface2)', color: 'var(--text)' }}>
                  Passing: <strong>{diagnostics.summary.passing}/{diagnostics.summary.total}</strong>
                </div>
                <div className="text-xs rounded-md p-2" style={{ background: 'var(--surface2)', color: diagnostics.summary.failing ? 'var(--red)' : 'var(--text)' }}>
                  Failing: <strong>{diagnostics.summary.failing}</strong>
                </div>
                <div className="text-xs rounded-md p-2" style={{ background: 'var(--surface2)', color: diagnostics.summary.slow ? 'var(--orange, #b45309)' : 'var(--text)' }}>
                  Slow provider checks: <strong>{diagnostics.summary.slow}</strong>
                </div>
              </div>
            )}
            {diagnostics?.agents?.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                      <th className="text-left py-2 pr-3">Agent</th>
                      <th className="text-left py-2 pr-3">Provider</th>
                      <th className="text-left py-2 pr-3">Signed URL</th>
                      <th className="text-left py-2 pr-3">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnostics.agents.map(agent => (
                      <tr key={agent.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="py-2 pr-3 font-semibold" style={{ color: 'var(--text)' }}>{agent.firstName || agent.name}</td>
                        <td className="py-2 pr-3" style={{ color: 'var(--text-muted)' }}>{agent.provider}</td>
                        <td className="py-2 pr-3" style={{ color: agent.ok ? 'var(--green)' : 'var(--red)' }}>{agent.ok ? 'OK' : agent.error}</td>
                        <td className="py-2 pr-3" style={{ color: agent.elapsedMs > 2500 ? 'var(--orange, #b45309)' : 'var(--text-muted)' }}>{agent.elapsedMs}ms</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Agent subtabs */}
          <div className="flex gap-2 mb-5 flex-wrap">
            {visibleAgentSubtabs.map(a => (
              <button
                key={a.id}
                onClick={() => setAgentTab(a.id)}
                className="px-4 py-2 rounded-full text-sm font-medium"
                style={{
                  background: agentTab === a.id ? 'var(--accent)' : 'var(--surface2)',
                  color: agentTab === a.id ? 'var(--accent-text)' : 'var(--text)',
                  border: '1px solid ' + (agentTab === a.id ? 'var(--accent)' : 'var(--border)'),
                  minHeight: 40,
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 16, marginRight: 6 }}>{a.emoji}</span>{a.name}
                {hasGuideFilter ? <span style={{ marginLeft: 6, opacity: 0.8 }}>({a.matches})</span> : null}
              </button>
            ))}
            {!visibleAgentSubtabs.length && (
              <div className="text-sm rounded-lg px-3 py-2" style={{ color: 'var(--text-muted)', background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                No agents match that filter.
              </div>
            )}
          </div>

          <AgentGuide
            agentId={agentTab}
            filter={filter}
            taskFilter={taskFilter}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            sectionRefs={sectionRefs}
          />
        </>
      )}

      {/* OTHER TOP TABS */}
      {topTab !== 'voice-agents' && GENERAL_GUIDES[topTab] && (
        <GeneralGuideTab guide={GENERAL_GUIDES[topTab]} filter={generalFilter} setFilter={setGeneralFilter} />
      )}
    </div>
  )
}

function GeneralGuideTab({ guide, filter, setFilter }) {
  const filteredSections = useMemo(() => (
    guide.sections.filter(section => guideSectionMatches(section, filter))
  ), [guide, filter])

  return (
    <div>
      <div className="mb-5 rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-3">
          <div>
            <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>{guide.title}</h2>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{guide.intro}</p>
          </div>
          <div className="text-xs font-semibold rounded-md px-2 py-1 self-start" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {filteredSections.length} of {guide.sections.length} sections
          </div>
        </div>
        <input
          type="text"
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder={`Search ${guide.title.toLowerCase()}...`}
          className="w-full px-4 py-3 rounded-lg text-base"
          style={{ background: 'var(--base)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', minHeight: 48 }}
        />
      </div>

      {filteredSections.length === 0 && (
        <div className="text-center py-16 rounded-xl" style={{ color: 'var(--text-muted)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
          No guide sections match "{filter}".
        </div>
      )}

      <div className="grid gap-4">
        {filteredSections.map((section, index) => (
          <section key={section.heading} className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ background: 'var(--accent-soft)', borderBottom: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <div className="text-xs font-semibold uppercase" style={{ color: 'var(--accent)' }}>Guide section {index + 1}</div>
                <h3 className="text-lg font-bold mt-1" style={{ color: 'var(--text)' }}>{section.heading}</h3>
              </div>
              <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                {guide.title}
              </span>
            </div>
            <div className="p-4">
              <p className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{section.body}</p>
            </div>
          </section>
        ))}
      </div>
    </div>
  )
}

function AgentGuide({ agentId, filter, taskFilter, collapsed, setCollapsed, sectionRefs }) {
  const guide = AGENT_GUIDES[agentId] || AGENT_GUIDES.matilda
  const SECTIONS = guide.sections
  const totalTools = SECTIONS.reduce((n, s) => n + s.items.length, 0)

  const filteredSections = useMemo(() => {
    return SECTIONS
      .map(s => ({ ...s, items: s.items.filter(i => matchesGuideFilters(i, s, filter, taskFilter)) }))
      .filter(s => s.items.length > 0)
  }, [filter, taskFilter, SECTIONS])

  const toggleCollapsed = (title) => setCollapsed(c => ({ ...c, [title]: !c[title] }))

  return (
    <>
      {/* Agent intro card */}
      <div className="rounded-xl p-5 mb-6 flex items-start gap-4" style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent)' }}>
        <div style={{ fontSize: 36, lineHeight: 1 }}>{guide.emoji}</div>
        <div className="flex-1">
          <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text)' }}>{guide.name}</h2>
          <p className="text-sm mb-3" style={{ color: 'var(--text)' }}>{guide.role}</p>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            <strong>How to summon:</strong> Say "Hey {guide.name}" with the wake-word listener on, or pick {guide.name} from the dropdown next to the audio button and click it.
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
          {filteredSections.reduce((sum, section) => sum + section.items.length, 0)} of {totalTools} tools shown
        </div>
        <div className="text-xs rounded-md px-2 py-1" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          Filters apply across guide examples and outcomes
        </div>
      </div>

      {/* Sections */}
      {filteredSections.length === 0 && (
        <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>No tools match "{filter}".</div>
      )}
      {filteredSections.map(section => {
        const isCollapsed = collapsed[guide.name + ':' + section.title]
        const key = guide.name + ':' + section.title
        return (
          <section key={key} className="mb-5 rounded-xl overflow-hidden" ref={el => { sectionRefs.current[key] = el }} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <button
              onClick={() => toggleCollapsed(key)}
              className="flex items-center gap-3 w-full text-left"
              style={{ background: 'var(--accent-soft)', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', padding: '12px 14px' }}
            >
              <span style={{ fontSize: 22 }}>{section.icon}</span>
              <h2 className="text-xl font-bold" style={{ color: 'var(--text)' }}>{section.title}</h2>
              <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{section.items.length}</span>
              <span style={{ flex: 1 }} />
              <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>{isCollapsed ? '▸' : '▾'}</span>
            </button>
            <p className="text-sm px-4 pt-3 pb-1" style={{ color: 'var(--text-muted)' }}>{section.desc}</p>
            {!isCollapsed && (
              <div className="grid gap-3 p-4 pt-3">
                {section.items.map(item => <ToolCard key={item.tool} item={item} />)}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}

function ToolCard({ item, showCategory }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-3 flex-wrap">
        <code className="text-xs font-mono px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>{item.tool}</code>
        {showCategory && (
          <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{item.icon} {item.category}</span>
        )}
      </div>
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>You say</div>
        <div className="text-sm italic" style={{ color: 'var(--text)' }}>{item.say}</div>
      </div>
      <div className="mt-3">
        <div className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>What happens</div>
        <div className="text-sm" style={{ color: 'var(--text)' }}>{item.does}</div>
      </div>
    </div>
  )
}
