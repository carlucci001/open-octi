import { callRoute, noCost, objectSchema, tool } from './common.js'

export const activityTools = [tool({
  name: 'activity.log', description: 'Log a CRM Activity with operator-agent actor attribution.', purpose: 'Record work performed or decisions made by the operator agent.', screen: 'Activities',
  input_schema: objectSchema({ type: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string' }, accountId: { type: 'string' }, contactId: { type: 'string' }, leadId: { type: 'string' }, opportunityId: { type: 'string' }, projectId: { type: 'string' } }, ['subject']), sideEffects: 'writes', costEstimate: noCost,
  async execute(input, context) {
    const { POST } = await import('../../../app/api/activities/route.js')
    const linkedTo = Object.fromEntries(['accountId', 'contactId', 'leadId', 'opportunityId', 'projectId'].filter(key => input[key]).map(key => [key, input[key]]))
    return callRoute(POST, context.request, { pathname: '/api/activities', method: 'POST', body: { action: 'add', activity: { type: input.type || 'operator_agent', subject: input.subject, body: input.body || '', linkedTo, agentId: 'operator-agent', meta: { actor: 'operator-agent' } } } })
  },
})]
