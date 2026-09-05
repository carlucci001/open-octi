import { purchasePrepaidCredits } from './credit-wallet'
import { CREDIT_TOP_UP_PURPOSE, validateCreditTopUpPaymentIntent } from './credit-topups'

// Confirmation and Stripe webhooks share one award identity and validation path.
export function settleCreditTopUp(intent, lease) {
  if (!/^pi_[A-Za-z0-9_]+$/.test(String(intent?.id || ''))) throw new Error('Invalid payment identity')
  const { pack, requestId } = validateCreditTopUpPaymentIntent(intent, lease)
  const result = purchasePrepaidCredits({
    tenantId: lease.tenantId,
    accountId: lease.clientAccountId,
    leaseId: lease.id,
    credits: pack.credits,
    idempotencyKey: `stripe:payment_intent:${intent.id}`,
    stripePaymentIntentId: intent.id,
    stripeRequestId: requestId,
    packId: pack.id,
    amountCents: pack.amountCents,
    currency: pack.currency,
    metadata: { source: 'stripe_payment_webhook', purpose: CREDIT_TOP_UP_PURPOSE },
  })
  return { ...result, pack }
}
