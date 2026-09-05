function unavailable() {
  const error = new Error('This capability is not available in the OpenOcti edition')
  error.code = 'not_configured'
  throw error
}

class ClosedCapabilityError extends Error {}

module.exports = {
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
  resolveDeerFlowResearchTarget: () => null,
  runDeepResearchDossier: unavailable,
  runDeerFlowReadOnlyTool: unavailable,
  runDeerFlowStudioTask: unavailable,
  SocialTrendResearchError: ClosedCapabilityError,
  stripeBillingCatalogHash: () => '',
  updateProductOrder: unavailable,
  DEERFLOW_READONLY_TOOL_DEFS: [],
  STUDIO_KINDS: {},
}
