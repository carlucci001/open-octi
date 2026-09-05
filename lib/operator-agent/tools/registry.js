import { accountTools } from './accounts.js'
import { activityTools } from './activities.js'
import { campaignTools } from './campaigns.js'
import { contactTools } from './contacts.js'
import { documentTools } from './documents.js'
import { invoiceTools } from './invoices.js'
import { leadTools } from './leads.js'
import { opportunityTools } from './opportunities.js'
import { pressTools } from './press.js'

export const OPERATOR_TOOLS = Object.freeze([
  ...accountTools, ...contactTools, ...opportunityTools, ...leadTools, ...campaignTools,
  ...pressTools, ...documentTools, ...activityTools, ...invoiceTools,
])

const BY_NAME = new Map(OPERATOR_TOOLS.map(item => [item.name, item]))
if (BY_NAME.size !== OPERATOR_TOOLS.length) throw new Error('Operator tool names must be unique')

export function getOperatorTool(name) {
  return BY_NAME.get(String(name || '')) || null
}

export function operatorToolMetadata() {
  return OPERATOR_TOOLS.map(item => ({
    name: item.name, purpose: item.purpose, description: item.description,
    inputs: Object.keys(item.input_schema.properties || {}), requiredInputs: item.input_schema.required || [],
    sideEffects: item.sideEffects, cost: item.costEstimate({}), screen: item.screen,
  }))
}
