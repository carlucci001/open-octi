// Presentation-only mapping verified against the existing agent and avatar stores.
// Capability/commerce truth remains in portal-capability-catalog.js.
const AGENTS = Object.freeze({
  doreen: { id: 'receptionist', name: 'Doreen', role: 'Receptionist', avatarUrl: '/avatars/receptionist-1777668904398.png' },
  cameron: { id: 'communications', name: 'Cameron', role: 'Communications Coordinator', avatarUrl: '/avatars/communications-1777476569009.jpg' },
  maggie: { id: 'main', name: 'Maggie', role: 'Office Manager', avatarUrl: '/avatars/main-1777248993872.png' },
  sasha: { id: 'social-media', name: 'Sasha', role: 'Graphics & Social', avatarUrl: '/avatars/social-media-1777476538091.jpg' },
  mark: { id: 'ContentStudio-promoter', name: 'Mark', role: 'Marketing & Content', avatarUrl: '/avatars/ContentStudio-promoter-1777251395979.png' },
  linda: { id: 'legal', name: 'Linda', role: 'Legal Drafting', avatarUrl: '/avatars/legal-1777476559880.jpg' },
  craig: { id: 'coding', name: 'Craig', role: 'Engineering & Code', avatarUrl: '/avatars/coding-1777251118838.png' },
  frank: { id: 'finance-manager', name: 'Frank', role: 'Finance Manager', avatarUrl: '/avatars/finance-manager-local.svg' },
  nadia: { id: 'deep-research-analyst', name: 'Nadia', role: 'Client Due Diligence', avatarUrl: '/avatars/deerflow-nadia.svg' },
  leo: { id: 'deerflow-lead-research-analyst', name: 'Leo', role: 'Lead Research', avatarUrl: '/avatars/deerflow-leo.svg' },
  vera: { id: 'deerflow-client-vetting-analyst', name: 'Vera', role: 'Client Vetting', avatarUrl: '/avatars/deerflow-vera.svg' },
  mason: { id: 'deerflow-market-competitor-analyst', name: 'Mason', role: 'Competitor Intelligence', avatarUrl: '/avatars/deerflow-mason.svg' },
  rowan: { id: 'deerflow-reputation-risk-analyst', name: 'Rowan', role: 'Reputation Risk', avatarUrl: '/avatars/deerflow-rowan.svg' },
})

const TIERS = Object.freeze({
  receptionist: ['doreen'], communications: ['cameron'], 'office-manager': ['maggie'],
  'specialist-graphics': ['sasha'], 'specialist-marketing': ['mark'], 'specialist-legal': ['linda'],
  'specialist-engineering': ['craig'], 'specialist-finance-manager': ['frank'],
  'full-suite': ['doreen', 'cameron', 'maggie', 'sasha', 'mark', 'linda', 'craig'],
})

const SERVICES = Object.freeze({
  research: ['nadia', 'mason', 'vera', 'leo', 'rowan'], campaign: ['mark', 'sasha'], operations: ['doreen', 'maggie', 'cameron'],
})

export function verifiedAgentsForTier(id) { return (TIERS[String(id || '')] || []).map(key => AGENTS[key]) }
export function verifiedAgentsForService(id) { return (SERVICES[String(id || '')] || []).map(key => AGENTS[key]) }
