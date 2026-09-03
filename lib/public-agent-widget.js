import { listAgents } from '@/lib/agents-store'
import { NEWSROOM_AIOS_WEB_AGENT_ID, NEWSROOM_AIOS_WEB_WIDGET_PROFILE } from '@/lib/newsroom-aios-web-agent'
import { WNC_TIMES_AGENT_ID, WNC_TIMES_WIDGET_PROFILE } from '@/lib/wnc-times-agent'

const DEFAULT_AVATAR = 'https://storage.googleapis.com/newsroomasios.firebasestorage.app/avatars/receptionist.png'

function absoluteAvatar(url, baseUrl = 'https://openocti.local') {
  const value = String(url || '').trim()
  if (!value) return DEFAULT_AVATAR
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return `${baseUrl}${value}`
  return value
}

function cleanText(value, max = 900) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function resolvePublicWidgetAgent(id, { baseUrl = 'https://openocti.local' } = {}) {
  const requested = cleanText(id, 120) || 'super-demo'
  let agent = null
  try {
    const data = await listAgents()
    agent = (data.agents || []).find(a => a.id === requested) || null
  } catch {}

  const profile =
    requested === WNC_TIMES_AGENT_ID
      ? WNC_TIMES_WIDGET_PROFILE
      : requested === NEWSROOM_AIOS_WEB_AGENT_ID
        ? NEWSROOM_AIOS_WEB_WIDGET_PROFILE
        : null
  const name = cleanText(profile?.name || agent?.name, 80) || 'Doreen'
  const title = cleanText(profile?.title || agent?.title || agent?.role, 120) || 'AI Agent'
  const description = cleanText(profile?.description || agent?.description || agent?.role, 700)
    || 'A configured Farrington Development agent ready for website conversations.'

  return {
    id: agent?.id || requested,
    name,
    title,
    description,
    avatarUrl: absoluteAvatar(agent?.avatar?.url || profile?.avatarUrl, baseUrl),
    jobDescription: cleanText(agent?.jobDescription, 4000),
    greeting: cleanText(profile?.greeting, 300) || `Hi, I am ${name}. What can I help you figure out today?`,
    brand: profile?.brand || 'farrington',
    source: profile?.source || 'public-agent-widget',
    voiceEnabled: profile?.voiceEnabled === true,
    handoffEmail: profile?.handoffEmail || 'personal@example.invalid',
    actions: profile?.actions || [
      { id: 'email', label: 'Email' },
      { id: 'callback', label: 'Callback' },
    ],
    quickQuestions: profile?.quickQuestions || [
      'What can you help me with?',
      'I would like to start a project',
      'Can I schedule a demo?',
      'What information do you need from me?',
    ],
    systemPrompt: cleanText(profile?.systemPrompt, 4000),
  }
}
