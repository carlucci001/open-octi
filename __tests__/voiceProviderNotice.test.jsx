import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import VoiceProviderNotice, { VoiceProviderSelect } from '@/app/components/VoiceProviderNotice'
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => true }))
beforeEach(() => {
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ providers: [
    { id: 'chirp3', enabled: false, credential: 'Google Gemini API key', setupHref: '/settings/models#gemini', note: 'This lab uses Gemini TTS.' },
    { id: 'elevenlabs', enabled: true, credential: 'ElevenLabs API key' },
    { id: 'chatterbox', enabled: false },
  ] }) }))
})
it('names the exact missing key and links to its entry', async () => {
  render(<VoiceProviderNotice provider="chirp3" />)
  expect(await screen.findByText('Required: Google Gemini API key. No key is configured.')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Add the required key' })).toHaveAttribute('href', '/settings/models#gemini')
})
it('disables unavailable providers and keeps configured providers selectable', async () => {
  const change = vi.fn()
  render(<VoiceProviderSelect value="chirp3" onChange={change}><option value="chirp3">Chirp aliases</option><option value="elevenlabs">ElevenLabs</option></VoiceProviderSelect>)
  await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('needs Google Gemini API key'))
  fireEvent.click(screen.getByRole('button'))
  expect(screen.getByRole('option', { name: /Chirp aliases/ })).toBeDisabled()
  fireEvent.click(screen.getByRole('option', { name: 'ElevenLabs' }))
  expect(change).toHaveBeenCalledWith(expect.objectContaining({ target: { value: 'elevenlabs' } }))
})
it('explains that a self-hosted provider needs a service rather than an API key', async () => {
  render(<VoiceProviderNotice provider="chatterbox" />)
  expect(await screen.findByText('Requires a separately installed voice service.')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Add the required key' })).toBeNull()
})
