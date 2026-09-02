import { readData, writeData } from '@/lib/dataStore'
import { brandAssetsFor } from '@/lib/brand-assets'

const CATALOG_FILE = 'product-catalog.json'
const BRAND_ASSETS = brandAssetsFor()

export const DEFAULT_PAYMENT_OPTIONS = [
  {
    id: 'stripe-retainer',
    name: 'Stripe build-slot retainer',
    copy: 'Pay the retainer today through secure embedded Stripe checkout. Balance follows the signed implementation agreement.',
  },
  {
    id: 'stripe-full-payment',
    name: 'Pay the full implementation price',
    copy: 'Pay the published implementation price through secure embedded Stripe checkout. Work is queued only after Stripe confirms payment.',
  },
  {
    id: 'stripe-financing',
    name: 'Request business financing',
    copy: 'Send Farrington Development a financing request for follow-up. This does not submit an application to a lender or promise approval, terms, or availability.',
  },
  {
    id: 'in-house-milestones',
    name: 'Request a milestone plan',
    copy: 'Ask Farrington Development to review a milestone payment structure. No plan is active until both sides approve written terms.',
  },
  {
    id: 'lease-to-own',
    name: 'Request lease-to-own review',
    copy: 'Ask Farrington Development to review a possible lease-to-own structure. Availability and terms are not guaranteed, and nothing is activated by this request.',
  },
]

export const DEFAULT_LICENSE_TEMPLATES = [
  {
    id: 'source-commercial',
    name: 'Commercial Source License',
    copy: 'Buyer receives source code for the licensed deployment while Farrington Development retains ownership of reusable platform IP, frameworks, templates, and underlying know-how.',
    sourceAccess: 'included',
    allowedDeploymentModels: ['on-premise', 'private-cloud', 'hybrid'],
    allowedLicenseTypes: ['single-use', 'multi-user', 'site', 'enterprise'],
    transfer: 'non-transferable',
    redistribution: 'prohibited',
    audit: 'License verification and support eligibility may be checked by the installed product.',
    documentTemplateId: 'command-center-commercial-source-license',
  },
  {
    id: 'enterprise-on-prem',
    name: 'Enterprise On-Prem Source License',
    copy: 'Customer may install and operate the licensed Command Center inside its own environment for the licensed seats, users, tenants, and instances. Source is delivered for operation, audit, continuity, and approved internal modification only.',
    sourceAccess: 'included',
    allowedDeploymentModels: ['on-premise', 'private-cloud', 'local-only'],
    allowedLicenseTypes: ['site', 'enterprise'],
    transfer: 'requires written consent',
    redistribution: 'prohibited except internal affiliates listed in the order form',
    audit: 'Customer must keep deployment, user, tenant, and instance records sufficient to verify license scope and support eligibility.',
    documentTemplateId: 'command-center-enterprise-on-prem-license',
  },
  {
    id: 'managed-commercial',
    name: 'Managed Commercial Subscription License',
    copy: 'Customer receives hosted access to the managed Command Center service. Farrington Development operates the platform; customer receives use rights, configuration, support, and agreed service modules, but not source redistribution rights.',
    sourceAccess: 'not-included',
    allowedDeploymentModels: ['managed-cloud', 'off-premise', 'hybrid'],
    allowedLicenseTypes: ['single-use', 'multi-user', 'site', 'enterprise'],
    transfer: 'non-transferable',
    redistribution: 'prohibited',
    audit: 'Usage, seats, agents, calls, storage, and add-ons may be measured for billing, support, and abuse prevention.',
    documentTemplateId: 'command-center-managed-subscription-license',
  },
  {
    id: 'evaluation-trial',
    name: 'Evaluation / Pilot License',
    copy: 'Customer may evaluate the product for a limited internal pilot. No production reliance, resale, redistribution, public hosting, or source reuse outside the pilot is permitted unless converted to a paid commercial license.',
    sourceAccess: 'limited-or-none',
    allowedDeploymentModels: ['managed-cloud', 'private-cloud', 'local-only'],
    allowedLicenseTypes: ['single-use', 'developer', 'internal'],
    transfer: 'non-transferable',
    redistribution: 'prohibited',
    audit: 'Pilot access may expire automatically and may be disabled if usage exceeds the agreed evaluation scope.',
    documentTemplateId: 'command-center-commercial-source-license',
  },
  {
    id: 'mit-open-source',
    name: 'MIT Open Source License',
    copy: 'Permissive open-source option. Recipients can use, copy, modify, merge, publish, distribute, sublicense, and sell copies when the copyright and permission notice are preserved. This is useful for a community/open-core component, not for restricting paid commercial deployments.',
    sourceAccess: 'public',
    allowedDeploymentModels: ['on-premise', 'off-premise', 'private-cloud', 'managed-cloud', 'hybrid', 'local-only'],
    allowedLicenseTypes: ['developer', 'internal', 'single-use', 'multi-user', 'site', 'enterprise'],
    transfer: 'permitted by license terms',
    redistribution: 'permitted with copyright and license notice',
    audit: 'No license-key audit should be required for the MIT-licensed code itself; paid services, hosted access, trademarks, support, and proprietary add-ons can be licensed separately.',
    documentTemplateId: 'open-source-release-addendum',
  },
  {
    id: 'apache-2-open-source',
    name: 'Apache 2.0 Open Source License',
    copy: 'Permissive open-source option with express patent-license language and notice requirements. Good candidate when outside developers or enterprise buyers care about patent grants. Paid support, hosting, private modules, trademarks, and warranties can remain separate.',
    sourceAccess: 'public',
    allowedDeploymentModels: ['on-premise', 'off-premise', 'private-cloud', 'managed-cloud', 'hybrid', 'local-only'],
    allowedLicenseTypes: ['developer', 'internal', 'single-use', 'multi-user', 'site', 'enterprise'],
    transfer: 'permitted by license terms',
    redistribution: 'permitted with required license and notice handling',
    audit: 'No license-key audit should be required for Apache-licensed code itself; audit applies only to paid proprietary components, support, hosting, or add-ons.',
    documentTemplateId: 'open-source-release-addendum',
  },
  {
    id: 'agpl-commercial-dual',
    name: 'AGPL / Commercial Dual License',
    copy: 'Dual-license strategy: community users may use the open-source AGPL version if they comply with copyleft/network-source obligations, while commercial buyers can purchase a separate commercial license for private proprietary deployment, support, warranty, and source-delivery terms.',
    sourceAccess: 'public-or-commercial',
    allowedDeploymentModels: ['on-premise', 'off-premise', 'private-cloud', 'managed-cloud', 'hybrid', 'local-only'],
    allowedLicenseTypes: ['developer', 'internal', 'site', 'enterprise'],
    transfer: 'AGPL rights follow AGPL; commercial transfer requires written consent',
    redistribution: 'AGPL redistribution permitted under AGPL; commercial redistribution prohibited unless stated in order form',
    audit: 'Commercial license may verify paid deployment scope; AGPL community code should rely on license compliance rather than product activation.',
    documentTemplateId: 'open-source-release-addendum',
  },
  {
    id: 'open-core-commercial-addons',
    name: 'Open Core + Commercial Add-ons',
    copy: 'Core code can be released under an OSI-approved open-source license while premium modules, hosted services, branded assets, voices, support, migration tooling, and customer-specific automations remain commercially licensed.',
    sourceAccess: 'mixed',
    allowedDeploymentModels: ['on-premise', 'off-premise', 'private-cloud', 'managed-cloud', 'hybrid', 'local-only'],
    allowedLicenseTypes: ['developer', 'internal', 'single-use', 'multi-user', 'site', 'enterprise'],
    transfer: 'open core follows its open-source license; commercial add-ons are non-transferable',
    redistribution: 'open core permitted under its license; commercial add-ons prohibited',
    audit: 'Only proprietary modules, hosted services, paid add-ons, and support entitlements should use license-key or account verification.',
    documentTemplateId: 'open-source-release-addendum',
  },
]

export const DEFAULT_SUPPORT_PLANS = [
  {
    id: 'implementation-support',
    name: 'Implementation Support',
    cadence: 'Private agreement',
    responseTime: 'Priority business-hours response',
    copy: 'Launch support, implementation guidance, operational handoff, and controlled update planning.',
    monthlyFee: 0,
  },
  {
    id: 'maintenance-retainer',
    name: 'Maintenance Retainer',
    cadence: 'Monthly',
    responseTime: 'Priority response with scheduled maintenance windows',
    copy: 'Ongoing fixes, version updates, security posture reviews, and product support after handoff.',
    monthlyFee: 0,
  },
]

export const DEFAULT_ADD_ONS = [
  {
    id: 'white-label-pack',
    name: 'White-label brand pack',
    price: 15000,
    stripePriceId: 'price_1TekbuGvBNceuETKNLqWGJxN',
    copy: 'Custom brand shell, naming, color system, buyer-facing polish, and deployment-ready white-label presentation.',
  },
  {
    id: 'data-migration',
    name: 'Data migration sprint',
    price: 10000,
    stripePriceId: 'price_1TekbuGvBNceuETKvzAURjL3',
    copy: 'Structured import planning, source cleanup, CRM import support, and post-import verification.',
  },
  {
    id: 'voice-agent-launch',
    name: 'Voice agent launch pack',
    price: 12000,
    stripePriceId: 'price_1TekbvGvBNceuETKqhIeRlCq',
    copy: 'Production voice-agent setup, routing, testing, transfer behavior, and buyer-ready voice workflow tuning.',
  },
  {
    id: 'client-portal',
    name: 'Client portal deployment',
    price: 18000,
    stripePriceId: 'price_1TekbvGvBNceuETKIf8E84vN',
    copy: 'Client-facing portal configuration, role-safe access, document/payment surfaces, and handoff testing.',
  },
  {
    id: 'priority-launch',
    name: 'Priority launch window',
    price: 7500,
    stripePriceId: 'price_1TekbwGvBNceuETKQ2ljOsEd',
    copy: 'Accelerated scheduling, extra launch attention, and priority implementation coordination.',
  },
]

export const DEFAULT_VERSION_POLICY = {
  currentVersion: '1.0.0',
  channel: 'stable',
  updateEntitlement: 'Updates included only for the active support term or private maintenance agreement.',
  breakingChangePolicy: 'Major upgrades require review before deployment.',
  sourceDelivery: 'Repository or archive delivery after license and payment conditions are satisfied.',
}

export const PRICING_MODELS = [
  { id: 'one-time', name: 'One-time payment', stripeMode: 'payment' },
  { id: 'setup-deposit', name: 'Setup / deposit', stripeMode: 'payment' },
  { id: 'managed-subscription', name: 'Managed subscription', stripeMode: 'subscription' },
  { id: 'setup-plus-subscription', name: 'Setup + subscription', stripeMode: 'subscription' },
  { id: 'license', name: 'License / private install', stripeMode: 'payment' },
  { id: 'quote', name: 'Quote required', stripeMode: 'none' },
]

export const PACKAGE_CATEGORIES = [
  { id: 'managed', name: 'Managed plans' },
  { id: 'private-install', name: 'Private installs' },
  { id: 'license', name: 'Licenses' },
  { id: 'add-on', name: 'Add-ons' },
  { id: 'quote', name: 'Quote-required' },
]

const COMMAND_CENTER_MODULES = [
  { id: 'crm', name: 'CRM Core', copy: 'Accounts, contacts, leads, opportunities, tasks, notes, and activity timelines.' },
  { id: 'pipelines', name: 'Pipeline Management', copy: 'Lead stages, opportunity movement, qualification, forecasting, and follow-up control.' },
  { id: 'projects', name: 'Project Management', copy: 'Client projects, delivery states, implementation handoffs, and work tracking.' },
  { id: 'automation-starter', name: 'Automation Starter', copy: 'Start with one practical automation path, then connect it to Command Center records, tasks, and follow-up.' },
  { id: 'ai-staff', name: 'AI Staff Manager', copy: 'Manage internal agents, prompts, tools, voice settings, and operating roles.' },
  { id: 'customer-agent-manager', name: 'Own Agent Manager', copy: 'Give the buyer their own Agent Manager inside their own Command Center so automations can grow into managed agents.' },
  { id: 'automation-to-agent-migration', name: 'Automation-to-agent Migration', copy: 'Move from a first automation into customer-owned agents, tools, prompts, permissions, and handoff workflows.' },
  { id: 'lease-manager', name: 'AI Lease Manager', copy: 'Productized agent leasing, customer onboarding, and lease tracking.' },
  { id: 'portal', name: 'Client Portal', copy: 'Private client access, magic links, billing visibility, and project handoff.' },
  { id: 'documents', name: 'Documents', copy: 'Templates, sending, signatures, and stored client paperwork.' },
  { id: 'payments', name: 'Payments', copy: 'Stripe payments, invoices, subscriptions, and payment history.' },
  { id: 'voice', name: 'Voice Operations', copy: 'Twilio and ElevenLabs call paths, post-call summaries, and dispatch.' },
  { id: 'migrations', name: 'Migration Tools', copy: 'Data import posture, JSON-to-SQLite handling, source-of-truth checks, and rollout planning.' },
  { id: 'cicd', name: 'CI/CD Discipline', copy: 'Build checks, deployment rules, restore points, production runbook, and controlled release flow.' },
  { id: 'white-label', name: 'White Label', copy: 'Vertical workflows, branded deployment, and package-specific customization.' },
]

export const DEFAULT_CATALOG = {
  version: 1,
  updatedAt: null,
  products: [
    {
      id: 'farrington-command-center',
      slug: 'command-center',
      status: 'published',
      featured: true,
      category: 'Private AI Operations',
      name: 'Command Center',
      shortName: 'Command Center',
      eyebrow: 'Flagship Product',
      coverImage: '/product-covers/command-center-dashboard.png',
      productLogo: BRAND_ASSETS.productLogo,
      accentColor: '#3b82f6',
      headline: 'Choose the operating system you want to install.',
      summary: 'A private business operating platform that includes CRM, pipeline management, project management, AI staff management, AI lease operations, payments, documents, migration tooling, CI/CD deployment discipline, and ongoing operational support.',
      suiteCopy: 'CRM, pipelines, projects, CI/CD, migrations, AI staff, lease operations, billing, documents, client portal, and deployment support.',
      checkoutEndpoint: '/api/stripe/command-center-checkout',
      defaultPackageId: 'core',
      packages: [
        {
          id: 'operator-crm',
          name: 'Operator CRM',
          short: 'Operator',
          packageCategory: 'managed',
          pricingModel: 'managed-subscription',
          billingInterval: 'month',
          monthlyFee: 399,
          setupPrice: 1500,
          setupPriceHigh: 1500,
          retainer: 1500,
          label: 'Managed monthly workspace',
          copy: 'For a solo operator or small service business that needs leads, contacts, pipeline, projects, documents, payments basics, and one configured workflow without owning the full platform.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'documents', 'payments'],
        },
        {
          id: 'agency-builder',
          name: 'Agency Builder',
          short: 'Agency',
          packageCategory: 'managed',
          pricingModel: 'managed-subscription',
          billingInterval: 'month',
          monthlyFee: 799,
          setupPrice: 2500,
          setupPriceHigh: 2500,
          retainer: 2500,
          label: 'Managed agency operating kit',
          copy: 'For consultants, dev shops, and small agencies that need to bring in clients, manage delivery, track billing/docs, and run AI-assisted follow-up from one workspace.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'ai-staff', 'documents', 'payments', 'portal'],
        },
        {
          id: 'business-operating-kit',
          name: 'Business Operating Kit',
          short: 'Business Kit',
          packageCategory: 'managed',
          pricingModel: 'managed-subscription',
          billingInterval: 'month',
          monthlyFee: 1499,
          setupPrice: 5000,
          setupPriceHigh: 9999,
          retainer: 5000,
          label: 'Managed business command center',
          copy: 'For a small business that wants website or landing-page wiring, CRM, client portal, documents, payments, automation starter, and optional AI staff with launch support.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'ai-staff', 'portal', 'documents', 'payments'],
        },
        {
          id: 'core',
          name: 'Command Center Core',
          short: 'Core',
          packageCategory: 'private-install',
          pricingModel: 'setup-deposit',
          setupPrice: 25000,
          setupPriceHigh: 25000,
          retainer: 5000,
          stripePriceId: 'price_1TejptGvBNceuETKolKFIIAI',
          label: 'Private CRM command center',
          copy: 'For an owner-operated shop that needs a local CRM, pipeline, contacts, tasks, activities, documents, and private data control.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'documents', 'payments', 'migrations'],
        },
        {
          id: 'pro',
          name: 'Command Center Pro',
          short: 'Pro',
          packageCategory: 'private-install',
          pricingModel: 'setup-deposit',
          setupPrice: 45000,
          setupPriceHigh: 45000,
          retainer: 9000,
          stripePriceId: 'price_1TejptGvBNceuETKKjXO41bf',
          label: 'AI-enabled operating platform',
          copy: 'Adds AI staff management, guided workflows, pipeline operations, project delivery, deployment support, and the automation layer that makes the command center feel alive.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'ai-staff', 'customer-agent-manager', 'lease-manager', 'documents', 'payments', 'migrations', 'cicd'],
        },
        {
          id: 'team',
          name: 'Command Center Team',
          short: 'Team',
          packageCategory: 'private-install',
          pricingModel: 'setup-deposit',
          setupPrice: 75000,
          setupPriceHigh: 75000,
          retainer: 15000,
          stripePriceId: 'price_1TejpuGvBNceuETK2I0HuCS6',
          label: 'Multi-user command center',
          copy: 'For teams that need roles, client portal, billing, documents, activity timelines, pipeline governance, project delivery, and a managed launch.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'ai-staff', 'customer-agent-manager', 'automation-to-agent-migration', 'lease-manager', 'portal', 'documents', 'payments', 'voice', 'migrations', 'cicd'],
        },
        {
          id: 'platform',
          name: 'Command Center Platform',
          short: 'Platform',
          packageCategory: 'license',
          pricingModel: 'license',
          setupPrice: 125000,
          setupPriceHigh: 125000,
          retainer: 25000,
          stripePriceId: 'price_1TejpuGvBNceuETK0mtFaoDC',
          label: 'Full private business OS',
          copy: 'The executive deployment: white-label workflows, local or hybrid install, AI operations, pipeline governance, project command, migration planning, CI/CD, billing, and vertical customization.',
          modules: ['crm', 'pipelines', 'projects', 'automation-starter', 'ai-staff', 'customer-agent-manager', 'automation-to-agent-migration', 'lease-manager', 'portal', 'documents', 'payments', 'voice', 'white-label', 'migrations', 'cicd'],
        },
      ],
      modules: COMMAND_CENTER_MODULES,
      paymentOptions: DEFAULT_PAYMENT_OPTIONS,
      addOns: DEFAULT_ADD_ONS,
      licenseTemplates: DEFAULT_LICENSE_TEMPLATES,
      supportPlans: DEFAULT_SUPPORT_PLANS,
      versionPolicy: DEFAULT_VERSION_POLICY,
      versionHistory: [
        { version: '1.0.0', label: 'Version 1', date: '2026-05-11', notes: 'Version one catalog foundation: product, packages, licensing, support, and storefront API.' },
      ],
    },
  ],
}

function cleanId(value, fallback = '') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80)
}

function cleanString(value, fallback = '', limit = 2000) {
  return String(value ?? fallback).trim().slice(0, limit)
}

function normalizePackage(pkg = {}, index = 0) {
  const id = cleanId(pkg.id, `package-${index + 1}`)
  const name = cleanString(pkg.name, id || 'Package', 160)
  const pricingModel = cleanId(pkg.pricingModel || pkg.billingModel || (Number(pkg.monthlyFee || 0) > 0 ? 'managed-subscription' : 'setup-deposit'), 'setup-deposit')
  const setupPrice = Math.max(0, Number(pkg.setupPrice ?? pkg.price ?? 0) || 0)
  const setupPriceHigh = Math.max(0, Number(pkg.setupPriceHigh ?? pkg.high ?? setupPrice) || 0)
  return {
    id,
    name,
    short: cleanString(pkg.short, name.replace(/^Command Center\s*/i, '') || name, 60),
    packageCategory: cleanId(pkg.packageCategory || pkg.category || (pricingModel.includes('subscription') ? 'managed' : 'private-install'), ''),
    pricingModel,
    billingInterval: ['month', 'year', 'week', 'day'].includes(cleanId(pkg.billingInterval || pkg.interval, 'month')) ? cleanId(pkg.billingInterval || pkg.interval, 'month') : 'month',
    monthlyFee: Math.max(0, Number(pkg.monthlyFee ?? pkg.monthly ?? 0) || 0),
    setupPrice,
    setupPriceHigh,
    retainer: Math.max(0, Number(pkg.retainer ?? 0) || 0),
    label: cleanString(pkg.label, '', 160),
    copy: cleanString(pkg.copy || pkg.description, '', 900),
    modules: Array.isArray(pkg.modules) ? pkg.modules.map(v => cleanId(v)).filter(Boolean).slice(0, 40) : [],
    stripePriceId: cleanString(pkg.stripePriceId, '', 160),
    stripeMonthlyPriceId: cleanString(pkg.stripeMonthlyPriceId, '', 160),
    stripeSetupPriceId: cleanString(pkg.stripeSetupPriceId, '', 160),
    quoteRequired: Boolean(pkg.quoteRequired || pricingModel === 'quote'),
  }
}

function normalizeModule(mod = {}, index = 0) {
  const id = cleanId(mod.id, `module-${index + 1}`)
  return {
    id,
    name: cleanString(mod.name, id || 'Module', 120),
    copy: cleanString(mod.copy || mod.description, '', 600),
  }
}

function normalizePaymentOption(option = {}, index = 0) {
  const id = cleanId(option.id, `payment-${index + 1}`)
  const guardedRequestCopy = {
    'stripe-financing': {
      name: 'Request business financing',
      copy: 'Send Farrington Development a financing request for follow-up. This does not submit an application to a lender or promise approval, terms, or availability.',
    },
    'in-house-milestones': {
      name: 'Request a milestone plan',
      copy: 'Ask Farrington Development to review a milestone payment structure. No plan is active until both sides approve written terms.',
    },
    'lease-to-own': {
      name: 'Request lease-to-own review',
      copy: 'Ask Farrington Development to review a possible lease-to-own structure. Availability and terms are not guaranteed, and nothing is activated by this request.',
    },
  }[id]
  return {
    id,
    name: guardedRequestCopy?.name || cleanString(option.name || option.label, id || 'Payment option', 120),
    copy: guardedRequestCopy?.copy || cleanString(option.copy || option.description, '', 700),
  }
}

function normalizeAddOn(addOn = {}, index = 0) {
  const id = cleanId(addOn.id, `addon-${index + 1}`)
  const name = cleanString(addOn.name || addOn.label, id || 'Add-on', 140)
  return {
    id,
    name,
    price: Math.max(0, Number(addOn.price || addOn.amount || 0) || 0),
    stripePriceId: cleanString(addOn.stripePriceId, '', 160),
    copy: cleanString(addOn.copy || addOn.description, '', 700),
  }
}

function normalizeLicenseTemplate(template = {}, index = 0) {
  const id = cleanId(template.id, `license-${index + 1}`)
  return {
    id,
    name: cleanString(template.name, id || 'License', 140),
    copy: cleanString(template.copy || template.description, '', 1200),
    sourceAccess: cleanString(template.sourceAccess, 'included', 80),
    allowedDeploymentModels: Array.isArray(template.allowedDeploymentModels) ? template.allowedDeploymentModels.map(v => cleanId(v)).filter(Boolean).slice(0, 20) : ['on-premise', 'private-cloud', 'hybrid'],
    allowedLicenseTypes: Array.isArray(template.allowedLicenseTypes) ? template.allowedLicenseTypes.map(v => cleanId(v)).filter(Boolean).slice(0, 20) : ['single-use', 'multi-user', 'site', 'enterprise'],
    transfer: cleanString(template.transfer, 'non-transferable', 120),
    redistribution: cleanString(template.redistribution, 'prohibited', 120),
    audit: cleanString(template.audit, '', 500),
    documentTemplateId: cleanId(template.documentTemplateId, ''),
  }
}

function normalizeSupportPlan(plan = {}, index = 0) {
  const id = cleanId(plan.id, `support-${index + 1}`)
  return {
    id,
    name: cleanString(plan.name, id || 'Support Plan', 140),
    cadence: cleanString(plan.cadence, 'Private agreement', 120),
    responseTime: cleanString(plan.responseTime, '', 160),
    copy: cleanString(plan.copy || plan.description, '', 900),
    monthlyFee: Math.max(0, Number(plan.monthlyFee || 0) || 0),
  }
}

function normalizeVersionPolicy(policy = {}) {
  return {
    currentVersion: cleanString(policy.currentVersion, '1.0.0', 40),
    channel: cleanString(policy.channel, 'stable', 60),
    updateEntitlement: cleanString(policy.updateEntitlement, DEFAULT_VERSION_POLICY.updateEntitlement, 700),
    breakingChangePolicy: cleanString(policy.breakingChangePolicy, DEFAULT_VERSION_POLICY.breakingChangePolicy, 700),
    sourceDelivery: cleanString(policy.sourceDelivery, DEFAULT_VERSION_POLICY.sourceDelivery, 700),
  }
}

function normalizeVersionHistory(history = [], policy = {}) {
  const items = Array.isArray(history) ? history : []
  const normalized = items.map((entry, index) => ({
    version: cleanString(entry.version, index === 0 ? (policy.currentVersion || '1.0.0') : '', 40),
    label: cleanString(entry.label, index === 0 ? 'Version 1' : 'Release', 120),
    date: cleanString(entry.date, '', 40),
    notes: cleanString(entry.notes, '', 900),
  })).filter(entry => entry.version)
  if (normalized.length) return normalized
  return [{
    version: cleanString(policy.currentVersion, '1.0.0', 40),
    label: 'Version 1',
    date: new Date().toISOString().slice(0, 10),
    notes: 'Initial product catalog release.',
  }]
}

export function normalizeProduct(product = {}, index = 0) {
  const id = cleanId(product.id, `product-${index + 1}`)
  const packages = Array.isArray(product.packages) ? product.packages.map(normalizePackage).filter(p => p.id) : []
  const modules = Array.isArray(product.modules) ? product.modules.map(normalizeModule).filter(m => m.id) : []
  const paymentOptions = Array.isArray(product.paymentOptions) && product.paymentOptions.length
    ? product.paymentOptions.map(normalizePaymentOption).filter(o => o.id)
    : DEFAULT_PAYMENT_OPTIONS
  const addOns = Array.isArray(product.addOns) && product.addOns.length
    ? product.addOns.map(normalizeAddOn).filter(a => a.id)
    : DEFAULT_ADD_ONS
  const licenseTemplates = Array.isArray(product.licenseTemplates) && product.licenseTemplates.length
    ? product.licenseTemplates.map(normalizeLicenseTemplate).filter(t => t.id)
    : DEFAULT_LICENSE_TEMPLATES
  const supportPlans = Array.isArray(product.supportPlans) && product.supportPlans.length
    ? product.supportPlans.map(normalizeSupportPlan).filter(p => p.id)
    : DEFAULT_SUPPORT_PLANS
  const defaultPackageId = cleanId(product.defaultPackageId, packages[0]?.id || '')

  return {
    id,
    slug: cleanId(product.slug, id),
    status: ['draft', 'published', 'archived'].includes(product.status) ? product.status : 'draft',
    featured: Boolean(product.featured),
    category: cleanString(product.category, 'Product', 120),
    name: cleanString(product.name, id || 'Product', 160),
    shortName: cleanString(product.shortName, product.name || id || 'Product', 80),
    eyebrow: cleanString(product.eyebrow, 'Product', 120),
    coverImage: cleanString(product.coverImage, id === 'farrington-command-center' ? '/product-covers/command-center-dashboard.png' : '', 240),
    productLogo: cleanString(product.productLogo || product.logoImage || product.logo, id === 'farrington-command-center' ? BRAND_ASSETS.productLogo : '', 240),
    accentColor: cleanString(product.accentColor, '#3b82f6', 40),
    headline: cleanString(product.headline, '', 220),
    summary: cleanString(product.summary, '', 1200),
    suiteCopy: cleanString(product.suiteCopy, '', 900),
    checkoutEndpoint: cleanString(product.checkoutEndpoint, '/api/stripe/command-center-checkout', 180),
    defaultPackageId,
    packages,
    modules,
    paymentOptions,
    addOns,
    licenseTemplates,
    supportPlans,
    versionPolicy: normalizeVersionPolicy(product.versionPolicy || DEFAULT_VERSION_POLICY),
    versionHistory: normalizeVersionHistory(product.versionHistory, normalizeVersionPolicy(product.versionPolicy || DEFAULT_VERSION_POLICY)),
  }
}

export function normalizeCatalog(raw = {}) {
  const products = Array.isArray(raw.products) && raw.products.length ? raw.products : DEFAULT_CATALOG.products
  return {
    version: 1,
    updatedAt: raw.updatedAt || null,
    products: products.map(normalizeProduct).filter(p => p.id),
  }
}

function mergeById(existing = [], defaults = []) {
  const existingById = new Map(existing.map(item => [item.id, item]))
  const defaultIds = new Set(defaults.map(item => item.id))
  return [
    ...defaults.map(item => ({ ...item, ...(existingById.get(item.id) || {}) })),
    ...existing.filter(item => !defaultIds.has(item.id)),
  ]
}

function mergeDefaultProduct(product, defaultProduct) {
  if (!defaultProduct) return product
  return normalizeProduct({
    ...defaultProduct,
    ...product,
    packages: mergeById(product.packages || [], defaultProduct.packages || []),
    modules: mergeById(product.modules || [], defaultProduct.modules || []),
    paymentOptions: mergeById(product.paymentOptions || [], defaultProduct.paymentOptions || []),
    addOns: mergeById(product.addOns || [], defaultProduct.addOns || []),
    licenseTemplates: product.licenseTemplates?.length ? product.licenseTemplates : defaultProduct.licenseTemplates,
    supportPlans: product.supportPlans?.length ? product.supportPlans : defaultProduct.supportPlans,
  })
}

export function getProductCatalog() {
  const catalog = normalizeCatalog(readData(CATALOG_FILE) || DEFAULT_CATALOG)
  const defaults = normalizeCatalog(DEFAULT_CATALOG)
  const seen = new Set(catalog.products.map(product => product.id))
  const missingDefaults = defaults.products.filter(product => !seen.has(product.id))
  return {
    ...catalog,
    products: [
      ...catalog.products.map(product => mergeDefaultProduct(product, defaults.products.find(item => item.id === product.id))),
      ...missingDefaults,
    ],
  }
}

export function saveProductCatalog(catalog) {
  const normalized = normalizeCatalog(catalog)
  normalized.updatedAt = new Date().toISOString()
  writeData(CATALOG_FILE, normalized)
  return normalized
}

export function publicProduct(product) {
  return {
    id: product.id,
    slug: product.slug,
    featured: product.featured,
    category: product.category,
    name: product.name,
    shortName: product.shortName,
    eyebrow: product.eyebrow,
    coverImage: product.coverImage,
    productLogo: product.productLogo,
    accentColor: product.accentColor,
    headline: product.headline,
    summary: product.summary,
    suiteCopy: product.suiteCopy,
    checkoutEndpoint: product.checkoutEndpoint,
    defaultPackageId: product.defaultPackageId,
    packages: product.packages.map(pkg => ({
      id: pkg.id,
      name: pkg.name,
      short: pkg.short,
      packageCategory: pkg.packageCategory,
      pricingModel: pkg.pricingModel,
      billingInterval: pkg.billingInterval,
      monthlyFee: pkg.monthlyFee,
      setupPrice: pkg.setupPrice,
      setupPriceHigh: pkg.setupPriceHigh,
      retainer: pkg.retainer,
      label: pkg.label,
      copy: pkg.copy,
      modules: pkg.modules,
      stripePriceId: pkg.stripePriceId,
      stripeMonthlyPriceId: pkg.stripeMonthlyPriceId,
      stripeSetupPriceId: pkg.stripeSetupPriceId,
      quoteRequired: pkg.quoteRequired,
    })),
    modules: product.modules,
    paymentOptions: product.paymentOptions,
    addOns: product.addOns,
    licenseTemplates: product.licenseTemplates,
    supportPlans: product.supportPlans,
    versionPolicy: product.versionPolicy,
    versionHistory: product.versionHistory,
  }
}

export function getPublicProducts() {
  return getProductCatalog().products
    .filter(product => product.status === 'published')
    .map(publicProduct)
}

export function findProductPackage(productId = 'farrington-command-center', packageId) {
  const catalog = getProductCatalog()
  const product = catalog.products.find(p => p.id === productId || p.slug === productId)
    || catalog.products.find(p => p.id === 'farrington-command-center')
    || catalog.products[0]
  if (!product) return null
  const pkg = product.packages.find(p => p.id === packageId) || product.packages.find(p => p.id === product.defaultPackageId) || product.packages[0]
  if (!pkg) return null
  return { product, package: pkg }
}

export function paymentOptionLabel(product, paymentOptionId) {
  const option = (product?.paymentOptions || DEFAULT_PAYMENT_OPTIONS).find(o => o.id === paymentOptionId)
  return option?.name || DEFAULT_PAYMENT_OPTIONS[0].name
}

export function validPaymentOptionId(product, paymentOptionId) {
  const options = product?.paymentOptions?.length ? product.paymentOptions : DEFAULT_PAYMENT_OPTIONS
  return options.some(o => o.id === paymentOptionId) ? paymentOptionId : options[0].id
}
