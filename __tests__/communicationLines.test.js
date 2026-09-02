import { describe, expect, it } from 'vitest'

import {
  internalLineLabel,
  listInternalLineAssignments,
  resolveCommunicationLineForLease,
} from '../lib/communicationLines'

describe('internal communication line assignments', () => {
  it('publishes the already-provisioned Twilio lines for each Farrington brand', () => {
    const lines = listInternalLineAssignments()

    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({
        phoneNumber: '+18287709428',
        tenantId: 'farrington-development',
        company: 'Farrington Development',
        agent: 'Doreen receptionist',
      }),
      expect.objectContaining({
        phoneNumber: '+18287709227',
        tenantId: 'newsroomaios',
        company: 'NewsroomAIOS',
      }),
      expect.objectContaining({
        phoneNumber: '+18286242408',
        tenantId: 'wnc-times',
        company: 'WNC Times',
        agent: 'Jessica receptionist',
      }),
    ]))
  })

  it('preserves the primary ownership label used by live Twilio inventory', () => {
    expect(internalLineLabel('PHONE_REDACTED')).toMatchObject({
      company: 'NewsroomAIOS',
      agent: 'Lucci receptionist',
    })
  })

  it.each([
    ['farrington-development', '+18287709428', 'Farrington Development'],
    ['newsroomaios', '+18287709227', 'NewsroomAIOS'],
    ['wnc-times', '+18286242408', 'WNC Times'],
  ])('resolves the %s tenant to its provisioned line', (tenantId, phoneNumber, company) => {
    expect(resolveCommunicationLineForLease({ tenantId, status: 'active' })).toMatchObject({
      phoneNumber,
      company,
    })
  })

  it('keeps an external client lease on its own recorded number', () => {
    expect(resolveCommunicationLineForLease({
      id: 'lease-client',
      tenantId: 'lease-client-acme',
      tenantName: 'Acme Heating',
      agentName: 'Alex receptionist',
      twilioPhoneNumber: '+15551234567',
      status: 'active',
    })).toMatchObject({
      phoneNumber: '+15551234567',
      company: 'Acme Heating',
      agent: 'Alex receptionist',
      assignmentSource: 'lease',
    })
  })
})
