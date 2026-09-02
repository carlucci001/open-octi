'use client'

const DEFAULT_ACTIONS = [
  { label: 'Focus List', prompt: 'Use the current Command Center context and give me the next five things to handle.' },
  { label: 'Find Risk', prompt: 'Scan the current section, selected record, and open subtab for confusing, overdue, risky, or incomplete items.' },
  { label: 'Walkthrough', prompt: 'Act like an onboarding wizard for this exact section and subtab. Walk me through the best workflow.' },
  { label: 'Knowledge', prompt: 'Draft or find the knowledge-base guidance this screen and selected record need.' },
]

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
  if (!tab) return ''
  return SECTION_LABELS[tab] || String(tab).split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

const SECTION_ACTIONS = {
  leads: [
    { label: 'Next Calls', prompt: 'Use the current Leads view, filters, and selected lead context. Find the follow-ups that should happen next and draft the call angle.' },
    { label: 'Email Draft', prompt: 'Draft a short follow-up email for the selected or most urgent visible lead.' },
    { label: 'Pipeline Fit', prompt: 'Sort the visible leads by likely fit and urgency. Explain the top three.' },
    { label: 'Clean Data', prompt: 'Find missing lead data that would block a good demo or follow-up.' },
  ],
  'agent-labs': [
    { label: 'New Agent', prompt: 'Help me design this lab agent with role, model route, tools, guardrails, and a demo script.' },
    { label: 'Tool Wiring', prompt: 'Map the tools this lab agent needs before it should be promoted.' },
    { label: 'Eval Plan', prompt: 'Create a real test plan for this agent without fake results.' },
    { label: 'Prompt Tighten', prompt: 'Tighten this agent prompt so it is short, reliable, and tool-aware.' },
  ],
  'nvidia-labs': [
    { label: 'Benchmark', prompt: 'Use AI Lab as the umbrella. Design a provider A/B test across the selected APIs with quality, latency, cost, failure-rate, and agent-fit criteria.' },
    { label: 'Provider Fit', prompt: 'Compare the selected providers as interchangeable model routes, with NVIDIA treated as one provider lane rather than the whole lab.' },
    { label: 'Cost/Latency', prompt: 'Estimate which provider route should be primary, fallback, or evaluator based on speed, cost, reliability, and client value.' },
    { label: 'Promote Route', prompt: 'Define what evidence is required before a model/provider route can be promoted into an agent workflow.' },
  ],
  finance: [
    { label: 'Draft Invoice', prompt: 'Use the current Finance subtab and selected account context. Help draft a clean invoice or payment request. Ask only for missing details.' },
    { label: 'A/R Risk', prompt: 'Find unpaid invoices, overdue payments, and revenue risks in this Finance view.' },
    { label: 'Cost Risk', prompt: 'Review recurring costs, provider spend, and renewal risks from this Finance context.' },
    { label: 'Cash View', prompt: 'Summarize cash flow, recurring costs, and near-term finance concerns.' },
  ],
  accounts: [
    { label: 'Account Brief', prompt: 'Use the selected account and current subtab. Summarize the relationship, open work, money, and next step.' },
    { label: 'Check-in', prompt: 'Draft a concise client check-in based on this account context.' },
    { label: 'Project Links', prompt: 'Connect this account to active projects, tasks, invoices, and notes.' },
    { label: 'Health Risk', prompt: 'Flag anything risky or stale about this account.' },
  ],
  agents: [
    { label: 'Brain Check', prompt: 'Review the selected agent brain, model, tools, voice, and permissions for mismatches.' },
    { label: 'Tool Gap', prompt: 'Find what tools this agent needs to operate the current Command Center workflow reliably.' },
    { label: 'Demo Prep', prompt: 'Make this agent demo-ready with a concise capability checklist.' },
    { label: 'Guardrails', prompt: 'List the approval gates and limits this agent needs before leasing.' },
  ],
  repository: [
    { label: 'Repo Status', prompt: 'Review repository context. Tell me what is committed, pushed, live, dirty, and still staged only.' },
    { label: 'CI/CD Plan', prompt: 'Give me the exact CI/CD checklist before promotion.' },
    { label: 'Commit Note', prompt: 'Draft a clean commit summary for the current work.' },
    { label: 'Rollback', prompt: 'Explain the safest rollback path if the latest rollout misbehaves.' },
  ],
}

const DEFAULT_OPERATOR_TOOLS = [
  { label: 'Triage', role: 'Command Center triage operator', prompt: 'Act as the Command Center triage operator for this exact screen. Identify the highest-value action, the blocking unknowns, and the safest next move.' },
  { label: 'Draft', role: 'Business drafting operator', prompt: 'Act as the drafting operator for this screen. Produce the message, note, checklist, or client-facing copy that fits the visible context.' },
  { label: 'Verify', role: 'QA and verification operator', prompt: 'Act as the verification operator. Check the current context for broken assumptions, missing proof, stale data, or actions that need confirmation.' },
  { label: 'Delegate', role: 'Agent delegation operator', prompt: 'Act as the delegation operator. Recommend which agent, tool, or workflow should handle this next and define the handoff clearly.' },
]

const SECTION_OPERATOR_TOOLS = {
  dashboard: [
    { label: 'Daily Desk', role: 'executive daily desk operator', prompt: 'Act as the daily desk operator. Turn this dashboard into a short command brief: what matters now, what can wait, and what should be delegated.' },
    { label: 'Revenue Watch', role: 'revenue operations operator', prompt: 'Act as the revenue watch operator. Use this dashboard context to look for money, renewal, invoice, and pipeline concerns.' },
    { label: 'Ops Watch', role: 'production operations operator', prompt: 'Act as the ops watch operator. Look for production, CI/CD, backup, and demo-readiness issues that should be checked next.' },
  ],
  leads: [
    { label: 'Lead Desk', role: 'lead qualification operator', prompt: 'Act as the lead desk operator. Qualify the visible or selected lead, choose the next outreach angle, and draft the first action.' },
    { label: 'Outreach', role: 'sales outreach operator', prompt: 'Act as the outreach operator. Draft the best email, call opener, or follow-up for this lead context.' },
    { label: 'Data Clean', role: 'lead data hygiene operator', prompt: 'Act as the lead data hygiene operator. Find missing fields, duplicate clues, and anything blocking a clean follow-up.' },
  ],
  accounts: [
    { label: 'Account Desk', role: 'account manager operator', prompt: 'Act as the account desk operator. Brief this account, relationship health, money status, open work, and next step.' },
    { label: 'Client Note', role: 'client communications operator', prompt: 'Act as the client communications operator. Draft a clean check-in or status note from the current account context.' },
    { label: 'Risk Review', role: 'client risk operator', prompt: 'Act as the client risk operator. Flag stale work, unclear ownership, money risk, or relationship risk.' },
  ],
  agents: [
    { label: 'Agent QA', role: 'agent QA operator', prompt: 'Act as the agent QA operator. Check this agent for model, tools, permissions, prompt, voice, and demo-readiness mismatches.' },
    { label: 'Tool Fit', role: 'agent tool architect', prompt: 'Act as the agent tool architect. Map the exact Command Center tools this agent needs to operate reliably in this department.' },
    { label: 'Lease Prep', role: 'agent leasing operator', prompt: 'Act as the leasing operator. Turn this agent into a client-ready offer with guardrails, proof points, and approval gates.' },
  ],
  'agent-labs': [
    { label: 'Lab QA', role: 'agent lab evaluator', prompt: 'Act as the lab evaluator. Define the next real test, expected evidence, pass/fail criteria, and promotion risk for this lab agent.' },
    { label: 'Harness', role: 'agent test harness operator', prompt: 'Act as the test harness operator. Design a practical benchmark for this agent using only real capabilities and measurable outputs.' },
    { label: 'Promote', role: 'agent promotion architect', prompt: 'Act as the promotion architect. List what must be true before this lab agent moves into production or client demo.' },
  ],
  'nvidia-labs': [
    { label: 'Benchmark', role: 'AI model benchmark operator', prompt: 'Act as the benchmark operator. Design a real comparison run for this provider/model choice with latency, quality, cost, and fit criteria.' },
    { label: 'CVA', role: 'cost benefit analysis operator', prompt: 'Act as the CVA operator. Compare the visible model/provider options for client value, budget fit, and operational risk.' },
    { label: 'Connector Fit', role: 'AI connector architect', prompt: 'Act as the connector architect. Recommend which connectors and endpoint shape this model setup needs before client use.' },
  ],
  finance: [
    { label: 'Invoice Desk', role: 'invoice operations operator', prompt: 'Act as the invoice desk operator. Help create, inspect, or follow up on the right invoice using this Finance context.' },
    { label: 'A/R Watch', role: 'accounts receivable operator', prompt: 'Act as the A/R operator. Identify overdue, unpaid, stalled, or unclear payment items and draft the next action.' },
    { label: 'Cost Control', role: 'cost control operator', prompt: 'Act as the cost control operator. Review provider spend, recurring costs, and budget risk for this context.' },
  ],
  repository: [
    { label: 'Release Desk', role: 'release manager operator', prompt: 'Act as the release desk operator. Summarize dirty, staged, committed, live, Gitea, and GitHub status without inventing anything.' },
    { label: 'CI Check', role: 'CI/CD verification operator', prompt: 'Act as the CI/CD verification operator. Produce the promotion checklist and identify what proof is still missing.' },
    { label: 'Rollback', role: 'production rollback operator', prompt: 'Act as the rollback operator. Define the safest rollback path for the current deployed Command Center state.' },
  ],
  notes: [
    { label: 'Knowledge Desk', role: 'Command Vault knowledge operator', prompt: 'Act as the knowledge desk operator. Use this Command Vault context to identify useful notes, gaps, orphan notes, and what should become reusable guidance.' },
    { label: 'Link Notes', role: 'knowledge graph operator', prompt: 'Act as the knowledge graph operator. Suggest which visible notes should be linked, merged, renamed, or promoted into documentation.' },
    { label: 'Dev Memory', role: 'developer memory operator', prompt: 'Act as the developer memory operator. Turn this vault context into a concise project memory, decisions list, and next actions.' },
  ],
  ops: [
    { label: 'Prod Watch', role: 'production operations operator', prompt: 'Act as the production operations operator. Review what should be checked for service health, logs, backups, and demo safety.' },
    { label: 'Voice QA', role: 'voice operations operator', prompt: 'Act as the voice operations operator. Check voice-agent readiness, session risk, cost risk, and what should be tested next.' },
    { label: 'Incident Desk', role: 'incident response operator', prompt: 'Act as the incident desk operator. Build a calm triage path for the current operations concern.' },
  ],
  documents: [
    { label: 'Doc Draft', role: 'document drafting operator', prompt: 'Act as the document drafting operator. Draft or revise the document artifact that fits the selected template and business context.' },
    { label: 'Terms Check', role: 'contract terms operator', prompt: 'Act as the terms-check operator. Identify missing business terms, approval gates, and risky wording.' },
    { label: 'Send Prep', role: 'signature workflow operator', prompt: 'Act as the signature workflow operator. Prepare the recipient flow, email copy, and final review checklist.' },
  ],
  credentials: [
    { label: 'Key Audit', role: 'credential audit operator', prompt: 'Act as the credential audit operator. Review provider health and usage without exposing secrets; flag stale, failing, or risky keys.' },
    { label: 'Provider Map', role: 'provider dependency operator', prompt: 'Act as the provider dependency operator. Map which features depend on the visible API/provider setup and what would fail if one breaks.' },
    { label: 'Rotate Plan', role: 'secret rotation operator', prompt: 'Act as the secret rotation operator. Create a safe rotation plan that does not expose secret values.' },
  ],
}

function labelFor(ctx) {
  const parts = []
  if (ctx?.tab) parts.push(ctx.label || displayLabel(ctx.tab))
  if (ctx?.subtab) parts.push(ctx.subtab)
  if (ctx?.mode) parts.push(ctx.mode)
  if (ctx?.recordName) parts.push(ctx.recordName)
  return parts.join(' / ') || 'current screen'
}

export function actionsForContext(ctx = {}) {
  const base = SECTION_ACTIONS[ctx.tab] || DEFAULT_ACTIONS
  const scope = labelFor(ctx)
  const contextual = []

  if (ctx.mode === 'new' || ctx.mode === 'edit') {
    contextual.push({
      label: ctx.mode === 'new' ? 'Fill Draft' : 'Validate Edit',
      prompt: `Use the ${scope} context. Find missing fields, risky fields, and the safest next save step.`,
    })
  }

  if (ctx.recordName || ctx.recordId) {
    contextual.push({
      label: 'Selected Record',
      prompt: `Use the selected ${ctx.recordType || 'record'} "${ctx.recordName || ctx.recordId}" and current ${scope} context. Summarize what matters and the next action.`,
    })
  }

  if (ctx.subtab) {
    contextual.push({
      label: 'Subtab Help',
      prompt: `I am in ${scope}. Explain what this subtab is for, what buttons matter, and what I should check next.`,
    })
  }

  return [...contextual, ...base].slice(0, 4)
}

export function utilityActionsForContext(ctx = {}) {
  const scope = labelFor(ctx)
  return {
    attach: {
      label: 'Use context',
      prompt: `Use the full ${scope} context, including selected record, visible subtab, open form mode, and related data. Ask me only for missing details.`,
    },
    tools: {
      label: 'Screen tools',
      prompt: `For ${scope}, show the useful buttons, filters, commands, and agent tools. Explain what each one does and what is safe to run now.`,
    },
  }
}

export function operatorToolsForContext(ctx = {}) {
  const scope = labelFor(ctx)
  const base = SECTION_OPERATOR_TOOLS[ctx.tab] || DEFAULT_OPERATOR_TOOLS
  const contextual = []

  if (ctx.recordName || ctx.recordId) {
    contextual.push({
      label: 'Record Tool',
      role: `${ctx.recordType || 'record'} operator`,
      prompt: `Act as the ${ctx.recordType || 'record'} operator for "${ctx.recordName || ctx.recordId}". Use the ${scope} context to decide what action this record needs next.`,
    })
  }

  if (ctx.subtab) {
    contextual.push({
      label: 'Subtab Tool',
      role: `${ctx.subtab} operator`,
      prompt: `Act as the specialist operator for ${scope}. Focus only on what this subtab is responsible for, the tools available here, and the next useful action.`,
    })
  }

  return [...contextual, ...base].slice(0, 4)
}
