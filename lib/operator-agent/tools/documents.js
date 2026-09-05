import { callRoute, noCost, objectSchema, tool } from './common.js'

export const documentTools = [tool({
  name: 'doc.write', description: 'Write a draft CRM Document through the existing Documents route.', purpose: 'Persist a plan, transcript, brief, or other reviewable artifact.', screen: 'Documents',
  input_schema: objectSchema({ title: { type: 'string' }, body: { type: 'string' }, accountId: { type: 'string' }, accountName: { type: 'string' }, projectId: { type: 'string' }, documentType: { type: 'string' } }, ['title', 'body']), sideEffects: 'writes', costEstimate: noCost,
  async execute(input, context) {
    const { POST } = await import('../../../app/api/documents/route.js')
    return callRoute(POST, context.request, { pathname: '/api/documents', method: 'POST', body: { action: 'save', title: input.title, body: input.body, clientId: input.accountId || '', clientName: input.accountName || '', projectId: input.projectId || '', status: 'draft', values: { operatorAgent: true, documentType: input.documentType || 'operator-agent' } } })
  },
})]
