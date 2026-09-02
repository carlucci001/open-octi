import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import ProvisionedTwilioLines from '../app/provisioning-lab/ProvisionedTwilioLines'

const communicationLines = [
  { id: 'fd-doreen', phoneNumber: '+18287709428', tenantId: 'farrington-development', company: 'Farrington Development', agent: 'Doreen receptionist', assignmentSource: 'internal' },
  { id: 'newsroom-lucci', phoneNumber: '+18287709227', tenantId: 'newsroomaios', company: 'NewsroomAIOS', agent: 'Lucci receptionist', assignmentSource: 'agent' },
  { id: 'wnc-jessica', phoneNumber: '+18286242408', tenantId: 'wnc-times', company: 'WNC Times', agent: 'Jessica receptionist', assignmentSource: 'internal' },
]

describe('ProvisioningLab assigned Twilio inventory', () => {
  it('shows the existing Twilio numbers under their correct business owner', () => {
    render(<ProvisionedTwilioLines lines={communicationLines} />)

    expect(screen.getByRole('heading', { name: 'Provisioned Twilio lines' })).toBeInTheDocument()
    expect(screen.getByText('Farrington Development')).toBeInTheDocument()
    expect(screen.getByText('NewsroomAIOS')).toBeInTheDocument()
    expect(screen.getByText('WNC Times')).toBeInTheDocument()
    expect(screen.getByText('PHONE_REDACTED')).toBeInTheDocument()
    expect(screen.getByText('PHONE_REDACTED')).toBeInTheDocument()
    expect(screen.getByText('PHONE_REDACTED')).toBeInTheDocument()
  })
})
