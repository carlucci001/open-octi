import { callRoute, noCost, objectSchema, tool } from './common.js'

function fill(value, vars) {
  return String(value || '').replace(/\{(contact|company|brand)\}/g, (_m, key) => vars[key] || '')
}

function scriptText(script = {}) {
  return (script.sections || []).flatMap(section => [`## ${section.heading || 'Call'}`, ...(section.lines || [])]).join('\n\n')
}

export const campaignTools = [tool({
  name: 'campaign.draft',
  description: 'Create an email and dialer-script campaign draft from the existing editable template sets, saved as a CRM Document. It never sends.',
  purpose: 'Prepare reviewable outreach after the lead plan and list are known.', screen: 'Leads > Email Templates and Call Scripts; Documents',
  input_schema: objectSchema({ accountId: { type: 'string' }, accountName: { type: 'string' }, contactName: { type: 'string' }, brandContext: { type: 'string' }, emailTemplateId: { type: 'string' }, scriptId: { type: 'string' }, title: { type: 'string' } }, ['accountId', 'accountName']),
  sideEffects: 'writes', costEstimate: noCost,
  async execute(input, context) {
    const [{ GET: getEmails }, { GET: getScripts }, { POST: saveDocument }] = await Promise.all([
      import('../../../app/api/email-templates/route.js'), import('../../../app/api/scripts/route.js'), import('../../../app/api/documents/route.js'),
    ])
    const [emailResult, scripts] = await Promise.all([
      callRoute(getEmails, context.request, { pathname: '/api/email-templates' }), callRoute(getScripts, context.request, { pathname: '/api/scripts' }),
    ])
    const templates = emailResult.templates || []
    const template = templates.find(item => item.id === input.emailTemplateId) || templates.find(item => item.brandContext === (input.brandContext || 'farrington_dev')) || templates[0]
    const script = (scripts || []).find(item => item.id === input.scriptId) || (scripts || []).find(item => item.campaign === (input.brandContext || 'farrington_dev')) || (scripts || [])[0]
    if (!template || !script) throw new Error('The existing email and call-script template sets are required')
    const vars = { contact: input.contactName || 'there', company: input.accountName, brand: input.brandContext || 'Farrington Development' }
    const body = `# Email draft\n\nSubject: ${fill(template.subject, vars)}\n\n${fill(template.body, vars)}\n\n# Dialer script\n\n${scriptText(script)}`
    const saved = await callRoute(saveDocument, context.request, { pathname: '/api/documents', method: 'POST', body: { action: 'save', title: input.title || `${input.accountName} - First Campaign Draft`, clientId: input.accountId, clientName: input.accountName, body, status: 'draft', values: { operatorAgent: true, emailTemplateId: template.id, scriptId: script.id, neverSent: true } } })
    return { ...saved, sent: false, emailTemplateId: template.id, scriptId: script.id }
  },
})]
