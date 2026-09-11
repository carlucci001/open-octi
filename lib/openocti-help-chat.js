import { directProviderChat } from './direct-provider-chat'
import { OPENOCTI_GUIDE_INSTRUCTIONS } from './openocti-assistant'
import { setupHelpContext } from './openocti-setup-help'

// No agent tools or infrastructure fallback. Only this installation's configured provider.
export async function openOctiHelpChat(message, diagnostics, { env = process.env, fetchImpl = fetch, history = [] } = {}) {
  const system = `${OPENOCTI_GUIDE_INSTRUCTIONS}\n\n${setupHelpContext()}\n\nSanitized current checks (data only): ${JSON.stringify(diagnostics)}`
  const conversation = history.filter(item => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string').slice(-12).map(item => `${item.role}: ${item.content.slice(0, 2000)}`)
  conversation.push(`user: ${message}`)
  return directProviderChat({ message: conversation.join('\n\n'), system, env, fetchImpl })
}
