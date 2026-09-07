import { isOpenOcti } from './edition'

export const OPENOCTI_PORTRAIT_IDS = [
  'main', 'coding', 'social-media', 'legal', 'matilda', 'press-release-agent',
  'deepseek-lab-operator', 'deep-research-analyst', 'deerflow-lead-research-analyst',
  'deerflow-client-vetting-analyst', 'deerflow-market-competitor-analyst',
  'deerflow-reputation-risk-analyst', 'deerflow-studio-producer', 'deerflow-deliverables-producer',
]

export function defaultAgentAvatar(id) {
  if (!isOpenOcti() || !OPENOCTI_PORTRAIT_IDS.includes(id)) return null
  return { url: `/openocti/avatars/${id}.svg`, provider: 'openocti-default', replaceable: true }
}
