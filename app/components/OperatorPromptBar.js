'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { actionsForContext, operatorToolsForContext, utilityActionsForContext } from './operatorContextActions'

const SECTION_LABELS = {
  dashboard: 'Dashboard',
  agents: 'Agents',
  'agent-labs': 'Agent Sandbox',
  'nvidia-labs': 'AI Lab',
  'voice-labs': 'Voice Labs',
  repository: 'Repository',
  credentials: 'Credentials',
  ops: 'Ops Lab',
}

function displayLabel(tab) {
  if (!tab) return 'the command center'
  return SECTION_LABELS[tab] || String(tab).split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function OperatorMarkdown({ text }) {
  const lines = String(text || '').split(/\r?\n/)
  return (
    <div className="operator-markdown">
      {lines.map((line, index) => {
        const heading = line.match(/^(#{1,3})\s+(.+)$/)
        if (heading) {
          const Heading = heading[1].length === 1 ? 'h4' : 'h5'
          return <Heading key={index}>{heading[2]}</Heading>
        }
        const bullet = line.match(/^[-*]\s+(.+)$/)
        if (bullet) return <div className="operator-markdown-list-item" key={index}><span aria-hidden="true">&bull;</span><span>{bullet[1]}</span></div>
        if (!line.trim()) return <div className="operator-markdown-spacer" key={index} aria-hidden="true" />
        return <p key={index}>{line}</p>
      })}
    </div>
  )
}

const DEFAULT_ACTIONS = [
  { label: 'Focus List', prompt: 'Use the current Command Center section and give me the next five things to handle.' },
  { label: 'Find Risk', prompt: 'Scan this section for confusing, overdue, risky, or incomplete items.' },
  { label: 'Walkthrough', prompt: 'Act like an onboarding wizard for this section. Walk me through the best workflow.' },
  { label: 'Knowledge', prompt: 'Draft or find the knowledge-base guidance this section needs.' },
]

const SECTION_ACTIONS = {
  dashboard: [
    { label: 'Today', prompt: 'Review the Command Center dashboard and tell me what deserves attention today.' },
    { label: 'Revenue', tab: 'finance', prompt: 'Open a finance mindset and summarize revenue, open invoices, and payment risk.' },
    { label: 'Follow-ups', tab: 'leads', prompt: 'Find the most important lead or client follow-ups to handle next.' },
    { label: 'Ops Check', tab: 'ops', prompt: 'Check production, Gitea, backups, and CI/CD status for anything that needs attention.' },
  ],
  switchboard: [
    { label: 'Live Calls', prompt: 'Review switchboard status. Which agents are in calls and which calls should be monitored first?' },
    { label: 'QA Notes', prompt: 'Create a quality-assurance note template for the active call or monitored agent.' },
    { label: 'Takeover Plan', prompt: 'If a call needs human takeover, give me the shortest safe intervention plan.' },
    { label: 'Consent Check', prompt: 'Check whether monitoring consent and opt-out status are clear for this agent.' },
  ],
  products: [
    { label: 'Create Product', prompt: 'Help me create a new standalone product entry. Ask only for the missing fields.' },
    { label: 'Price Check', prompt: 'Review this product pricing and explain the buyer justification in plain English.' },
    { label: 'Feature Fit', prompt: 'Turn this product into a clear buyer-facing feature and deliverable list.' },
    { label: 'Sales Copy', prompt: 'Draft concise sales copy for the selected product without sounding generic.' },
  ],
  repository: [
    { label: 'Repo Status', prompt: 'Review the repository and git status context. Tell me what is committed, pushed, live, and still dirty.' },
    { label: 'CI/CD Plan', prompt: 'Give me the exact CI/CD checklist for this repo before I promote anything further.' },
    { label: 'Commit Note', prompt: 'Draft a clean commit summary for the current Command Center work.' },
    { label: 'Rollback', prompt: 'Explain the safest rollback path if the latest production rollout misbehaves.' },
  ],
  ops: [
    { label: 'CI/CD', prompt: 'Review Ops Lab CI/CD items and tell me what is ready, blocked, or stale.' },
    { label: 'Backups', prompt: 'Check the backup and restore plan and flag anything missing before I sleep.' },
    { label: 'Voice Labs', tab: 'voice-labs', prompt: 'Open Voice Labs context and suggest the next useful agent voice test.' },
    { label: 'Repository', tab: 'repository', prompt: 'Open repository workspace context and help me inspect repo status.' },
  ],
  'voice-labs': [
    { label: 'Sandbox', prompt: 'Review the Voice Labs sandbox and suggest the next live-feel voice test.' },
    { label: 'Voice Pick', prompt: 'Help compare Gemini voices by quality, latency, cost, and client fit.' },
    { label: 'Cost View', prompt: 'Summarize provider cost tradeoffs for a client voice package.' },
    { label: 'Routing Plan', prompt: 'Explain what is configured versus actually live-routed for agent voices.' },
  ],
  network: [
    { label: 'Status', prompt: 'Review network status, tunnel health, and public ingress risks.' },
    { label: 'Solo/Multi', prompt: 'Explain the current solo or multi-user mode and what risk it changes.' },
    { label: 'APIs', prompt: 'Check API and provider configuration from the Network section and flag weak spots.' },
    { label: 'Tunnel Fix', prompt: 'Give me a safe tunnel restart checklist without breaking production calls.' },
  ],
  agents: [
    { label: 'Brain Check', prompt: 'Review the selected agent brain, model, tools, and permissions for anything mismatched.' },
    { label: 'Tool Gap', prompt: 'Find what tools this agent needs to operate the Command Center screen reliably.' },
    { label: 'Demo Prep', prompt: 'Make this agent demo-ready with a concise capability checklist.' },
    { label: 'Knowledge', prompt: 'Suggest the best knowledge base material for this agent specialty.' },
  ],
  'agent-labs': [
    { label: 'New Agent', prompt: 'Help me design a new agent with role, tools, guardrails, and demo script.' },
    { label: 'Tool Wiring', prompt: 'Map the tools this lab agent needs before it should be promoted.' },
    { label: 'Eval Plan', prompt: 'Create a simple real test plan for this agent without fake results.' },
    { label: 'Prompt Tighten', prompt: 'Tighten this agent prompt so it is short, reliable, and tool-aware.' },
  ],
  'nvidia-labs': [
    { label: 'Benchmark', prompt: 'Use AI Lab as the upper-level model benchmark workspace. Help me A/B test the selected provider APIs for quality, latency, cost, reliability, and agent fit.' },
    { label: 'Provider Fit', prompt: 'Compare selected providers as model routes. Treat NVIDIA as one provider lane, not the whole lab.' },
    { label: 'Cost/Latency', prompt: 'Summarize cost and latency tradeoffs for promoting a primary, fallback, and evaluator route.' },
    { label: 'Promote Route', prompt: 'Define what proof is required before this model/provider route should be used by an agent.' },
  ],
  leads: [
    { label: 'Next Calls', prompt: 'Find the lead follow-ups that should happen next and draft the call angle.' },
    { label: 'Email Draft', prompt: 'Draft a short follow-up email for the best lead in this section.' },
    { label: 'Pipeline Fit', prompt: 'Sort the visible leads by likely fit and urgency.' },
    { label: 'Clean Data', prompt: 'Find missing lead data that would block a good demo or follow-up.' },
  ],
  accounts: [
    { label: 'Open Account', prompt: 'Help me open or inspect an account and summarize the relationship.' },
    { label: 'Client Health', prompt: 'Rank client/account health and flag anything that needs attention.' },
    { label: 'Project Links', prompt: 'Connect this account to active projects, tasks, invoices, and notes.' },
    { label: 'Check-in', prompt: 'Draft a concise client check-in based on this account context.' },
  ],
  contacts: [
    { label: 'Find Person', prompt: 'Help me find the right contact and summarize why they matter.' },
    { label: 'Missing Info', prompt: 'List missing contact fields that would block outreach.' },
    { label: 'Outreach', prompt: 'Draft a short outreach message for the selected contact.' },
    { label: 'Relationship', prompt: 'Explain this contact relationship and related account context.' },
  ],
  pipelines: [
    { label: 'Deal Risk', prompt: 'Review the pipeline and flag deals at risk or stuck too long.' },
    { label: 'Next Move', prompt: 'Pick the best next move for each active opportunity.' },
    { label: 'Forecast', prompt: 'Estimate a practical forecast from the visible opportunities.' },
    { label: 'Close Plan', prompt: 'Create a concise close plan for the highest-value opportunity.' },
  ],
  projects: [
    { label: 'Project Health', prompt: 'Review active projects and identify blockers, overdue work, and next steps.' },
    { label: 'Scope Check', prompt: 'Check whether any project looks out of scope or underpriced.' },
    { label: 'Client Update', prompt: 'Draft a clean client update for the selected project.' },
    { label: 'Task Plan', prompt: 'Turn this project into the next practical task sequence.' },
  ],
  tasks: [
    { label: 'Prioritize', prompt: 'Prioritize the visible tasks by urgency, value, and dependency.' },
    { label: 'Clean List', prompt: 'Find duplicate, stale, or unclear tasks and suggest cleanup.' },
    { label: 'Today Plan', prompt: 'Make me a realistic task plan for the rest of today.' },
    { label: 'Delegate', prompt: 'Suggest which tasks should go to agents or automation.' },
  ],
  finance: [
    { label: 'Draft Invoice', prompt: 'Help me draft a clean invoice or payment request. Ask only for missing details.' },
    { label: 'A/R Risk', prompt: 'Find unpaid invoices, overdue payments, and revenue risks.' },
    { label: 'Price Model', prompt: 'Review pricing and explain what is included versus add-on.' },
    { label: 'Cash View', prompt: 'Summarize cash flow, recurring costs, and near-term finance concerns.' },
  ],
  documents: [
    { label: 'Proposal', prompt: 'Draft a practical proposal outline for a private Command Center implementation.' },
    { label: 'Contract Check', prompt: 'Review the selected document for missing business terms or risky wording.' },
    { label: 'Signature Flow', prompt: 'Walk me through the signature workflow and what the recipient sees.' },
    { label: 'License Fit', prompt: 'Match the right license template to the current buyer scenario.' },
  ],
  media: [
    { label: 'Find Asset', prompt: 'Help me find or organize the right media asset for the current product or page.' },
    { label: 'Cover Brief', prompt: 'Write a strong image brief for a product cover or command center card.' },
    { label: 'Alt Text', prompt: 'Create accessible alt text and usage notes for the selected image.' },
    { label: 'Brand Fit', prompt: 'Check whether this media matches the Command Center brand direction.' },
  ],
  phone: [
    { label: 'Call Prep', prompt: 'Create a short call prep brief and opening line.' },
    { label: 'Voicemail', prompt: 'Draft a concise voicemail and follow-up text.' },
    { label: 'Call Notes', prompt: 'Turn the last call context into clean CRM notes.' },
    { label: 'Next Step', prompt: 'Suggest the next action after this phone interaction.' },
  ],
  conference: [
    { label: 'Meeting Prep', prompt: 'Prepare the conference agenda and what I need to say first.' },
    { label: 'Invite Copy', prompt: 'Draft a short meeting invite with purpose and next step.' },
    { label: 'Follow-up', prompt: 'Draft the follow-up after this meeting.' },
    { label: 'Checklist', prompt: 'Give me the technical checklist before starting this conference.' },
  ],
  calendar: [
    { label: 'Today', prompt: 'Summarize today and flag scheduling conflicts or prep needs.' },
    { label: 'Book Time', prompt: 'Help me book a meeting and ask only for missing details.' },
    { label: 'Prep Brief', prompt: 'Create a prep brief for the next calendar event.' },
    { label: 'Follow-up', prompt: 'Find events that need follow-up or confirmation.' },
  ],
  notes: [
    { label: 'Summarize', prompt: 'Summarize the current notes into decisions, tasks, and open questions.' },
    { label: 'Knowledge', prompt: 'Convert these notes into knowledge-base guidance.' },
    { label: 'Action Items', prompt: 'Extract action items and assign the next owner where obvious.' },
    { label: 'Clean Up', prompt: 'Rewrite the current notes so they are easier to use later.' },
  ],
  domains: [
    { label: 'Renewals', prompt: 'Find domain renewals, SSL risks, and hosting issues that need attention.' },
    { label: 'DNS Check', prompt: 'Explain what DNS or Cloudflare checks should be run for this domain.' },
    { label: 'Client Map', prompt: 'Map domains to clients, projects, and operational risk.' },
    { label: 'Launch Path', prompt: 'Create a launch checklist for the selected domain.' },
  ],
  credentials: [
    { label: 'Key Health', prompt: 'Review credential health without exposing secrets and flag stale or failing keys.' },
    { label: 'Provider Map', prompt: 'Map API providers to the features that depend on them.' },
    { label: 'Rotation', prompt: 'Create a safe credential rotation checklist.' },
    { label: 'Cost Risk', prompt: 'Find API providers that may create cost or quota risk.' },
  ],
  settings: [
    { label: 'Theme Check', prompt: 'Review theme and interface settings for consistency and contrast.' },
    { label: 'Permissions', prompt: 'Review user roles and permissions for anything too open or too restrictive.' },
    { label: 'Defaults', prompt: 'Suggest safe defaults for new users and demos.' },
    { label: 'Audit', prompt: 'Find settings that should have audit coverage before demos.' },
  ],
  'voice-guide': [
    { label: 'What To Say', prompt: 'Show me the best voice commands for the current Command Center workflow.' },
    { label: 'Agent Tools', prompt: 'Explain which agent screen-control tools are available and what they do.' },
    { label: 'Troubleshoot', prompt: 'Help troubleshoot a voice command that says it is not wired.' },
    { label: 'Demo Script', prompt: 'Create a short voice-control demo script.' },
  ],
}

function actionsFor(tab) {
  return SECTION_ACTIONS[tab] || DEFAULT_ACTIONS
}

function SparkIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 9h8M8 13h5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 16l2 2 3-4" />
    </svg>
  )
}

function ToolIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M7 12h10M10 17h4" />
      <circle cx="8" cy="7" r="2" fill="currentColor" stroke="none" />
      <circle cx="15" cy="12" r="2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="2" fill="currentColor" stroke="none" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2L11 13" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  )
}

function DownIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  )
}

export default function OperatorPromptBar({ activeTab, operatorContext, hidden = false, onHide, rightRailCollapsed = true }) {
  const [text, setText] = useState('')
  const [mode, setMode] = useState('ask')
  const [doMessages, setDoMessages] = useState([])
  const [toolEvents, setToolEvents] = useState([])
  const [proposal, setProposal] = useState(null)
  const [doBusy, setDoBusy] = useState(false)
  const [conversationId, setConversationId] = useState('')
  const conversationRef = useRef(null)
  const context = operatorContext || { tab: activeTab }
  const workspaceLabel = context.label || displayLabel(context.tab || activeTab)
  const quickActions = useMemo(() => actionsForContext(context), [context])
  const actions = useMemo(() => operatorToolsForContext(context), [context])
  const utilityActions = useMemo(() => utilityActionsForContext(context), [context])

  useEffect(() => {
    let id = localStorage.getItem('fcc-operator-conversation-id') || ''
    if (!id) {
      id = `operator-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
      localStorage.setItem('fcc-operator-conversation-id', id)
    }
    setConversationId(id)
  }, [])

  useEffect(() => {
    conversationRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' })
  }, [doMessages, toolEvents, proposal])

  const runOperator = async (prompt, approvalToken = '') => {
    const value = String(prompt || '').trim()
    if (!value || doBusy || !conversationId) return
    const next = [...doMessages, { role: 'user', content: value }]
    setDoMessages(next)
    setText('')
    setDoBusy(true)
    if (approvalToken || !/^edit\b/i.test(value)) setProposal(null)
    try {
      const response = await fetch('/api/agent/operator', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversationId, messages: next, operatorContext: context, approvalToken: approvalToken || undefined }),
      })
      if (!response.ok || !response.body) throw new Error(`Operator route returned HTTP ${response.status}`)
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value: chunk } = await reader.read()
        if (done) break
        buffer += decoder.decode(chunk, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.split('\n').find(item => item.startsWith('data: '))
          if (!line) continue
          const event = JSON.parse(line.slice(6))
          if (event.type === 'message') setDoMessages(items => [...items, { role: 'assistant', content: event.text }])
          else if (event.type === 'proposal') setProposal(event.proposal)
          else if (event.type === 'tool_start' || event.type === 'tool_result' || event.type === 'tool_error') setToolEvents(items => [...items, event].slice(-24))
          else if (event.type === 'error') setDoMessages(items => [...items, { role: 'assistant', content: `Operator error: ${event.error}` }])
        }
      }
    } catch (error) {
      setDoMessages(items => [...items, { role: 'assistant', content: `Operator error: ${error.message}` }])
    } finally {
      setDoBusy(false)
    }
  }

  useEffect(() => {
    if (!conversationId) return undefined
    let cancelled = false
    const poll = async () => {
      if (cancelled || doBusy) return
      try {
        const response = await fetch('/api/agent/operator/pending', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!cancelled && response.ok && data.pending?.transcript) {
          setMode('do')
          await runOperator(data.pending.transcript)
        }
      } catch {}
    }
    poll()
    const timer = setInterval(poll, 4000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [conversationId, doBusy])

  const sendPrompt = (prompt = text, tab, role = '', label = '') => {
    const value = String(prompt || '').trim()
    if (!value) return
    if (mode === 'do') {
      runOperator(value)
      return
    }
    if (tab) window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: tab }))
    window.dispatchEvent(new CustomEvent('fcc:ai-prompt', {
      detail: {
        prompt: value,
        open: true,
        autoSend: true,
        operatorTool: role ? { role, label: label || role } : null,
        section: tab || context.tab || activeTab,
        operatorContext: { ...context, ...(tab ? { tab } : {}) },
      },
    }))
    setText('')
  }

  if (hidden) return null

  return (
    <div className="operator-prompt-wrap" data-rail={rightRailCollapsed ? 'compact' : 'open'} aria-label="Operator command bar">
      <div className="operator-prompt-card">
        <div className="operator-mode-row" aria-label="Maggie mode">
          <div className="operator-mode-switch" role="group" aria-label="Ask or Do">
            <button type="button" className={mode === 'ask' ? 'is-active' : ''} aria-pressed={mode === 'ask'} onClick={() => setMode('ask')}>Ask</button>
            <button type="button" className={mode === 'do' ? 'is-active' : ''} aria-pressed={mode === 'do'} onClick={() => setMode('do')}>Do</button>
          </div>
          <span>{mode === 'ask' ? 'Advice and answers' : 'Operator agent - actions stop for approval'}</span>
        </div>
        {mode === 'do' && (doMessages.length > 0 || toolEvents.length > 0 || proposal) && (
          <div className="operator-do-conversation" aria-live="polite">
            {doMessages.slice(-10).map((message, index) => (
              <div key={`message-${index}`} className={`operator-do-message is-${message.role}`}>
                <strong>{message.role === 'user' ? 'You' : 'Maggie'}</strong>
                <span>{message.content}</span>
              </div>
            ))}
            {toolEvents.slice(-8).map((event, index) => (
              <div key={`tool-${index}`} className={`operator-tool-row is-${event.type}`}>
                <code>{event.tool}</code>
                {event.type === 'tool_start' && event.tool === 'doc.write' && event.inputs?.body
                  ? <OperatorMarkdown text={event.inputs.body} />
                  : <span>{event.type === 'tool_start' ? JSON.stringify(event.inputs || {}) : event.summary || event.error || 'Completed'}</span>}
              </div>
            ))}
            {proposal && (
              <div className="operator-proposal-card" data-testid="operator-proposal-card">
                <div><strong>I'm about to:</strong> {proposal.summary}</div>
                <div className="operator-proposal-meta">{proposal.sideEffects} - est. cost ${Number(proposal.cost?.usd || 0).toFixed(2)} - {proposal.cost?.label}</div>
                <pre>{JSON.stringify(proposal.inputs, null, 2)}</pre>
                <div className="operator-proposal-actions">
                  <button type="button" disabled={doBusy} onClick={() => runOperator('go', proposal.approvalToken)}>Go</button>
                  <button type="button" disabled={doBusy} onClick={() => setText(`Edit ${proposal.tool}: ${JSON.stringify(proposal.inputs)}`)}>Edit</button>
                  <button type="button" disabled={doBusy} onClick={() => runOperator('skip')}>Skip</button>
                </div>
              </div>
            )}
            {doBusy && <div className="operator-do-working">Maggie is working...</div>}
            <div ref={conversationRef} />
          </div>
        )}
        {mode === 'ask' && <div className="operator-prompt-chiprow" aria-label="AI Wizard quick prompts">
          <span className="operator-prompt-label"><SparkIcon /> Quick prompts</span>
          {quickActions.map(action => (
            <button key={action.label} type="button" title={action.prompt} onClick={() => sendPrompt(action.prompt, action.tab)}>
              {action.label}
            </button>
          ))}
        </div>}
        {mode === 'ask' && <div className="operator-prompt-chiprow">
          <span className="operator-prompt-label"><ToolIcon /> Operator tools</span>
          {actions.map(action => (
            <button key={action.label} type="button" title={action.role || action.label} onClick={() => sendPrompt(action.prompt, action.tab, action.role, action.label)}>
              {action.label}
            </button>
          ))}
        </div>}
        <div className="operator-prompt-input">
          <div className="operator-prompt-tools" aria-label="Composer tools">
            <button type="button" title={utilityActions.attach.label} onClick={() => sendPrompt(utilityActions.attach.prompt)}>
              <PlusIcon />
            </button>
            <button type="button" title={utilityActions.tools.label} onClick={() => sendPrompt(utilityActions.tools.prompt)}>
              <ToolIcon />
            </button>
          </div>
          <textarea
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendPrompt()
              }
            }}
            placeholder={mode === 'ask' ? `Ask Maggie about ${workspaceLabel}...` : `Tell Maggie what you want done in ${workspaceLabel}...`}
          />
          <div className="operator-prompt-submit-stack">
            <button className="operator-prompt-hide" type="button" onClick={onHide} aria-label="Hide command bar" title="Hide command bar">
              <DownIcon />
            </button>
            <button className="operator-send" type="button" onClick={() => sendPrompt()} disabled={!text.trim() || (mode === 'do' && doBusy)} aria-label={mode === 'do' ? 'Run operator request' : 'Send prompt'}>
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
