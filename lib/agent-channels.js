export const AGENT_CHANNEL_OPTIONS = [
  {
    id: 'phone',
    label: 'Phone',
    shortLabel: 'Phone',
    description: 'Live calls and transfer-capable phone workflows.',
    statusKind: 'crm',
  },
  {
    id: 'sms',
    label: 'SMS',
    shortLabel: 'SMS',
    description: 'Text-message intake and follow-up.',
    statusKind: 'crm',
  },
  {
    id: 'email',
    label: 'Email',
    shortLabel: 'Email',
    description: 'Email drafting, replies, and account-folder delivery.',
    statusKind: 'crm',
  },
  {
    id: 'web',
    label: 'Web Chat',
    shortLabel: 'Web',
    description: 'CRM and embedded website chat.',
    statusKind: 'crm',
  },
  {
    id: 'voice',
    label: 'Voice',
    shortLabel: 'Voice',
    description: 'In-CRM voice assistant sessions and wake-word workflows.',
    statusKind: 'crm',
  },
  {
    id: 'telegram',
    label: 'Telegram',
    shortLabel: 'Telegram',
    description: 'OpenClaw Telegram bot and group messaging.',
    statusKind: 'openclaw',
  },
  {
    id: 'discord',
    label: 'Discord',
    shortLabel: 'Discord',
    description: 'OpenClaw Discord guild and channel messaging.',
    statusKind: 'openclaw',
  },
  {
    id: 'internal',
    label: 'Internal Only',
    shortLabel: 'Internal',
    description: 'CRM-only work that should not answer public channels.',
    statusKind: 'crm',
  },
]

const PLACEHOLDER_VALUES = new Set(['', 'missing', 'changeme', 'change-me', 'undefined', 'null'])

function hasRealValue(value) {
  return !PLACEHOLDER_VALUES.has(String(value || '').trim().toLowerCase())
}

function entryNames(entries) {
  if (Array.isArray(entries)) {
    return entries.map(entry => typeof entry === 'string' ? entry : entry?.id || entry?.name).filter(Boolean)
  }
  if (entries && typeof entries === 'object') return Object.keys(entries)
  return []
}

function countCollection(value) {
  if (Array.isArray(value)) return value.length
  if (value && typeof value === 'object') return Object.keys(value).length
  return 0
}

function countDiscordTargets(discord) {
  const guilds = discord.guilds || discord.servers || {}
  if (Array.isArray(guilds)) return guilds.length
  if (guilds && typeof guilds === 'object') {
    const nestedChannels = Object.values(guilds).reduce((sum, guild) => {
      return sum + countCollection(guild?.channels)
    }, 0)
    return nestedChannels || Object.keys(guilds).length
  }
  return countCollection(discord.channels || discord.groups)
}

export function buildAgentChannelStatus(openclawConfig = {}) {
  const pluginNames = new Set(entryNames(openclawConfig?.plugins?.entries || openclawConfig?.plugins))
  const telegram = openclawConfig?.channels?.telegram || openclawConfig?.telegram || {}
  const discord = openclawConfig?.channels?.discord || openclawConfig?.discord || {}
  const telegramGroups = telegram.groups || telegram.chats || {}

  const status = {}
  for (const channel of AGENT_CHANNEL_OPTIONS) {
    status[channel.id] = {
      id: channel.id,
      available: true,
      configured: channel.statusKind === 'crm',
      source: channel.statusKind === 'openclaw' ? 'OpenClaw' : 'CRM',
      detail: channel.statusKind === 'openclaw' ? 'Runtime status unavailable' : 'CRM channel',
    }
  }

  const telegramConfigured = telegram.enabled !== false
    && Object.keys(telegram).length > 0
    && hasRealValue(telegram.botToken || telegram.token)

  status.telegram = {
    ...status.telegram,
    configured: telegramConfigured,
    active: telegramConfigured,
    credentialPresent: hasRealValue(telegram.botToken || telegram.token),
    targetCount: countCollection(telegramGroups),
    detail: telegramConfigured
      ? `Bot configured with ${countCollection(telegramGroups)} group target(s)`
      : 'Telegram channel exists but needs bot/token or group review',
  }

  const discordPluginPresent = pluginNames.has('discord')
  const discordTargetCount = countDiscordTargets(discord)
  const discordCredentialPresent = hasRealValue(discord.token || discord.botToken || discord.webhookUrl || discord.webhook)
  const discordConfigured = discord.enabled !== false
    && (discordPluginPresent || Object.keys(discord).length > 0)
    && (discordTargetCount > 0 || discordCredentialPresent)

  status.discord = {
    ...status.discord,
    configured: discordConfigured,
    active: discordConfigured,
    pluginPresent: discordPluginPresent,
    credentialPresent: discordCredentialPresent,
    targetCount: discordTargetCount,
    detail: discordConfigured
      ? `Plugin ${discordPluginPresent ? 'enabled' : 'detected'} with ${discordTargetCount} guild/channel target(s)`
      : 'Discord channel exists but needs plugin, credential, or guild review',
  }

  return status
}
