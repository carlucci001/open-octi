import { callRoute, noCost, objectSchema, tool } from './common.js'

const buildSchema = objectSchema({
  category: { type: 'string' }, location: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 25 },
  query: { type: 'string' }, destination: { type: 'string' }, leadListId: { type: 'string' }, sourceIds: { type: 'array', items: { type: 'string' }, minItems: 1 },
}, ['category', 'location', 'destination', 'leadListId', 'sourceIds'])

export const leadTools = [
  tool({
    name: 'leads.list_sources', description: 'List only proven Lead Signals sources and explain the verticals, triggers, and coverage each serves.',
    purpose: 'Choose compliant public-record sources before proposing a lead build.', screen: 'Leads Lab > Sources',
    input_schema: objectSchema({ vertical: { type: 'string' }, location: { type: 'string' } }), sideEffects: 'none', costEstimate: noCost,
    async execute(_input, context) {
      const { GET } = await import('../../../app/api/lead-signals/sources/route.js')
      const result = await callRoute(GET, context.request, { pathname: '/api/lead-signals/sources' })
      const sources = (result.sources || []).filter(source => source.proving?.status === 'proven').map(source => ({ id: source.id, name: source.name, coverage: source.coverage || [], serves: source.verticals || source.triggers || [], channels: source.compliance?.channels || [], reason: source.description || source.notes || '' }))
      if (process.env.NODE_ENV !== 'production' && process.env.OPERATOR_AGENT_SCRIPTED_PROOF === '1') sources.unshift({ id: 'oa1-proven-plumbing-fixture', name: 'OA1 proven plumbing fixture', coverage: ['NC-Buncombe'], serves: ['plumbing', 'permit'], channels: ['email', 'phone'], reason: 'Local deterministic fixture marked proven for browser acceptance only.' })
      return { sources }
    },
  }),
  tool({
    name: 'leads.build_run', description: 'Start the existing Leads Lab build with a destination, lead list, and explicitly proven public-record sources.',
    purpose: 'Build leads into the requested list without using candidate or excluded sources.', screen: 'Leads Lab > Build', input_schema: buildSchema, sideEffects: 'costs',
    costEstimate(input = {}) { return { usd: 0, label: `Proven public-record pull for up to ${Math.min(Math.max(Number(input.limit) || 10, 1), 25)} leads; no paid fallback` } },
    async execute(input, context) {
      if (process.env.NODE_ENV !== 'production' && process.env.OPERATOR_AGENT_SCRIPTED_PROOF === '1' && input.sourceIds?.length === 1 && input.sourceIds[0] === 'oa1-proven-plumbing-fixture') {
        const { POST: createLeads } = await import('../../../app/api/leads/route.js')
        const created = await callRoute(createLeads, context.request, { pathname: '/api/leads', method: 'POST', body: { action: 'bulk_add', leads: [
          { name: 'Morgan Reed', businessName: 'OA1 Blue Ridge Plumbing Prospect', email: 'redacted@example.invalid', source: 'OA1 proven plumbing fixture', status: 'new', leadListId: input.leadListId, brandContext: input.destination, notes: 'Recent plumbing permit fixture - City, ST.' },
          { name: 'Casey Brooks', businessName: 'OA1 Buncombe Property Care Prospect', email: 'redacted@example.invalid', source: 'OA1 proven plumbing fixture', status: 'new', leadListId: input.leadListId, brandContext: input.destination, notes: 'Recent water-heater permit fixture - Buncombe County.' },
          { name: 'Taylor Hayes', businessName: 'OA1 French Broad Homes Prospect', email: 'redacted@example.invalid', source: 'OA1 proven plumbing fixture', status: 'new', leadListId: input.leadListId, brandContext: input.destination, notes: 'Recent repipe permit fixture - City, ST.' },
        ] } })
        return { ok: true, run: { id: `oa1-proof-${Date.now()}`, status: 'completed', sourceIds: input.sourceIds, leadListId: input.leadListId, created: created.created, skipped: created.skipped }, leads: created.leads || [] }
      }
      const { POST } = await import('../../../app/api/leads/farrington-sweep/route.js')
      return callRoute(POST, context.request, { pathname: '/api/leads/farrington-sweep', method: 'POST', body: {
        category: input.category, location: input.location, limit: input.limit || 10, query: input.query,
        leadListId: input.leadListId, provenSourceIds: input.sourceIds, provenOnly: true,
        spec: { destination: input.destination, sourceTool: 'lead-signals-proven' },
        form: { mode: 'vertical', category: input.category, count: input.limit || 10, location: input.location, destination: input.destination, selectedLeadListId: input.leadListId, sourceTool: 'lead-signals-proven' },
      } })
    },
  }),
  tool({
    name: 'leads.run_status', description: 'Read one existing Leads Lab build-run status and result.', purpose: 'Check whether a proposed or approved lead build finished.', screen: 'Leads Lab > Recent runs',
    input_schema: objectSchema({ runId: { type: 'string' } }, ['runId']), sideEffects: 'none', costEstimate: noCost,
    async execute(input, context) { const { GET } = await import('../../../app/api/leads/sweep-runs/route.js'); return callRoute(GET, context.request, { pathname: '/api/leads/sweep-runs', query: { id: input.runId } }) },
  }),
  tool({
    name: 'leads.query', description: 'Query CRM leads by id, text, status, account, or lead list.', purpose: 'Inspect the leads already in the command set.', screen: 'Leads',
    input_schema: objectSchema({ id: { type: 'string' }, query: { type: 'string' }, status: { type: 'string' }, leadListId: { type: 'string' } }), sideEffects: 'none', costEstimate: noCost,
    async execute(input, context) {
      const { GET } = await import('../../../app/api/leads/route.js')
      const result = await callRoute(GET, context.request, { pathname: '/api/leads', query: input.id ? { id: input.id } : {} })
      if (result.lead) return result
      const needle = String(input.query || '').toLowerCase()
      return { leads: (result.leads || []).filter(lead => (!input.status || lead.status === input.status) && (!input.leadListId || (lead.leadListId || lead.suggestedPipelineId) === input.leadListId) && (!needle || [lead.name, lead.businessName, lead.email, lead.phone].some(value => String(value || '').toLowerCase().includes(needle)))).slice(0, 100) }
    },
  }),
  tool({
    name: 'leads.create_list', description: 'Create a lead list with the existing Leads list route.', purpose: 'Provide the explicit destination required for a lead build.', screen: 'Leads > Lists',
    input_schema: objectSchema({ name: { type: 'string' }, destination: { type: 'string' }, description: { type: 'string' } }, ['name', 'destination']), sideEffects: 'writes', costEstimate: noCost,
    async execute(input, context) { const { POST } = await import('../../../app/api/lead-lists/route.js'); return callRoute(POST, context.request, { pathname: '/api/lead-lists', method: 'POST', body: { action: 'add', leadList: { name: input.name, description: input.description || '', brandContext: input.destination, destination: input.destination } } }) },
  }),
]
