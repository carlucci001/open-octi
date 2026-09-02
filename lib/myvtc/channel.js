import { mutateData } from '@/lib/dataStore'
import { startChannel } from '@/lib/inboundChannels'

const FILE = 'inbound-channels.json'

export const MYVTC_CONTACT_CHANNEL = Object.freeze({
  id: 'myvtc_contact',
  label: 'MyVTC contact form',
  type: 'webhook',
  enabled: true,
  targetCampaign: 'myvtc',
  autoCreateOpportunity: false,
})

export function ensureMyvtcChannel() {
  const channel = mutateData(FILE, current => {
    const data = current && typeof current === 'object' ? current : { channels: [] }
    const channels = Array.isArray(data.channels) ? [...data.channels] : []
    const index = channels.findIndex(item => item?.id === MYVTC_CONTACT_CHANNEL.id)
    const next = index >= 0
      ? { ...channels[index], ...MYVTC_CONTACT_CHANNEL }
      : { ...MYVTC_CONTACT_CHANNEL, createdAt: new Date().toISOString() }

    if (index >= 0) channels[index] = next
    else channels.push(next)

    return {
      data: { ...data, channels, lastUpdated: new Date().toISOString() },
      result: next,
    }
  })

  startChannel(channel)
  return channel
}
