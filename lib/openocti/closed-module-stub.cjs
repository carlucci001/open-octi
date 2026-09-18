function unavailable() {
  const error = new Error('This capability is not available in the OpenOcti edition')
  error.code = 'not_configured'
  throw error
}

class ClosedCapabilityError extends Error {}

module.exports = {
  PlatformActionConfirmDialog: unavailable,
  registerSearchTools3Completion: unavailable,
  ADDITIONAL_COMMAND_CENTER_MODULES: [],
  clientLoginDetails: unavailable,
  createOctiCcProduct: () => null,
  supportTools: [],
  registerNodeServices: async () => {},
  default: unavailable,
  activeLeaseForAccount: unavailable,
  approveClientAutomation: unavailable,
  bindExistingLeaseSubscriptionCheckoutSession: unavailable,
  checkoutCorsHeaders: () => ({ 'Content-Type': 'application/json' }),
  createProductCheckoutSession: unavailable,
  deleteProductOrder: unavailable,
  deleteProductOrders: unavailable,
  disablePortalForAccount: unavailable,
  declineClientAutomation: unavailable,
  enablePortalForAccount: unavailable,
  fileDossierToAccount: unavailable,
  findProductOrder: unavailable,
  getRuntimeStripeBillingCatalogDefinitions: () => [],
  getSessionFromRequest: () => null,
  isComplimentaryLease: () => false,
  latestUnfiledDossier: () => null,
  listDeerFlowReadOnlyTools: () => [],
  listPendingApprovals: () => [],
  loadProductOrders: () => [],
  markProductOrderPaid: unavailable,
  researchSocialTrends: unavailable,
  reserveExistingLeaseSubscriptionCheckout: unavailable,
  resolveAccountByPhrase: () => null,
  resolveCherylVoicePolicy: () => ({ enabled: false, dailySeconds: 0, maxSessionSeconds: 0, idleTimeoutSeconds: 0, warningThresholds: [] }),
  resolveDeerFlowResearchTarget: () => null,
  outreachYesterday: () => ({ sent: 0, step1: 0, step2: 0, replies: 0, unsubscribes: 0, bounces: 0 }),
  runDeepResearchDossier: unavailable,
  runDeerFlowReadOnlyTool: unavailable,
  runDeerFlowStudioTask: unavailable,
  runOutreach: unavailable,
  SocialTrendResearchError: ClosedCapabilityError,
  stripeBillingCatalogHash: () => '',
  updateProductOrder: unavailable,
  DEERFLOW_READONLY_TOOL_DEFS: [],
  STUDIO_KINDS: {},
}
