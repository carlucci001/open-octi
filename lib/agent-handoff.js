const HANDOFFS = {
  matilda: {
    tab: 'dashboard',
    title: 'Matilda Handoff',
    preview: 'Primary command voice. Start from the dashboard and route to the live operating context.',
    intent: 'General command-center control',
    prompts: ['Summarize the current workspace', 'Show the highest-priority next action'],
  },
  main: {
    tab: 'dashboard',
    title: 'Maggie Handoff',
    preview: 'Office operations, priorities, invoices, tasks, projects, and day-to-day CRM follow-through.',
    intent: 'Office management',
    prompts: ['What should I focus on next?', 'Check overdue work and stalled opportunities'],
  },
  coding: {
    tab: 'ops',
    title: 'Craig Handoff',
    preview: 'Engineering/admin support opens at Ops Lab so backups, Gitea, CI/CD, production health, and repo status are visible.',
    intent: 'Engineering, repository, and operations support',
    prompts: ['Check production, Gitea, backups, and CI/CD status', 'Review the latest repo risk'],
  },
  'finance-manager': {
    tab: 'finance',
    subtab: 'invoices',
    title: 'Frank Handoff',
    preview: 'Finance support opens at invoices so billing, receivables, payments, and cash-flow work are immediately in view.',
    intent: 'Finance and billing',
    prompts: ['Review open invoices', 'Summarize cash-flow risks'],
  },
  'social-media': {
    tab: 'media',
    title: 'Sasha Handoff',
    preview: 'Creative support opens at Media for generated assets, campaign visuals, social images, and client-ready collateral.',
    intent: 'Creative and social media',
    prompts: ['Draft a social post from this context', 'Find or create campaign media'],
  },
  legal: {
    tab: 'documents',
    title: 'Linda Handoff',
    preview: 'Legal review opens at Documents so contracts, templates, signature packets, and clause notes are ready.',
    intent: 'Legal and contracts',
    prompts: ['Review this document for risk', 'Prepare contract notes'],
  },
  communications: {
    tab: 'feed',
    title: 'Cameron Handoff',
    preview: 'Communications opens at Feed so recent messages, updates, and activity can drive the response.',
    intent: 'Messaging and communications',
    prompts: ['Draft the next reply', 'Summarize recent communications'],
  },
  'ContentStudio-promoter': {
    tab: 'media',
    title: 'Mark Handoff',
    preview: 'Marketing support opens at Media for long-form campaign assets, press material, and buyer-facing creative.',
    intent: 'Marketing and long-form content',
    prompts: ['Draft campaign copy', 'Turn this into a sales page outline'],
  },
  doreen: {
    tab: 'feed',
    title: 'Doreen Handoff',
    preview: 'Reception and concierge work opens at Feed so recent calls, form activity, messages, and handoff notes are visible.',
    intent: 'Reception and lead intake',
    prompts: ['Review recent Doreen activity', 'Prepare follow-up from the last call'],
  },
  diane: {
    tab: 'feed',
    title: 'Diane Handoff',
    preview: 'Morning brief opens at Feed where Diane reads recent activity, stale messages, follow-ups, and operational drift.',
    intent: 'Morning brief and status',
    prompts: ['Give me the morning brief', 'List today’s risks and priorities'],
  },
}

const NAME_ALIASES = {
  matilda: 'matilda',
  maggie: 'main',
  craig: 'coding',
  frank: 'finance-manager',
  frankie: 'finance-manager',
  sasha: 'social-media',
  linda: 'legal',
  cameron: 'communications',
  mark: 'ContentStudio-promoter',
  doreen: 'doreen',
  dian: 'diane',
  diane: 'diane',
  morning: 'diane',
  'morning-brief': 'diane',
  'morning brief': 'diane',
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\b(agent|assistant|team|department|person)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveAgentHandoffKey(agent = {}) {
  const candidates = [agent.id, agent.firstName, agent.name, agent.role, agent.category]
    .map(normalize)
    .filter(Boolean)
  for (const value of candidates) {
    if (HANDOFFS[value]) return value
    if (NAME_ALIASES[value]) return NAME_ALIASES[value]
    const word = value.split(/\s+/).find(part => NAME_ALIASES[part])
    if (word) return NAME_ALIASES[word]
  }
  return null
}

export function buildAgentHandoffPayload(agent = {}, reason = '') {
  const key = resolveAgentHandoffKey(agent)
  const base = HANDOFFS[key] || {
    tab: '',
    title: `${agent.firstName || agent.name || 'Agent'} Handoff`,
    preview: 'No dedicated workspace is configured for this agent yet. Keep the current screen and use visible context.',
    intent: agent.role || 'Agent handoff',
    prompts: ['Summarize this agent’s current role', 'Prepare a test script for this agent'],
  }
  const preview = String(base.preview || '').trim()
  return {
    tab: base.tab,
    subtab: base.subtab || '',
    title: base.title,
    preview: preview.length > 96 ? preview.slice(0, 93) + '...' : preview,
    intent: base.intent || '',
    agentId: agent.id || key || '',
    agentName: agent.firstName || agent.name || base.title.replace(/\s+Handoff$/, ''),
    reason: String(reason || '').trim(),
  }
}
