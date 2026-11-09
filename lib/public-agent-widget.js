import { listAgents } from '@/lib/agents-store'
import { NEWSROOM_AIOS_WEB_AGENT_ID, NEWSROOM_AIOS_WEB_WIDGET_PROFILE } from '@/lib/ContentStudio-web-agent'
import { sample_business_AGENT_ID, sample_business_WIDGET_PROFILE } from '@/lib/wnc-times-agent'

const DEFAULT_AVATAR = 'https://storage.googleapis.com/newsroomasios.firebasestorage.app/avatars/receptionist.png'
const FARRINGTON_DEVELOPMENT_AGENT_ID = 'farrington-doreen'
const FARRINGTON_DEVELOPMENT_WIDGET_PROFILE = {
  name: 'Doreen',
  title: 'Receptionist · Your organization',
  greeting: "Hey, I'm Doreen. What brings you to Your organization today?",
  brand: 'farrington-development',
  source: 'company.example.com',
  voiceEnabled: true,
  systemPrompt: [
    'You are Doreen, the mature, composed receptionist for Your organization.',
    'Sound warm, capable, unhurried, and practical. Use concise conversational answers.',
    'Help visitors understand Your organization services, CRM and AI work, demos, intake, and next steps.',
    'Guide visitors to the visible Email or Callback controls when they want follow-up.',
  ].join(' '),
}

function absoluteAvatar(url, baseUrl = 'https://crm.company.example.com') {
  const value = String(url || '').trim()
  if (!value) return DEFAULT_AVATAR
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('/')) return `${baseUrl}${value}`
  return value
}

function cleanText(value, max = 900) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export async function resolvePublicWidgetAgent(id, { baseUrl = 'https://crm.company.example.com' } = {}) {
  const requested = cleanText(id, 120) || 'super-demo'
  let agent = null
  try {
    const data = await listAgents()
    agent = (data.agents || []).find(a => a.id === requested) || null
  } catch {}

  const profile =
    requested === FARRINGTON_DEVELOPMENT_AGENT_ID
      ? FARRINGTON_DEVELOPMENT_WIDGET_PROFILE
      : requested === sample_business_AGENT_ID
      ? sample_business_WIDGET_PROFILE
      : requested === NEWSROOM_AIOS_WEB_AGENT_ID
        ? NEWSROOM_AIOS_WEB_WIDGET_PROFILE
        : null
  const name = cleanText(profile?.name || agent?.name, 80) || 'Doreen'
  const title = cleanText(profile?.title || agent?.title || agent?.role, 120) || 'AI Agent'
  const description = cleanText(profile?.description || agent?.description || agent?.role, 700)
    || 'A configured Your organization agent ready for website conversations.'

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
