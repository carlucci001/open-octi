type PluginConfig = { baseUrl?: string; apiKey?: string; enabled?: boolean }

const TOOL_DESCRIPTIONS: Record<string, string> = {
  fcc_list_tools: 'List the OpenOcti agent tools available to this runtime.',
  fcc_dashboard: 'Read the OpenOcti dashboard summary.',
  fcc_search: 'Search CRM records and notes.',
  fcc_list_accounts: 'List CRM accounts.',
  fcc_get_account: 'Get an account and its related CRM records.',
  fcc_list_calendar_events: 'List calendar events.',
  fcc_create_lead: 'Create a CRM lead.',
  fcc_qualify_lead: 'Update lead qualification.',
  fcc_create_task: 'Create a task.',
  fcc_complete_task: 'Complete a task.',
  fcc_log_activity: 'Record an activity in the CRM timeline.',
  fcc_read_note: 'Read an internal note.',
  fcc_write_note: 'Write an internal note.',
  fcc_send_email: 'Send an email after the configured approval checks.',
  fcc_send_signature_document: 'Send a document for electronic signature after approval.',
  fcc_open_record: 'Open a CRM record in the connected interface.',
  fcc_navigate_to: 'Navigate the connected interface to an OpenOcti module.',
  fcc_import_start: 'Preview and map a contacts, accounts, leads, deals, projects, or tasks import.',
  fcc_import_commit: 'Commit an approved OpenOcti import and return its undo batch ID.',
  fcc_capability_status: 'Read live OpenOcti capabilities, configured sources, missing requirements, and Settings links.',
  fcc_list_agents: 'List OpenOcti agents, roles, and enabled state.',
  fcc_open_page: 'Return a safe OpenOcti page link that the chat panel can render as a button.',
  fcc_press_query: 'Query ranked, beat-matched press contacts with reasons and geography fallback.',
  fcc_press_list_save: 'Save a reviewed Press Desk contact list.',
  fcc_press_contact_explain: 'Explain a press-contact score and show recent bylines.',
  fcc_press_campaign_create: 'Create a draft press campaign from a release document and saved list.',
  fcc_press_campaign_send: 'Preview or send a press campaign through the compliance gate; dryRun defaults true.',
  fcc_press_campaign_report: 'Report press-campaign sends, opens, replies, bounces, and pickups.',
  fcc_press_suppress: 'Immediately suppress a press email, domain, or contact.',
}

const configSchema = {
  parse(value: unknown): Required<PluginConfig> {
    const config = (value || {}) as PluginConfig
    return {
      baseUrl: config.baseUrl || 'http://app:3000',
      apiKey: config.apiKey || '',
      enabled: config.enabled !== false,
    }
  },
}

function response(payload: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload, null, 2) }], details: payload }
}

async function execute(config: Required<PluginConfig>, tool: string, args: Record<string, unknown>) {
  const result = await fetch(`${config.baseUrl}/api/agent/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-agent-key': config.apiKey },
    body: JSON.stringify({ tool, args }),
  })
  const payload = await result.json().catch(() => ({ error: `OpenOcti returned HTTP ${result.status}` }))
  if (!result.ok) throw new Error(String(payload?.error || `OpenOcti returned HTTP ${result.status}`))
  return response(payload)
}

const openOctiPlugin = {
  id: 'openocti',
  name: 'OpenOcti',
  description: 'Business operations tools for OpenOcti agents.',
  configSchema,
  register(api: any) {
    const config = configSchema.parse(api.pluginConfig)
    if (!config.enabled) return
    for (const [name, description] of Object.entries(TOOL_DESCRIPTIONS)) {
      api.registerTool({
        name,
        label: name.replace(/^fcc_/, '').replaceAll('_', ' '),
        description,
        parameters: { type: 'object', additionalProperties: true, properties: {} },
        execute: (_id: string, args: Record<string, unknown> = {}) => execute(config, name, args).catch(error => response({ ok: false, error: error.message })),
      })
    }
  },
}

export default openOctiPlugin
