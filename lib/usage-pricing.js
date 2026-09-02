/**
 * Internal proposal for a shared usage-pricing boundary.
 *
 * Nothing in this module is a verified provider rate or an active customer
 * price. The catalog is deliberately pure so Campaign Studio, Automations,
 * and future billing routes can quote the same integer credit amounts before
 * any persistence or Stripe integration is added.
 */

export const CREDIT_RETAIL_USD = 0.01
export const DEFAULT_GROSS_MARGIN_PERCENT = 75

const PROVISIONAL_RATE = Object.freeze({
  provisional: true,
  verified: false,
  verificationStatus: 'unverified',
})

function provisionalCatalogItem(item) {
  return Object.freeze({ ...item, ...PROVISIONAL_RATE })
}

export const USAGE_ACTION_CATALOG = Object.freeze({
  text: provisionalCatalogItem({
    id: 'text',
    label: 'Text generation or platform rewrite',
    unit: 'operation',
    pricingMode: 'cost_plus_floor',
    floorCredits: 0,
  }),
  standard_image: provisionalCatalogItem({
    id: 'standard_image',
    label: 'Standard still image',
    unit: 'image',
    pricingMode: 'cost_plus_floor',
    floorCredits: 25,
  }),
  premium_image: provisionalCatalogItem({
    id: 'premium_image',
    label: 'Premium or high-quality still image',
    unit: 'image',
    pricingMode: 'cost_plus_floor',
    floorCredits: 70,
  }),
  research: provisionalCatalogItem({
    id: 'research',
    label: 'Paid research or source enrichment',
    unit: 'operation',
    pricingMode: 'cost_plus_floor',
    floorCredits: 10,
  }),
  automation_run: provisionalCatalogItem({
    id: 'automation_run',
    label: 'External automation run',
    unit: 'run',
    pricingMode: 'cost_plus_floor',
    floorCredits: 10,
  }),
  voice: provisionalCatalogItem({
    id: 'voice',
    label: 'Generated voice',
    unit: 'minute',
    pricingMode: 'per_unit_floor',
    floorCredits: 0,
    creditsPerUnit: 40,
    note: 'Aligned to the Receptionist plan overage of $0.40 per generated voice minute.',
  }),
  video: provisionalCatalogItem({
    id: 'video',
    label: 'Generated video',
    unit: 'generation',
    pricingMode: 'provider_quote',
    floorCredits: 0,
    quoteRequired: true,
    note: 'No flat rate is permitted until the selected provider and model return a quote.',
  }),
})

function provisionalPlan(plan) {
  return Object.freeze({
    ...plan,
    clientBrands: 1,
    proposalStatus: 'internal_proposal',
    ...PROVISIONAL_RATE,
  })
}

export const MANAGED_SOCIAL_PLANS = Object.freeze([
  provisionalPlan({
    id: 'operator',
    name: 'Operator',
    monthlyPriceUsd: 597,
    onboardingPriceUsd: 500,
    sourceCampaigns: 12,
    platformVariants: 36,
    includedCredits: 1250,
    approvalMode: 'approval_required',
  }),
  provisionalPlan({
    id: 'growth',
    name: 'Growth',
    monthlyPriceUsd: 997,
    onboardingPriceUsd: 750,
    sourceCampaigns: 20,
    platformVariants: 100,
    includedCredits: 5000,
    approvalMode: 'guarded_auto',
  }),
  provisionalPlan({
    id: 'authority',
    name: 'Authority',
    monthlyPriceUsd: 1997,
    onboardingPriceUsd: 1250,
    sourceCampaigns: 30,
    platformVariants: 180,
    includedCredits: 28000,
    approvalMode: 'guarded_auto',
  }),
])

function creditPack({ id, name, credits, priceUsd, popular = false }) {
  return Object.freeze({
    id,
    name,
    credits,
    priceUsd,
    popular,
    retailUsdPerCredit: CREDIT_RETAIL_USD,
    proposalStatus: 'approved_for_portal',
    provisional: false,
    verified: true,
    verificationStatus: 'configured',
  })
}

export const CREDIT_TOP_UP_PACKS = Object.freeze([
  creditPack({ id: 'credits-2500', name: 'Everyday', credits: 2500, priceUsd: 25 }),
  creditPack({ id: 'credits-5000', name: 'Growth', credits: 5000, priceUsd: 50 }),
  creditPack({ id: 'credits-10000', name: 'Business', credits: 10000, priceUsd: 100, popular: true }),
  creditPack({ id: 'credits-25000', name: 'Scale', credits: 25000, priceUsd: 250 }),
])

// Backward-compatible default for existing Campaign Studio responses.
export const CREDIT_TOP_UP = CREDIT_TOP_UP_PACKS[0]

const PLAN_ALLOWANCE_POLICY = Object.freeze({
  receptionist: 8500,
  communications: 21500,
  'office-manager': 26000,
  'specialist-graphics': 16500,
  'specialist-marketing': 10000,
  'specialist-legal': 31000,
  'specialist-engineering': 8500,
  'specialist-product-manager': 17500,
  'specialist-finance-manager': 20000,
  'full-suite': 116500,
})

export const SUBSCRIPTION_CREDIT_ALLOWANCES = Object.freeze(
  Object.fromEntries(Object.entries(PLAN_ALLOWANCE_POLICY).map(([tierId, includedCredits]) => [
    tierId,
    Object.freeze({
      includedCredits,
      rateVersion: '2026-07-16',
      resetsWithPaidBillingPeriod: true,
      exhaustionPolicy: 'prepaid_then_pause',
    }),
  ])),
)

export function creditAllowanceForTier(tier) {
  if (!tier?.id) return null
  const configured = tier.creditAllowance
  if (Number.isSafeInteger(Number(configured?.includedCredits)) && Number(configured.includedCredits) > 0) {
    return configured
  }
  return SUBSCRIPTION_CREDIT_ALLOWANCES[tier.id] || null
}

export const USAGE_PRICING_PROPOSAL = Object.freeze({
  status: 'internal_proposal',
  provisional: true,
  verified: false,
  verificationStatus: 'unverified',
  creditRetailUsd: CREDIT_RETAIL_USD,
  defaultGrossMarginPercent: DEFAULT_GROSS_MARGIN_PERCENT,
  actions: USAGE_ACTION_CATALOG,
  managedSocialPlans: MANAGED_SOCIAL_PLANS,
  topUp: CREDIT_TOP_UP,
  topUpPacks: CREDIT_TOP_UP_PACKS,
})

function nonNegativeNumber(value, label) {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) {
    throw new TypeError(`${label} must be a finite non-negative number.`)
  }
  return number
}

function nonNegativeInteger(value, label) {
  const number = nonNegativeNumber(value, label)
  if (!Number.isInteger(number)) throw new TypeError(`${label} must be an integer.`)
  return number
}

/**
 * Convert a provider cost into whole customer credits.
 * At the default margin one $0.01 credit may carry at most $0.0025 of cost,
 * which is equivalent to ceil(actualUsd * 400).
 */
export function creditsFromUsd(actualUsd, {
  grossMarginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
  minimumCredits = 0,
} = {}) {
  const cost = nonNegativeNumber(actualUsd, 'actualUsd')
  const margin = nonNegativeNumber(grossMarginPercent, 'grossMarginPercent')
  if (margin >= 100) throw new RangeError('grossMarginPercent must be less than 100.')

  const floor = nonNegativeInteger(minimumCredits, 'minimumCredits')
  const costCapacityPerCredit = CREDIT_RETAIL_USD * (1 - (margin / 100))
  const converted = Math.ceil((cost / costCapacityPerCredit) - 1e-12)
  return Math.max(floor, converted)
}

/**
 * Quote an action using total provider USD for the requested units.
 * Video intentionally requires an explicit provider quote; all other actions
 * may be quoted from a known/estimated total cost, with their action floor.
 */
export function quoteUsageCredits({
  action,
  units = 1,
  actualUsd = 0,
  quotedProviderUsd,
  grossMarginPercent = DEFAULT_GROSS_MARGIN_PERCENT,
} = {}) {
  const item = USAGE_ACTION_CATALOG[action]
  if (!item) throw new RangeError(`Unknown usage action: ${action || '(missing)'}.`)

  const quantity = nonNegativeNumber(units, 'units')
  if (quantity === 0) return 0

  if (item.quoteRequired && quotedProviderUsd == null) {
    throw new TypeError(`${item.label} requires a provider quote before credits can be calculated.`)
  }

  const providerCost = item.quoteRequired
    ? nonNegativeNumber(quotedProviderUsd, 'quotedProviderUsd')
    : nonNegativeNumber(actualUsd, 'actualUsd')

  const fixedFloor = Math.ceil(nonNegativeNumber(item.floorCredits || 0, 'floorCredits') * quantity)
  const perUnitFloor = Math.ceil(nonNegativeNumber(item.creditsPerUnit || 0, 'creditsPerUnit') * quantity)

  return creditsFromUsd(providerCost, {
    grossMarginPercent,
    minimumCredits: Math.max(fixedFloor, perUnitFloor),
  })
}
