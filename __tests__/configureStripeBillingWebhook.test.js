import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { STRIPE_BILLING_WEBHOOK_EVENTS, STRIPE_BILLING_WEBHOOK_URL } from '../lib/stripe-billing-catalog.mjs'
import {
  configureStripeBillingWebhook,
  parseWebhookSetupArgs,
  replaceEnvValue,
} from '../scripts/configure-stripe-billing-webhook.mjs'

const temporaryDirectories = []

function stripeWith(endpoints = []) {
  return {
    webhookEndpoints: {
      list: vi.fn().mockResolvedValue({ data: endpoints, has_more: false }),
      create: vi.fn().mockResolvedValue({ id: 'we_created', secret: ['whsec', 'fixture'].join('_') }),
      update: vi.fn().mockResolvedValue({ id: 'we_existing' }),
      del: vi.fn().mockResolvedValue({ deleted: true }),
    },
  }
}

function temporaryEnv() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-webhook-'))
  temporaryDirectories.push(directory)
  const file = path.join(directory, '.env.local')
  fs.writeFileSync(file, 'STRIPE_SECRET_KEY=redacted\nSTRIPE_PAYMENT_WEBHOOK_SECRET=old-value\n')
  return file
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})

describe('controlled Stripe billing webhook setup', () => {
  it('defaults to preview and requires explicit apply arguments', () => {
    expect(parseWebhookSetupArgs([])).toMatchObject({ apply: false, envFile: '', confirmation: '' })
    expect(() => parseWebhookSetupArgs(['--unexpected'])).toThrow('Unsupported argument')
  })

  it('replaces only the named environment value', () => {
    const result = replaceEnvValue('A=1\nSTRIPE_PAYMENT_WEBHOOK_SECRET=old\nB=2\n', 'STRIPE_PAYMENT_WEBHOOK_SECRET', 'new')
    expect(result).toBe('A=1\nSTRIPE_PAYMENT_WEBHOOK_SECRET=new\nB=2\n')
  })

  it('previews a missing endpoint without changing Stripe or disk', async () => {
    const stripe = stripeWith([])
    const result = await configureStripeBillingWebhook({ stripe })
    expect(result).toMatchObject({ mode: 'dry-run', action: 'create', url: STRIPE_BILLING_WEBHOOK_URL })
    expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled()
  })

  it('creates the endpoint and installs its secret only after typed confirmation', async () => {
    const stripe = stripeWith([])
    const envFile = temporaryEnv()
    const result = await configureStripeBillingWebhook({
      stripe,
      apply: true,
      envFile,
      confirmation: 'CREATE_FCC_BILLING_WEBHOOK',
    })
    expect(result).toMatchObject({ action: 'created', secretInstalled: true, missingEvents: [] })
    expect(stripe.webhookEndpoints.create).toHaveBeenCalledWith(expect.objectContaining({
      url: STRIPE_BILLING_WEBHOOK_URL,
      enabled_events: [...STRIPE_BILLING_WEBHOOK_EVENTS],
    }))
    expect(fs.readFileSync(envFile, 'utf8')).toContain('STRIPE_PAYMENT_WEBHOOK_SECRET=whsec_fixture')
  })

  it('updates only missing events on the existing endpoint without recreating it', async () => {
    const stripe = stripeWith([{ id: 'we_existing', url: STRIPE_BILLING_WEBHOOK_URL, status: 'enabled', enabled_events: ['checkout.session.completed'] }])
    const envFile = temporaryEnv()
    const result = await configureStripeBillingWebhook({
      stripe,
      apply: true,
      envFile,
      confirmation: 'CREATE_FCC_BILLING_WEBHOOK',
    })
    expect(result.action).toBe('updated')
    expect(stripe.webhookEndpoints.create).not.toHaveBeenCalled()
    expect(stripe.webhookEndpoints.update).toHaveBeenCalledWith('we_existing', expect.objectContaining({
      enabled_events: expect.arrayContaining(STRIPE_BILLING_WEBHOOK_EVENTS),
    }))
  })
})
