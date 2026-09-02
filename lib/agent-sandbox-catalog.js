export const SANDBOX_STAGES = [
  { id: 'imported', label: 'Imported', description: 'Template has source, license, and role metadata only.' },
  { id: 'sandboxed', label: 'Sandboxed', description: 'Runs only against mock CRM data and canned scenarios.' },
  { id: 'approved-template', label: 'Approved template', description: 'Safe enough to create a CRM draft agent.' },
  { id: 'production-candidate', label: 'Production candidate', description: 'Ready for explicit model, tools, and OpenClaw promotion review.' },
]

export const SANDBOX_GATES = [
  'Source and license captured',
  'No live CRM write tools',
  'No customer-facing voice route',
  'Mock data scenario passed',
  'Tool risk policy selected',
  'Owner approval before promotion',
]

export const PRODUCT_MODULES = [
  {
    id: 'sales-ops-pack',
    name: 'Sales Ops Pack',
    owner: 'Revenue',
    agentIds: ['sales-pipeline-analyst', 'sales-outbound-strategist', 'sales-proposal-strategist'],
    outcome: 'Pipeline risk, outbound planning, and proposal support for leased CRM clients.',
    status: 'Candidate pack',
  },
  {
    id: 'marketing-ops-pack',
    name: 'Marketing Ops Pack',
    owner: 'Marketing',
    agentIds: ['paid-media-auditor', 'paid-media-creative-strategist', 'marketing-linkedin-content-creator'],
    outcome: 'Campaign audit, creative review, and channel-specific content workflow.',
    status: 'Needs scenario design',
  },
  {
    id: 'finance-back-office-pack',
    name: 'Finance Back Office Pack',
    owner: 'Finance',
    agentIds: ['finance-bookkeeper-controller', 'finance-fpa-analyst', 'support-finance-tracker'],
    outcome: 'Back-office summaries, cash-flow flags, and recurring provider review.',
    status: 'High-value sandbox',
  },
  {
    id: 'security-review-pack',
    name: 'Security Review Pack',
    owner: 'Engineering',
    agentIds: ['security-appsec-engineer', 'security-compliance-auditor', 'engineering-code-reviewer'],
    outcome: 'AppSec, compliance, and code-review support before client delivery.',
    status: 'Internal-only first',
  },
  {
    id: 'product-research-pack',
    name: 'Product Research Pack',
    owner: 'Product',
    agentIds: ['product-feedback-synthesizer', 'product-manager', 'product-sprint-prioritizer'],
    outcome: 'Feedback clustering, roadmap shaping, and product discovery support.',
    status: 'Candidate pack',
  },
]

export const THIRD_PARTY_AGENT_TEMPLATES = [
  {
    id: 'sales-pipeline-analyst',
    name: 'Pipeline Analyst',
    sourceRepo: 'msitarzewski/agency-agents',
    sourcePath: 'sales/sales-pipeline-analyst.md',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/blob/main/sales/sales-pipeline-analyst.md',
    license: 'MIT',
    division: 'Sales',
    module: 'Sales Ops Pack',
    summary: 'Diagnoses pipeline health, deal velocity, forecast accuracy, and intervention risks.',
    bestUse: 'Weekly pipeline review, stalled deal triage, and sales coaching.',
    defaultRuntime: 'sandbox-only',
    stage: 'sandboxed',
    risk: 'medium',
    readiness: 74,
    toolPolicy: 'Read-only CRM analysis until explicitly promoted.',
    scenarios: [
      'Review a mock pipeline with 12 deals and identify the three highest-risk opportunities.',
      'Explain why forecast confidence changed after two deals slipped stages.',
      'Suggest next actions for a deal with no activity in 18 days.',
    ],
    promotionChecklist: [
      'Map pipeline fields to Command Center opportunity data.',
      'Add read-only pipeline tools only.',
      'Require owner review before any task or note creation.',
    ],
  },
  {
    id: 'sales-outbound-strategist',
    name: 'Outbound Strategist',
    sourceRepo: 'msitarzewski/agency-agents',
    sourcePath: 'sales/sales-outbound-strategist.md',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/blob/main/sales/sales-outbound-strategist.md',
    license: 'MIT',
    division: 'Sales',
    module: 'Sales Ops Pack',
    summary: 'Plans outbound sequences, audience strategy, and positioning for new offers.',
    bestUse: 'Lead list activation, follow-up cadence, and campaign messaging.',
    defaultRuntime: 'sandbox-only',
    stage: 'imported',
    risk: 'medium',
    readiness: 66,
    toolPolicy: 'No email sending or CRM mutation in sandbox.',
    scenarios: [
      'Create a five-touch sequence for a mock construction services lead segment.',
      'Rewrite an outreach angle for three buyer personas.',
      'Flag claims that need proof before a campaign ships.',
    ],
    promotionChecklist: [
      'Connect only to draft outreach tooling.',
      'Require approval before email, SMS, or social publishing.',
      'Add brand voice review for each tenant.',
    ],
  },
  {
    id: 'finance-fpa-analyst',
    name: 'FP&A Analyst',
    sourceRepo: 'msitarzewski/agency-agents',
    sourcePath: 'finance/finance-fpa-analyst.md',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/blob/main/finance/finance-fpa-analyst.md',
    license: 'MIT',
    division: 'Finance',
    module: 'Finance Back Office Pack',
    summary: 'Turns operating data into forecast, variance, and cash planning narratives.',
    bestUse: 'Monthly management summary, scenario planning, and recurring spend review.',
    defaultRuntime: 'sandbox-only',
    stage: 'imported',
    risk: 'high',
    readiness: 61,
    toolPolicy: 'Use sanitized finance fixtures until accounting rules are reviewed.',
    scenarios: [
      'Explain a mock margin drop across three customer contracts.',
      'Summarize recurring provider spend and renewal exposure.',
      'Draft a conservative three-month cash view from fixture data.',
    ],
    promotionChecklist: [
      'Separate advice from accounting facts.',
      'Block payment and Stripe write tools.',
      'Route financial assumptions through owner approval.',
    ],
  },
  {
    id: 'paid-media-auditor',
    name: 'Paid Media Auditor',
    sourceRepo: 'msitarzewski/agency-agents',
    sourcePath: 'paid-media/paid-media-auditor.md',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/blob/main/paid-media/paid-media-auditor.md',
    license: 'MIT',
    division: 'Paid Media',
    module: 'Marketing Ops Pack',
    summary: 'Reviews ad account structure, tracking, spend waste, and optimization opportunities.',
    bestUse: 'Client audit product, campaign rescue, and pre-launch ad review.',
    defaultRuntime: 'sandbox-only',
    stage: 'sandboxed',
    risk: 'medium',
    readiness: 70,
    toolPolicy: 'Read-only exports and screenshots only.',
    scenarios: [
      'Audit a mock campaign export and identify spend waste.',
      'Rank tracking issues by revenue impact.',
      'Prepare a client-safe summary of findings.',
    ],
    promotionChecklist: [
      'Use export imports before live ad API access.',
      'Require client account scope selection.',
      'Keep campaign changes approval-gated.',
    ],
  },
  {
    id: 'engineering-code-reviewer',
    name: 'Code Reviewer',
    sourceRepo: 'msitarzewski/agency-agents',
    sourcePath: 'engineering/engineering-code-reviewer.md',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/blob/main/engineering/engineering-code-reviewer.md',
    license: 'MIT',
    division: 'Engineering',
    module: 'Security Review Pack',
    summary: 'Reviews code for correctness, maintainability, security, and performance.',
    bestUse: 'Internal delivery QA and pull-request review before client handoff.',
    defaultRuntime: 'sandbox-only',
    stage: 'approved-template',
    risk: 'low',
    readiness: 82,
    toolPolicy: 'Read-only repository context; no commit, push, or deploy tools.',
    scenarios: [
      'Review a mock route handler for auth and data leakage issues.',
      'Find maintainability risks in a small React component.',
      'Produce a findings-first review with severity labels.',
    ],
    promotionChecklist: [
      'Bind to repository read tools only.',
      'Keep commit and deploy actions disabled.',
      'Use findings-first output format.',
    ],
  },
  {
    id: 'product-feedback-synthesizer',
    name: 'Feedback Synthesizer',
    sourceRepo: 'msitarzewski/agency-agents',
    sourcePath: 'product/product-feedback-synthesizer.md',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/blob/main/product/product-feedback-synthesizer.md',
    license: 'MIT',
    division: 'Product',
    module: 'Product Research Pack',
    summary: 'Clusters feedback, extracts product themes, and turns user input into decisions.',
    bestUse: 'CRM notes, support comments, survey feedback, and product roadmap inputs.',
    defaultRuntime: 'sandbox-only',
    stage: 'imported',
    risk: 'low',
    readiness: 68,
    toolPolicy: 'Read-only text analysis with tenant-scoped fixtures.',
    scenarios: [
      'Cluster 30 mock feedback notes into product themes.',
      'Separate bug reports from feature requests.',
      'Draft a roadmap recommendation with confidence levels.',
    ],
    promotionChecklist: [
      'Add tenant and source labels to every input.',
      'Prevent cross-client feedback leakage.',
      'Keep recommendations marked as draft.',
    ],
  },
]

export function getSandboxMetrics(templates = THIRD_PARTY_AGENT_TEMPLATES) {
  const total = templates.length
  const byStage = SANDBOX_STAGES.map(stage => ({
    ...stage,
    count: templates.filter(agent => agent.stage === stage.id).length,
  }))
  const highRisk = templates.filter(agent => agent.risk === 'high').length
  const averageReadiness = total
    ? Math.round(templates.reduce((sum, agent) => sum + (agent.readiness || 0), 0) / total)
    : 0

  return { total, byStage, highRisk, averageReadiness }
}

export function findProductModuleForAgent(agentId) {
  return PRODUCT_MODULES.find(module => module.agentIds.includes(agentId)) || null
}
