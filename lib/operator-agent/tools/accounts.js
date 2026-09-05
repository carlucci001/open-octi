import { callRoute, noCost, objectSchema, tool } from './common.js'

export const accountTools = [
  tool({
    name: 'account.lookup',
    description: 'Find an account by id or a case-insensitive name query.',
    purpose: 'Resolve the company or client record before planning or writing work.',
    screen: 'Accounts',
    input_schema: objectSchema({ id: { type: 'string' }, query: { type: 'string' } }),
    sideEffects: 'none',
    costEstimate: noCost,
    async execute(input, context) {
      const { GET } = await import('../../../app/api/accounts/route.js')
      const result = await callRoute(GET, context.request, { pathname: '/api/accounts', query: input.id ? { id: input.id, with: 'relations' } : {} })
      if (result.account) return result
      const needle = String(input.query || '').trim().toLowerCase()
      return { accounts: (result.accounts || []).filter(item => !needle || String(item.name || '').toLowerCase().includes(needle)).slice(0, 20) }
    },
  }),
  tool({
    name: 'account.create',
    description: 'Create a CRM account using the existing Accounts route.',
    purpose: 'Add the business record that other CRM work will attach to.',
    screen: 'Accounts',
    input_schema: objectSchema({ name: { type: 'string' }, type: { type: 'string' }, industry: { type: 'string' }, website: { type: 'string' }, notes: { type: 'string' } }, ['name']),
    sideEffects: 'writes',
    costEstimate: noCost,
    async execute(input, context) {
      const { POST } = await import('../../../app/api/accounts/route.js')
      return callRoute(POST, context.request, { pathname: '/api/accounts', method: 'POST', body: { action: 'add', account: input } })
    },
  }),
]
