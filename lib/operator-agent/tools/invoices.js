import { callRoute, noCost, objectSchema, tool } from './common.js'

export const invoiceTools = [tool({
  name: 'invoice.create', description: 'Create a draft invoice through the existing Finance route. Sending remains a separate human click.', purpose: 'Prepare a draft receivable without emailing or opening Checkout.', screen: 'Finance > Invoices',
  input_schema: objectSchema({ clientId: { type: 'string' }, clientName: { type: 'string' }, project: { type: 'string' }, projectId: { type: 'string' }, items: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, quantity: { type: 'number' }, rate: { type: 'number' } }, required: ['description', 'quantity', 'rate'] } }, dueDate: { type: 'string' }, notes: { type: 'string' } }, ['clientId', 'items']), sideEffects: 'writes', costEstimate: noCost,
  async execute(input, context) {
    const { POST } = await import('../../../app/api/invoices/route.js')
    const result = await callRoute(POST, context.request, { pathname: '/api/invoices', method: 'POST', body: { action: 'create', ...input } })
    return { ...result, sent: false }
  },
})]
