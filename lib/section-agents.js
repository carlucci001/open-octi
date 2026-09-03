// Single source of truth for which agent "waits" in each Command Center section
// and what quick actions the AI Wizard offers there. Consumed by:
//   - app/components/ChatPanel.js  (display: avatar, name, role, intro, quick prompts)
//   - app/api/agent/openclaw-chat/route.js  (answers in that agent's voice)
// avatarKey maps into CURATED_AGENT_AVATARS in ChatPanel; the API ignores it.

export const SECTION_AGENTS = {
  default: {
    label: 'Command Center', agentId: 'main', name: 'Maggie', role: 'CRM Assistant', avatarKey: 'main',
    intro: 'Maggie is using the current workspace context.',
    prompts: [
      'What should I focus on right now?',
      'Summarize what is on this screen in 3 bullets',
      'What needs my attention across the CRM today?',
      'Draft my next action from what is in front of me',
    ],
  },
  dashboard: {
    label: 'Dashboard', agentId: 'main', name: 'Maggie', role: 'CRM Assistant', avatarKey: 'main',
    intro: 'Maggie is reading your dashboard.',
    prompts: [
      'What should I focus on today?',
      'Summarize my pipeline health in 3 bullets',
      'Which leads are overdue for follow-up?',
      'What was my revenue the last 30 days?',
    ],
  },
  feed: {
    label: 'Feed', agentId: 'morning-brief', name: 'Diane', role: 'Morning Brief', avatarKey: 'morningBrief',
    intro: 'Diane is reading your activity feed.',
    prompts: [
      'Give me a 30-second brief of what happened recently',
      'What changed since yesterday I should know about?',
      'Flag anything in the feed that needs a reply',
      'Turn the latest activity into my to-do list',
    ],
  },
  leads: {
    label: 'Leads', agentId: 'main', name: 'Maggie', role: 'Sales Assistant', avatarKey: 'main',
    intro: 'Maggie is working your leads.',
    prompts: [
      'Which leads have I not contacted in 7+ days?',
      'Draft a follow-up for my oldest interested lead',
      'Find leads missing a phone number or email',
      'Who are my hottest leads to call first?',
    ],
  },
  'lead-intake': {
    label: 'Lead Intake', agentId: 'main', name: 'Maggie', role: 'Intake Assistant', avatarKey: 'main',
    intro: 'Maggie is helping you capture this lead.',
    prompts: [
      'Capture a new lead from what I paste here',
      'What fields am I missing on this intake?',
      'Suggest the right pipeline and stage for this lead',
      'Draft a first-touch message for this new lead',
    ],
  },
  pipelines: {
    label: 'Pipelines', agentId: 'main', name: 'Maggie', role: 'Pipeline Assistant', avatarKey: 'main',
    intro: 'Maggie is reading your pipeline.',
    prompts: [
      'Which deals are stuck and need a nudge?',
      'What is my pipeline value by stage?',
      'Which opportunities are likely to close this month?',
      'Draft next steps for my top open deal',
    ],
  },
  accounts: {
    label: 'Accounts', agentId: 'main', name: 'Maggie', role: 'Accounts Assistant', avatarKey: 'main',
    intro: 'Maggie is reading your accounts.',
    prompts: [
      'Which accounts have gone quiet recently?',
      'Who are my top accounts by lifetime value?',
      'Draft a check-in to an inactive account',
      'Summarize this account\'s open projects and invoices',
    ],
  },
  contacts: {
    label: 'Contacts', agentId: 'main', name: 'Maggie', role: 'Contacts Assistant', avatarKey: 'main',
    intro: 'Maggie is reading your contacts.',
    prompts: [
      'Find contacts missing phone or email',
      'Who have I not spoken to in over a month?',
      'Draft a reconnect message for a cold contact',
      'Find duplicate or incomplete contact records',
    ],
  },
  projects: {
    label: 'Projects', agentId: 'main', name: 'Maggie', role: 'Projects Assistant', avatarKey: 'main',
    intro: 'Maggie is tracking your projects.',
    prompts: [
      'Which projects are behind or at risk?',
      'Summarize status across all active projects',
      'What is blocking my most important project?',
      'Draft a client update for this project',
    ],
  },
  tasks: {
    label: 'Tasks', agentId: 'main', name: 'Maggie', role: 'Tasks Assistant', avatarKey: 'main',
    intro: 'Maggie is organizing your tasks.',
    prompts: [
      'What is overdue and what is due today?',
      'Prioritize my open tasks for me',
      'Turn my notes into tasks',
      'What can I safely push to next week?',
    ],
  },
  calendar: {
    label: 'Calendar', agentId: 'communications', name: 'Cameron', role: 'Scheduling Operator', avatarKey: 'communications',
    intro: 'Cameron is reading your calendar.',
    prompts: [
      'What is on my calendar today and tomorrow?',
      'Find a free hour this week for a demo',
      'Draft an invite for a client call',
      'What meetings can I move or decline?',
    ],
  },
  finance: {
    label: 'Finance', agentId: 'finance-manager', name: 'Frank', role: 'Finance Manager', avatarKey: 'finance',
    intro: 'Frank is using the current Finance context.',
    prompts: [
      'Help me draft a clean invoice or payment request. Ask only for missing details.',
      'Find unpaid invoices, overdue payments, and revenue risks in this Finance view.',
      'Review recurring costs, provider spend, and renewal risks from this Finance context.',
      'Summarize cash flow, recurring costs, receivables, and near-term finance concerns.',
    ],
  },
  domains: {
    label: 'Domains', agentId: 'coding', name: 'Craig', role: 'Infrastructure Operator', avatarKey: 'coding',
    intro: 'Craig is reading your domain inventory.',
    prompts: [
      'Which domains expire in the next 30 days?',
      'Find domains with no SSL or unknown hosting',
      'List domains with auto-renew off',
      'Which domains are parked and not earning?',
    ],
  },
  credentials: {
    label: 'Credentials', agentId: 'coding', name: 'Craig', role: 'Keys & Billing Operator', avatarKey: 'coding',
    intro: 'Craig is reviewing your credentials.',
    prompts: [
      'Which API keys have low credits remaining?',
      'Test all my keys and report which fail',
      'Summarize my monthly API spend across providers',
      'What credentials haven\'t been tested recently?',
    ],
  },
  documents: {
    label: 'Documents', agentId: 'legal', name: 'Linda', role: 'Legal Documents Operator', avatarKey: 'legal',
    intro: 'Linda is using the current Documents context.',
    prompts: [
      'Draft a contract or agreement from a template',
      'Which documents are awaiting a client response?',
      'Summarize the key terms in this document',
      'What documents still need a signature?',
    ],
  },
  products: {
    label: 'Products', agentId: 'ContentHub-promoter', name: 'Mark', role: 'Product Promoter', avatarKey: 'promoter',
    intro: 'Mark is using the current Products context.',
    prompts: [
      'Help me create a new standalone product',
      'Review this pricing from the buyer\'s perspective',
      'Explain what is included versus an add-on',
      'Draft product card copy for the catalog',
    ],
  },
  switchboard: {
    label: 'Switchboard', agentId: 'communications', name: 'Cameron', role: 'Switchboard Operator', avatarKey: 'communications',
    intro: 'Cameron is watching the switchboard.',
    prompts: [
      'Which agents are live or in a call right now?',
      'Build a QA note for the call I am monitoring',
      'What should I check before taking over a call?',
      'Confirm monitoring consent and opt-out status',
    ],
  },
  agents: {
    label: 'Agents', agentId: 'coding', name: 'Craig', role: 'Agent Engineer', avatarKey: 'coding',
    intro: 'Craig is inspecting your agents.',
    prompts: [
      'Check the selected agent\'s brain and tools',
      'Which tools are missing for screen control?',
      'Make this agent demo-ready',
      'Suggest knowledge base material for this agent',
    ],
  },
  'agent-labs': {
    label: 'Agent Lab', agentId: 'coding', name: 'Craig', role: 'Agent Lab Engineer', avatarKey: 'coding',
    intro: 'Craig is in the agent lab.',
    prompts: [
      'Help me design a new agent for a client',
      'What persona and tools fit this use case?',
      'Compare two agent setups for me',
      'Draft a test script to validate this agent',
    ],
  },
  'nvidia-labs': {
    label: 'AI Lab', agentId: 'coding', name: 'Craig', role: 'AI Lab Engineer', avatarKey: 'coding',
    intro: 'Craig is in the AI lab.',
    prompts: [
      'Which model fits this task best by cost and speed?',
      'Explain what is configured versus live-routed here',
      'Suggest the next model to test',
      'Compare provider options for this workload',
    ],
  },
  repository: {
    label: 'Repository', agentId: 'coding', name: 'Craig', role: 'Repository Operator', avatarKey: 'coding',
    intro: 'Craig is reading the repository.',
    prompts: [
      'Summarize repo, commit, push, and live status',
      'Give me the CI/CD checklist before promotion',
      'Draft a commit message for this work',
      'Explain the safest rollback path',
    ],
  },
  media: {
    label: 'Media', agentId: 'social-media', name: 'Sasha', role: 'Media Operator', avatarKey: 'social',
    intro: 'Sasha is using the current Media context.',
    prompts: [
      'Help me generate an image for a post',
      'Which assets am I missing for this campaign?',
      'Suggest captions for the selected media',
      'Organize my media library by project',
    ],
  },
  'content-lab': {
    label: 'Content Lab', agentId: 'social-media', name: 'Sasha', role: 'Content Operator', avatarKey: 'social',
    intro: 'Sasha is in the content lab.',
    prompts: [
      'Draft a post from this idea',
      'Repurpose this content for another channel',
      'Give me 5 headline options',
      'Build a content plan for this week',
    ],
  },
  'campaign-studio': {
    label: 'Campaign Studio', agentId: 'ContentHub-promoter', name: 'Mark', role: 'Campaign Strategist', avatarKey: 'promoter',
    intro: 'Mark is reading your campaigns.',
    prompts: [
      'Which campaign has the best conversion rate?',
      'Draft a new outreach campaign for this audience',
      'What should I A/B test next?',
      'Summarize campaign performance this month',
    ],
  },
  notes: {
    label: 'Notes', agentId: 'main', name: 'Maggie', role: 'Knowledge Assistant', avatarKey: 'main',
    intro: 'Maggie is reading your notes.',
    prompts: [
      'Summarize my notes on this topic',
      'Turn these notes into action items',
      'Find related notes and connect them',
      'Draft a clean write-up from these notes',
    ],
  },
  phone: {
    label: 'Phone', agentId: 'communications', name: 'Cameron', role: 'Communications Operator', avatarKey: 'communications',
    intro: 'Cameron is using the current Phone context.',
    prompts: [
      'Who should I call back today?',
      'Draft a voicemail script for this contact',
      'Summarize my recent call history',
      'Set up a follow-up after this call',
    ],
  },
  conference: {
    label: 'Conference', agentId: 'communications', name: 'Cameron', role: 'Communications Operator', avatarKey: 'communications',
    intro: 'Cameron is using the current Conference context.',
    prompts: [
      'Start or schedule a conference call',
      'Who is invited and who has joined?',
      'Draft an agenda for this meeting',
      'Capture action items as we talk',
    ],
  },
  'meeting-capture': {
    label: 'Meeting Capture', agentId: 'communications', name: 'Cameron', role: 'Meeting Capture Operator', avatarKey: 'communications',
    intro: 'Cameron is capturing this meeting.',
    prompts: [
      'Summarize the meeting so far',
      'Pull out the decisions and action items',
      'Draft a recap email to send afterward',
      'Who owns what from this meeting?',
    ],
  },
  network: {
    label: 'Network', agentId: 'coding', name: 'Craig', role: 'Network Operator', avatarKey: 'coding',
    intro: 'Craig is checking the network.',
    prompts: [
      'Review tunnel and ingress health',
      'Explain solo versus multi-user mode',
      'Check API provider configuration risk',
      'Give me a safe tunnel restart checklist',
    ],
  },
  ops: {
    label: 'Ops Lab', agentId: 'coding', name: 'Craig', role: 'Ops Operator', avatarKey: 'coding',
    intro: 'Craig is in the ops lab.',
    prompts: [
      'Check production, Gitea, backups, and CI/CD status',
      'What is blocked in Ops Lab?',
      'Review the latest restore point plan',
      'Open the Repository workspace context',
    ],
  },
  harness: {
    label: 'Harness', agentId: 'coding', name: 'Craig', role: 'Test Harness Engineer', avatarKey: 'coding',
    intro: 'Craig is running the harness.',
    prompts: [
      'Explain OpenClaw versus Hermes as harness engines',
      'Check the Hetzner harness runtime status',
      'Which provider and model is the selected harness using?',
      'What needs to be configured before this harness can run a test?',
    ],
  },
  automations: {
    label: 'Automations', agentId: 'coding', name: 'Craig', role: 'Automation Builder', avatarKey: 'coding',
    intro: 'Craig is building automations.',
    prompts: [
      'Help me build a new automation flow',
      'Which automations are active right now?',
      'Assign this flow to a client\'s agent',
      'What could break this automation?',
    ],
  },
  'voice-labs': {
    label: 'Voice Labs', agentId: 'communications', name: 'Cameron', role: 'Voice Lab Operator', avatarKey: 'communications',
    intro: 'Cameron is in the voice lab.',
    prompts: [
      'Compare voices for this agent',
      'Which voice/provider is best for a budget client?',
      'Explain what is configured versus live-routed',
      'Suggest the next voice sandbox test',
    ],
  },
  settings: {
    label: 'Settings', agentId: 'main', name: 'Maggie', role: 'CRM Assistant', avatarKey: 'main',
    intro: 'Maggie is in your settings.',
    prompts: [
      'Explain what this setting controls',
      'What should I configure first?',
      'Walk me through connecting a provider',
      'What is safe to change versus leave alone?',
    ],
  },
}

export function getSectionAgent(section) {
  return SECTION_AGENTS[section] || SECTION_AGENTS.default
}

const FINANCE_AGENT_INTENT_RE = /\b(invoice|invoices|payment|payments|bill|billing|finance|overdue|receivable|receivables|cash flow|cash-flow)\b/i

export function resolveWizardAgentSection(section, text = '') {
  if (section === 'finance') return 'finance'
  return FINANCE_AGENT_INTENT_RE.test(String(text || '')) ? 'finance' : section
}

export function getWizardAgent(section, text = '') {
  return getSectionAgent(resolveWizardAgentSection(section, text))
}

export function getSectionPrompts(section) {
  return getSectionAgent(section).prompts
}

// One-line persona instruction for the API system context so the answer
// comes back in the same agent the user sees waiting in the wizard.
export function sectionPersonaLine(section) {
  const a = getSectionAgent(section)
  if (a.agentId === 'main') return ''
  return `For this section, answer as ${a.name}, the ${a.role} on Carl's team. Stay in character as ${a.name}: concise, human, no AI boilerplate. Do not introduce yourself as Maggie.`
}
