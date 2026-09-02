import AgentWidgetPanel from './AgentWidgetPanel'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'

export const dynamic = 'force-dynamic'

export default async function AgentWidgetPage({ searchParams }) {
  const agentId = searchParams?.agent || 'super-demo'
  const theme = searchParams?.theme || 'light'
  const agent = await resolvePublicWidgetAgent(agentId)
  return <AgentWidgetPanel agent={agent} theme={theme} />
}
