export const COMMAND_CENTER_SECTIONS = [
  {
    id: 'dashboard',
    label: 'Command Center',
    aliases: ['dashboard', 'command center', 'home', 'overview', 'main screen', 'start screen'],
  },
  {
    id: 'feed',
    label: 'Feed',
    aliases: ['feed', 'activity feed', 'messages', 'message feed', 'direct messages', 'dm', 'dms'],
  },
  {
    id: 'api-spend',
    label: 'Finance > API Spend',
    aliases: ['api spend', 'api spending', 'api costs', 'api usage', 'provider spend', 'provider balances', 'api spend control panel'],
  },
  {
    id: 'leads',
    label: 'Leads',
    aliases: ['leads', 'working lead database', 'lead database', 'lead board', 'lead page', 'crm leads', 'sponsor crm', 'sponsor leads'],
  },
  {
    id: 'lead-intake',
    label: 'Leads > Lead Intake',
    aliases: ['lead intake', 'lead inbox', 'new intake lead', 'qualify leads', 'lead qualification'],
  },
  {
    id: 'email-templates',
    label: 'Leads > Email Templates',
    aliases: ['email templates', 'email template', 'edit email templates', 'edit emails', 'email letters', 'follow up letters', 'lead letters', 'letter templates'],
  },
  {
    id: 'pipelines',
    label: 'Pipelines',
    aliases: ['pipelines', 'pipeline', 'opportunities', 'opportunity board', 'deals', 'sales pipeline'],
  },
  {
    id: 'accounts',
    label: 'Accounts',
    aliases: ['accounts', 'account list', 'clients', 'client list', 'businesses', 'companies'],
  },
  {
    id: 'platforms',
    label: 'Platforms',
    // GetFound3's old aliases migrate here so voice/nav keeps working — they
    // land on Platforms, where GetFound3 is the first platform in the list.
    aliases: ['platforms', 'platform', 'platform manager', 'platform list', 'managed platforms', 'platform control', 'getfound3', 'get found 3', 'get found three', 'visibility reports', 'seo reports', 'aeo reports', 'geo reports', 'website visibility', 'remediation reports'],
  },
  {
    id: 'contacts',
    label: 'Contacts',
    aliases: ['contacts', 'people', 'contact list'],
  },
  {
    id: 'projects',
    label: 'Projects',
    aliases: ['projects', 'project board', 'active work'],
  },
  {
    id: 'tasks',
    label: 'Tasks',
    aliases: ['tasks', 'todos', 'to dos', 'task list'],
  },
  {
    id: 'finance',
    label: 'Finance',
    aliases: ['finance', 'billing', 'cash view'],
  },
  {
    id: 'payments',
    label: 'Finance > Payments',
    aliases: ['payments', 'payment tab', 'client payments', 'stripe payments'],
  },
  {
    id: 'invoices',
    label: 'Finance > Invoices',
    aliases: ['invoices', 'invoice tab', 'billing invoices'],
  },
  {
    id: 'overhead',
    label: 'Finance > Overhead',
    aliases: ['overhead', 'expenses', 'costs', 'api costs'],
  },
  {
    id: 'documents',
    label: 'Documents',
    aliases: ['documents', 'docs', 'contracts', 'agreements', 'licenses', 'templates', 'document templates'],
  },
  {
    id: 'content-lab',
    label: 'Projects > Content',
    aliases: ['content lab', 'content creation', 'creation lab', 'media lab', 'creative lab', 'openai images', 'fal', 'fal.ai', 'flux pro', 'image generator', 'video generator'],
  },
  {
    id: 'media',
    label: 'Media',
    aliases: ['media', 'media library', 'images', 'graphics', 'assets', 'image library', 'asset library', 'creative library'],
  },
  {
    id: 'campaign-studio',
    label: 'Marketing',
    aliases: ['marketing', 'campaign studio', 'campaigns', 'social campaigns', 'social scheduler', 'content calendar', 'autopilot', 'revenue studio'],
  },
  {
    id: 'outreach-campaigns',
    label: 'Leads > Working Lead Database',
    aliases: ['working lead database', 'outreach campaigns', 'sponsor crm', 'sponsor leads', 'sponsors', 'newspaper outreach', 'tda outreach', 'campaign leads', 'lead database'],
  },
  {
    id: 'switchboard',
    label: 'Switchboard',
    aliases: ['switchboard', 'call monitor', 'agent calls', 'live calls', 'qa monitor'],
  },
  {
    id: 'agents',
    label: 'Agents',
    aliases: ['agents', 'agent manager', 'agent list', 'ai agents', 'team agents'],
  },
  {
    id: 'repository',
    label: 'Repository',
    aliases: [
      'repository',
      'repositories',
      'repo',
      'repos',
      'gitea',
      'git',
      'source control',
      'source code',
      'code repository',
      'git repository',
      'gitea repository',
      'source repo',
      'source repository',
      'code',
    ],
  },
  {
    id: 'products',
    label: 'Labs > Products',
    aliases: ['products', 'product catalog', 'catalog', 'product lab', 'product labs', 'products lab'],
  },
  {
    id: 'ship-desk',
    label: 'Build > Ship Desk',
    aliases: ['ship desk', 'releases', 'release desk', 'deployments', 'live versions', 'rollback command'],
  },
  {
    id: 'build-board',
    label: 'Build > Build Board',
    aliases: ['build board', 'builder board', 'feature board', 'idea board', 'handoff board', 'checker review'],
  },
  {
    id: 'incident-inbox',
    label: 'Operations > Incident Inbox',
    aliases: ['incident inbox', 'incidents', 'platform incidents', 'platform errors', 'show platform errors', 'error inbox', 'service incidents', 'status incidents'],
  },
  {
    id: 'money-console',
    label: 'Operations > Money Console',
    aliases: ['money console', 'portfolio revenue', 'portfolio mrr', 'revenue console', 'failed payments', 'subscription revenue'],
  },
  {
    id: 'agent-labs',
    label: 'Labs > Agent Lab',
    aliases: ['agent lab', 'agent labs', 'lab agents', 'agent laboratory'],
  },
  {
    id: 'agent-sandbox',
    label: 'Labs > Agent Sandbox',
    aliases: ['agent sandbox', 'agent sandboxes', 'third party agent sandbox', 'third-party agent sandbox', 'agent import sandbox', 'imported agents'],
  },
  {
    id: 'nvidia-labs',
    label: 'Labs > AI Lab',
    aliases: ['ai lab', 'model lab', 'model testing', 'model tester', 'model bakeoff', 'provider bakeoff', 'llm lab', 'language model lab', 'nvidia', 'nvidia labs', 'nvidia lab', 'nim', 'nim lab', 'gpu lab', 'gpu labs', 'developer gpu', 'nvidia api'],
  },
  {
    id: 'api-lab',
    label: 'Labs > API Lab',
    aliases: ['api lab', 'api labs', 'api testing', 'api tester', 'endpoint lab', 'endpoint tester', 'developer api lab', 'swagger lab', 'openapi lab', 'payload lab', 'api key tester'],
  },
  {
    id: 'voice-labs',
    label: 'Labs > Voice Labs',
    aliases: ['voice labs', 'voice lab', 'voice testing', 'voice sandbox', 'voice library', 'tts lab', 'tts labs', 'gemini voice lab'],
  },
  {
    id: 'ops',
    label: 'Labs > Ops Lab',
    aliases: ['ops', 'ops lab', 'ops labs', 'operations', 'operations lab', 'deployment lab', 'ci cd', 'cicd'],
  },
  {
    id: 'phone',
    label: 'Tools > Phone',
    aliases: ['phone', 'dialer', 'voicemail', 'voicemails', 'calls'],
  },
  {
    id: 'conference',
    label: 'Tools > Conference',
    aliases: ['conference', 'video', 'video calls', 'meetings'],
  },
  {
    id: 'calendar',
    label: 'Tools > Calendar',
    aliases: ['calendar', 'schedule', 'events'],
  },
  {
    id: 'notes',
    label: 'Command Vault',
    aliases: ['command vault', 'notes', 'notebook', 'vault notes', 'knowledge vault', 'markdown vault', 'linked notes', 'obsidian', 'obsidian vault', 'vault'],
  },
  {
    id: 'harness',
    label: 'Tools > Harness',
    aliases: ['harness', 'developer harness', 'test harness', 'openclaw harness'],
  },
  {
    id: 'network',
    label: 'Tools > Network',
    aliases: ['network', 'apis', 'api', 'tunnel', 'cloudflare', 'tailscale', 'network status'],
  },
  {
    id: 'domains',
    label: 'Tools > Domains',
    aliases: ['domains', 'domain manager', 'godaddy', 'dns'],
  },
  {
    id: 'credentials',
    label: 'Tools > Credentials',
    aliases: ['credentials', 'vault', 'api keys', 'keys', 'secrets'],
  },
  {
    id: 'settings',
    label: 'Settings',
    aliases: ['settings', 'preferences', 'interface settings', 'theme settings', 'system admin', 'admin settings'],
  },
  {
    id: 'control-services',
    label: 'Control Services',
    aliases: ['control services', 'service controls', 'admin services', 'service catalog', 'control service specs'],
  },
  {
    id: 'voice-guide',
    label: 'Help & Guides',
    aliases: ['help', 'guide', 'voice guide', 'help and guides', 'guides'],
  },
  {
    id: 'meeting-capture',
    label: 'Meeting Capture',
    aliases: ['meeting capture', 'transcription', 'transcribe', 'maggie transcription', 'call transcription', 'meeting notes', 'conversation capture'],
  },
]

export const COMMAND_CENTER_MENU_GUIDE = COMMAND_CENTER_SECTIONS
  .map(section => `- ${section.label}: use tabId "${section.id}". Aliases: ${section.aliases.join(', ')}.`)
  .join('\n')

function normalizeNavigationText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(please\s+)?(transfer|send|connect|route)\s+(me\s+)?(over\s+)?(to\s+)?/, '')
    .replace(/^(please\s+)?(take|get)\s+me\s+to\s+/, '')
    .replace(/^i\s+need\s+(to\s+)?(go\s+to|be\s+transferred\s+to)\s+/, '')
    .replace(/^the\s+/, '')
}

export function resolveCommandCenterTab(value) {
  const target = normalizeNavigationText(value)
  if (!target) return ''
  for (const section of COMMAND_CENTER_SECTIONS) {
    if (section.id === target) return section.id
    if (section.aliases.some(alias => target === normalizeNavigationText(alias))) return section.id
  }
  return target
}

export function isCommandCenterNavigationPhrase(value) {
  const target = normalizeNavigationText(value)
  if (!target) return false
  return COMMAND_CENTER_SECTIONS.some(section =>
    section.id === target || section.aliases.some(alias => target.includes(normalizeNavigationText(alias)))
  )
}

// Reverse lookup: section id -> human-readable label ("campaign-studio" ->
// "Projects > Campaign Studio"). Used to tell voice agents which page Carl is
// on in words instead of a raw tab id.
export function labelForCommandCenterTab(value) {
  const id = String(value || '').trim().toLowerCase()
  if (!id) return ''
  const section = COMMAND_CENTER_SECTIONS.find(s => s.id === id)
  return section?.label || ''
}
