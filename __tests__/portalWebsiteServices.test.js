import { describe, expect, it } from 'vitest'

import {
  WEBSITE_ADMIN_PROVIDERS,
  createWebsiteConnectionRecord,
  decryptWebsiteCredentials,
  publicWebsiteConnection,
  validateWebsiteConnectionInput,
} from '@/lib/portal-website-services'

const encryptionKey = 'test-only-connection-key-that-is-long-enough-123456'

describe('portal website services', () => {
  it('describes dynamic credential requirements without embedding secrets', () => {
    expect(WEBSITE_ADMIN_PROVIDERS.wordpress.credentialFields.map(field => field.id)).toEqual([
      'username',
      'applicationPassword',
    ])
    expect(WEBSITE_ADMIN_PROVIDERS.joomla.credentialFields.some(field => field.id === 'apiToken')).toBe(true)
    expect(WEBSITE_ADMIN_PROVIDERS.drupal.credentialFields.some(field => field.id === 'accessToken')).toBe(true)
    expect(WEBSITE_ADMIN_PROVIDERS.sftp.credentialFields.some(field => field.id === 'password')).toBe(true)
    expect(WEBSITE_ADMIN_PROVIDERS.githubReadOnly.functions.some(item => item.id === 'no_write')).toBe(true)
    expect(WEBSITE_ADMIN_PROVIDERS.wordpress.functions.some(item => item.id === 'posts')).toBe(true)
    expect(WEBSITE_ADMIN_PROVIDERS.wordpress.functions.find(item => item.id === 'backup_restore').requires).toMatch(/separate hosting/i)
  })

  it('requires ownership and backup acknowledgements before accepting access', () => {
    const result = validateWebsiteConnectionInput({
      provider: 'wordpress',
      siteUrl: 'https://example.com',
      credentials: { username: 'editor', applicationPassword: 'secret' },
      authorityConfirmed: false,
      backupResponsibilityConfirmed: true,
    })

    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/authority/i)
  })

  it('encrypts credentials and returns only redacted public metadata', () => {
    const record = createWebsiteConnectionRecord({
      accountId: 'account-1',
      tenantId: 'tenant-1',
      input: {
        provider: 'wordpress',
        siteUrl: 'https://example.com/wp-admin',
        displayName: 'Main website',
        credentials: { username: 'editor', applicationPassword: 'secret-value' },
        authorityConfirmed: true,
        backupResponsibilityConfirmed: true,
        pointInTimeAssessmentConfirmed: true,
        sharedAccessAcknowledged: true,
        knownIssues: 'No known issues reported by the client.',
        requestedCapabilities: ['content', 'backup'],
        recovery: { rtoHours: 8, rpoHours: 24, retentionDays: 30, testFrequency: 'quarterly' },
      },
      encryptionKey,
      now: '2026-08-27T04:00:00.000Z',
    })

    expect(JSON.stringify(record)).not.toContain('secret-value')
    expect(decryptWebsiteCredentials(record, encryptionKey)).toEqual({
      username: 'editor',
      applicationPassword: 'secret-value',
    })

    const publicRecord = publicWebsiteConnection(record)
    expect(publicRecord.credentials).toBeUndefined()
    expect(publicRecord.credentialStatus).toEqual({ username: true, applicationPassword: true })
    expect(publicRecord.status).toBe('pending_verification')
    expect(publicRecord.certification).toMatchObject({
      status: 'connection_verification_required',
      inspectedAt: null,
    })
  })

  it('refuses to persist credentials without a server encryption key', () => {
    expect(() => createWebsiteConnectionRecord({
      accountId: 'account-1',
      tenantId: 'tenant-1',
      input: {
        provider: 'wordpress',
        siteUrl: 'https://example.com',
        credentials: { username: 'editor', applicationPassword: 'secret-value' },
        authorityConfirmed: true,
        backupResponsibilityConfirmed: true,
        pointInTimeAssessmentConfirmed: true,
        sharedAccessAcknowledged: true,
      },
      encryptionKey: '',
    })).toThrow(/encryption key/i)
  })
})
