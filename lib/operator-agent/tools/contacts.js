import { callRoute, noCost, objectSchema, tool } from './common.js'

export const contactTools = [tool({
  name: 'contact.lookup',
  description: 'Find contacts by id, account, name, email, or phone.',
  purpose: 'Resolve the person attached to an account or opportunity.',
  screen: 'Contacts',
  input_schema: objectSchema({ id: { type: 'string' }, accountId: { type: 'string' }, query: { type: 'string' } }),
  sideEffects: 'none',
  costEstimate: noCost,
  async execute(input, context) {
    const { GET } = await import('../../../app/api/contacts/route.js')
    const result = await callRoute(GET, context.request, { pathname: '/api/contacts', query: input.id ? { id: input.id, with: 'relations' } : { accountId: input.accountId } })
    if (result.contact) return result
    const needle = String(input.query || '').trim().toLowerCase()
    return { contacts: (result.contacts || []).filter(item => !needle || [item.name, item.email, item.phone].some(value => String(value || '').toLowerCase().includes(needle))).slice(0, 20) }
  },
})]
