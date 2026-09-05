import { callRoute, noCost, objectSchema, tool } from './common.js'

export const opportunityTools = [tool({
  name: 'opportunity.create',
  description: 'Create an opportunity through the existing Pipelines route.',
  purpose: 'Open a tracked deal against an account and pipeline stage.',
  screen: 'Pipelines',
  input_schema: objectSchema({ name: { type: 'string' }, accountId: { type: 'string' }, contactId: { type: 'string' }, pipelineId: { type: 'string' }, stageId: { type: 'string' }, value: { type: 'number' }, notes: { type: 'string' } }, ['name', 'accountId']),
  sideEffects: 'writes',
  costEstimate: noCost,
  async execute(input, context) {
    const { POST } = await import('../../../app/api/opportunities/route.js')
    return callRoute(POST, context.request, { pathname: '/api/opportunities', method: 'POST', body: { action: 'add', opportunity: input } })
  },
})]
