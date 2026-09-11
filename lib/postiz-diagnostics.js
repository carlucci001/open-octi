import { getPostizConfig } from './postiz-config'
import { postizSetupProgress } from './openocti-postiz-progress'

// This result intentionally contains no URLs, keys, channel names, or upstream body text.
export async function inspectPostiz(env = process.env, { fetchImpl = fetch } = {}) {
  const config = getPostizConfig(env)
  const result = { installed: env.OPENOCTI_POSTIZ_STACK === 'bundled' ? 'bundled' : 'external_or_unknown', configured: Boolean(config && !config.error), reachable: null, connected: false, channelCount: null, checkedAt: new Date().toISOString(), scheduled: 'not_verified', published: 'not_verified' }
  const progress = postizSetupProgress(config)
  if (progress) {
    result.scheduled = 'accepted'
    result.published = progress.confirmedPublishedAt ? 'confirmed_by_user' : 'not_verified'
  }
  if (config?.error) return { ...result, state: 'invalid_configuration', next: config.error, topic: 'invalid-key' }
  const base = config?.base || String(env.POSTIZ_API_URL || '').trim().replace(/\/+$/, '')
  if (!base) return { ...result, state: 'not_configured', next: 'Open Postiz settings and enter your installation’s Public API address and key.', topic: 'connection' }
  let url
  try { url = new URL(`${base}/integrations`) } catch { return { ...result, state: 'invalid_configuration', next: 'Correct the Public API address in Postiz settings.', topic: 'invalid-key' } }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return { ...result, state: 'invalid_configuration', next: 'Correct the Public API address in Postiz settings.', topic: 'invalid-key' }
  try {
    const response = await fetchImpl(url.toString(), { headers: config?.key ? { Authorization: config.key } : {}, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) })
    result.reachable = true
    if (!config?.key) return { ...result, state: 'missing_key', next: 'Postiz responded. Create your Postiz account and save its Public API key in Postiz settings.', topic: 'connection' }
    if ([401, 403].includes(response.status)) return { ...result, state: 'invalid_key', next: 'Postiz rejected the key. Replace it with a Public API key from this same installation.', topic: 'invalid-key' }
    if (!response.ok) return { ...result, state: 'service_error', next: `Postiz returned HTTP ${response.status}. Check its service health and API address.`, topic: 'unreachable' }
    let channels
    try { channels = await response.json() } catch { return { ...result, state: 'invalid_response', next: 'The address did not return JSON. Check that it points to the Public API rather than the dashboard.', topic: 'invalid-key' } }
    if (!Array.isArray(channels) || channels.some(channel => !channel || typeof channel.id !== 'string')) return { ...result, state: 'invalid_response', next: 'Postiz returned an unexpected channel response. Check the Public API address.', topic: 'invalid-key' }
    result.channelCount = channels.filter(channel => !channel.disabled).length
    result.connected = result.channelCount > 0
    if (result.connected && progress) return { ...result, state: progress.confirmedPublishedAt ? 'publishing_confirmed_by_user' : 'test_scheduled', next: progress.confirmedPublishedAt ? 'You confirmed the test post on the destination platform. Check future posts individually.' : 'Postiz accepted a test post. After its scheduled time, verify the caption and image on the destination platform, then confirm that check in Postiz settings.', topic: 'publish' }
    return { ...result, state: result.connected ? 'channels_connected' : 'no_channels', next: result.connected ? 'Create and review a test post. A connected channel does not confirm publishing.' : 'The API connection works. Open Postiz and connect a social account.', topic: result.connected ? 'publish' : 'channels' }
  } catch { return { ...result, reachable: false, state: 'unreachable', next: 'Postiz could not be reached. Check the service health and internal API address, then recheck.', topic: 'unreachable' } }
}
