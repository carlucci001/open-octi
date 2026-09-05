import { noCost, objectSchema, tool } from './common.js'

export const pressTools = [
  tool({
    name: 'press.query', description: 'Query the existing Press Desk contact index by beat and geography.', purpose: 'Find ranked media contacts without creating or sending a campaign.', screen: 'Press Desk > Query',
    input_schema: objectSchema({ query: { type: 'string' }, beats: { type: 'array', items: { type: 'string' } }, state: { type: 'string' }, metro: { type: 'string' }, limit: { type: 'integer' } }), sideEffects: 'none', costEstimate: noCost,
    async execute(input) { const { runPressAgentTool } = await import('../../press/agent-tools.js'); return runPressAgentTool('fcc_press_query', input) },
  }),
  tool({
    name: 'press.list_save', description: 'Save a reviewed Press Desk result list for the signed-in operator.', purpose: 'Keep a reviewed set of media contacts for later human-controlled campaign work.', screen: 'Press Desk > Saved Lists',
    input_schema: objectSchema({ name: { type: 'string' }, contactIds: { type: 'array', items: { type: 'string' } }, query: { type: 'object' } }, ['name', 'contactIds']), sideEffects: 'writes', costEstimate: noCost,
    async execute(input, context) { const { runPressAgentTool } = await import('../../press/agent-tools.js'); return runPressAgentTool('fcc_press_list_save', input, { ownerUserId: context.user?.id }) },
  }),
]
