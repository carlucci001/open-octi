const META = { provider: 'mock', model: 'operator-agent-scripted-proof', usage: { inputTokens: 0, outputTokens: 0 } }

function has(messages, value) {
  return messages.some(item => String(item.content || '').includes(value))
}

function hasToolResult(messages, name) {
  return has(messages, `Tool ${name} result:`) || has(messages, `Approved tool result for ${name}:`)
}

export async function scriptedOperatorProofModel({ messages = [] } = {}) {
  if (hasToolResult(messages, 'campaign.draft')) return { ...META, text: 'Joe Smith now has a Lead Plan, three fixture leads in his requested list, and a campaign draft Document. Nothing was sent.', toolCalls: [] }
  if (hasToolResult(messages, 'leads.build_run')) return { ...META, text: 'The proven fixture run completed. I prepared the campaign draft proposal.', toolCalls: [{ id: 'proof-campaign', name: 'campaign.draft', input: { accountId: 'oa1-joe-smith', accountName: 'Joe Smith', contactName: 'Joe', brandContext: 'farrington_dev', title: 'Joe Smith - First Plumbing Campaign Draft' } }] }
  if (hasToolResult(messages, 'doc.write')) return { ...META, text: 'The Lead Plan is saved. I prepared the first proven-source build proposal.', toolCalls: [{ id: 'proof-build', name: 'leads.build_run', input: { category: 'remodeling-specialty-trades', location: 'City, ST', limit: 3, query: 'recent plumbing permits', destination: 'farrington_dev', leadListId: 'oa1-joe-plumbing', sourceIds: ['oa1-proven-plumbing-fixture'] } }] }
  if (hasToolResult(messages, 'leads.list_sources')) return { ...META, toolCalls: [{ id: 'proof-plan', name: 'doc.write', input: {
    title: 'Joe Smith - Lead Plan', accountId: 'oa1-joe-smith', accountName: 'Joe Smith', documentType: 'lead-plan',
    body: '# Lead Plan\n\n## Business fit\n\n- Trade: Plumbing\n- Service area: City, ST and Buncombe County\n- Ideal job: Water heaters and repipes around $2,500\n- Current sources: Referrals\n- Offer: Same-day response\n- Capacity: Five jobs per week\n\n## Proven source fit\n\n- OA1 proven plumbing fixture: recent plumbing permit intent in the requested area.\n\n## Lists to build\n\n- Joe Smith plumbing leads\n\n## First build-run proposal\n\nThree leads from the proven fixture into oa1-joe-plumbing.\n\n## First campaign draft\n\nUse the existing Farrington email and dialer template sets; save as a Document and do not send.\n',
  } }] }
  if (hasToolResult(messages, 'account.lookup')) return { ...META, toolCalls: [{ id: 'proof-sources', name: 'leads.list_sources', input: { vertical: 'plumbing', location: 'City, ST' } }] }
  return { ...META, toolCalls: [{ id: 'proof-account', name: 'account.lookup', input: { query: 'Joe Smith' } }] }
}
