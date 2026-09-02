import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST as postAgentExecute } from '../app/api/agent/execute/route.js'
import { GET as getBulkDispatchStale } from '../app/api/concierge/bulk-dispatch-stale/route.js'
import { POST as postLeadResearch } from '../app/api/harness/actions/lead-research/route.js'
import { GET as getOpenClawAgents } from '../app/api/openclaw/agents/route.js'
import { POST as postToolsSendEmail } from '../app/api/tools/send-email/route.js'
import { POST as postLeaseWebhook } from '../app/api/stripe/lease-webhook/route.js'
import { POST as postPaymentWebhook } from '../app/api/stripe/payment-webhook/route.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

function stubBlankSecret(name) {
  vi.stubEnv(name, '')
}

function stubProduction() {
  vi.stubEnv('NODE_ENV', 'production')
}

describe('route hardening', () => {
  it('does not trust a localhost Host header for OpenClaw agent access', async () => {
    stubBlankSecret('OPENCLAW_API_KEY')
    stubBlankSecret('AGENT_API_KEY')

    const response = await getOpenClawAgents(new Request('http://localhost:3000/api/openclaw/agents', {
      headers: { Host: 'localhost:3000' },
    }))

    expect(response.status).toBe(401)
  })

  it('fails agent execution closed in production when no agent key or CRM session is present', async () => {
    stubProduction()
    stubBlankSecret('OPENCLAW_API_KEY')
    stubBlankSecret('AGENT_API_KEY')

    const response = await postAgentExecute(new Request('https://openocti.local/api/agent/execute', {
      method: 'POST',
      body: JSON.stringify({ tool: 'list_tools' }),
    }))

    expect(response.status).toBe(401)
  })

  it('protects stale concierge dispatch preview data', async () => {
    vi.stubEnv('CONCIERGE_TOOL_SECRET', 'test-concierge-secret')

    const response = await getBulkDispatchStale(new Request('https://openocti.local/api/concierge/bulk-dispatch-stale'))

    expect(response.status).toBe(401)
  })

  it('protects the public tools send-email endpoint before Resend can run', async () => {
    vi.stubEnv('CONCIERGE_TOOL_SECRET', 'test-concierge-secret')
    vi.stubEnv('RESEND_API_KEY', 're_test_route_hardening')

    const response = await postToolsSendEmail(new Request('https://openocti.local/api/tools/send-email', {
      method: 'POST',
      body: JSON.stringify({
        to: 'client@example.com',
        subject: 'Route hardening',
        body: 'This should not send.',
      }),
    }))

    expect(response.status).toBe(401)
  })

  it('protects lead research run/save before provider dispatch', async () => {
    const response = await postLeadResearch(new Request('https://openocti.local/api/harness/actions/lead-research', {
      method: 'POST',
      body: JSON.stringify({
        lead: { businessName: 'Example Plumbing', address: 'Asheville NC' },
        save: false,
      }),
    }))

    expect(response.status).toBe(401)
  })

  it('requires a signed lease webhook secret in production', async () => {
    stubProduction()
    stubBlankSecret('STRIPE_WEBHOOK_SECRET')

    const response = await postLeaseWebhook(new Request('https://openocti.local/api/stripe/lease-webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'checkout.session.completed' }),
    }))

    expect(response.status).toBe(503)
  })

  it('requires a signed payment webhook secret in production', async () => {
    stubProduction()
    stubBlankSecret('STRIPE_PAYMENT_WEBHOOK_SECRET')
    stubBlankSecret('STRIPE_WEBHOOK_SECRET')
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_route_hardening')

    const response = await postPaymentWebhook(new Request('https://openocti.local/api/stripe/payment-webhook', {
      method: 'POST',
      body: JSON.stringify({ type: 'payment_intent.succeeded' }),
    }))

    expect(response.status).toBe(503)
  })
})
