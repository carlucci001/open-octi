import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import WebsiteConnectionIntake from '@/app/portal/connectors/WebsiteConnectionIntake'

const providers = [{
  id: 'wordpress',
  name: 'WordPress',
  connectionType: 'REST API',
  capabilities: ['content', 'backups', 'recovery'],
  functions: [{ id: 'posts', label: 'Create, edit, schedule, and publish blog posts', requires: 'WordPress content permission and per-request approval' }],
  credentialFields: [
    { id: 'username', label: 'WordPress username', type: 'text', required: true },
    { id: 'applicationPassword', label: 'Application password', type: 'password', required: true },
  ],
}]

describe('WebsiteConnectionIntake', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders provider-specific secure fields and submits acknowledgements', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, providers, connections: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        connection: { id: 'connection-1', displayName: 'Main website', providerName: 'WordPress', status: 'pending_verification', certification: { status: 'connection_verification_required', summary: 'Awaiting read-only connection verification.' } },
      }), { status: 201 }))

    render(<WebsiteConnectionIntake />)

    expect(await screen.findByLabelText('Application password')).toHaveAttribute('type', 'password')
    expect(screen.getByText(/create, edit, schedule, and publish blog posts/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Main website' } })
    fireEvent.change(screen.getByLabelText('Public website URL'), { target: { value: 'https://example.com' } })
    fireEvent.change(screen.getByLabelText('WordPress username'), { target: { value: 'editor' } })
    fireEvent.change(screen.getByLabelText('Application password'), { target: { value: 'secret-value' } })
    fireEvent.click(screen.getByLabelText(/authorized to grant/i))
    fireEvent.click(screen.getByLabelText(/backup responsibility/i))
    fireEvent.click(screen.getByLabelText(/point-in-time assessment/i))
    fireEvent.click(screen.getByLabelText(/other authorized users/i))
    fireEvent.click(screen.getByRole('button', { name: /submit for secure verification/i }))

    await screen.findByText(/encrypted and submitted for verification/i)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const options = fetchMock.mock.calls[1][1]
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toMatchObject({
      provider: 'wordpress',
      authorityConfirmed: true,
      backupResponsibilityConfirmed: true,
      pointInTimeAssessmentConfirmed: true,
      sharedAccessAcknowledged: true,
      credentials: { username: 'editor', applicationPassword: 'secret-value' },
    })
    await waitFor(() => expect(screen.getByText(/pending verification/i)).toBeInTheDocument())
    expect(screen.getByText(/inspection: connection verification required/i)).toBeInTheDocument()
  })
})
