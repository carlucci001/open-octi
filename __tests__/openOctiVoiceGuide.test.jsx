import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import OpenOctiVoiceGuide from '@/app/components/OpenOctiVoiceGuide'
afterEach(() => vi.unstubAllGlobals())
it('requires an OpenAI connection and never starts voice automatically', async () => {
  const request = vi.fn(async () => ({ json: async () => ({ capabilities: [{ id: 'anthropic', status: 'configured' }] }) }))
  vi.stubGlobal('fetch', request)
  render(<OpenOctiVoiceGuide />)
  expect(await screen.findByRole('link', { name: 'Add an OpenAI key for voice' })).toHaveAttribute('href', '/settings/models#openai')
  expect(screen.queryByRole('button', { name: 'Start voice with Octi' })).not.toBeInTheDocument()
  expect(request).toHaveBeenCalledTimes(1)
})
it('starts voice on request and closes the connection and microphone when ended', async () => {
  const track = { stop: vi.fn() }
  const stream = { getTracks: () => [track] }
  const getUserMedia = vi.fn(async () => stream)
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } })
  const dc = { send: vi.fn(), close: vi.fn() }
  const peer = { addTrack: vi.fn(), createDataChannel: () => dc, createOffer: async () => ({ sdp: 'v=0\r\n' }), setLocalDescription: vi.fn(async () => {}), setRemoteDescription: vi.fn(async () => {}), close: vi.fn() }
  vi.stubGlobal('RTCPeerConnection', class { constructor() { return peer } })
  const request = vi.fn(async url => url.includes('capabilities') ? { json: async () => ({ capabilities: [{ id: 'openai', status: 'configured' }] }) } : { ok: true, text: async () => 'v=0\r\nanswer' })
  vi.stubGlobal('fetch', request)
  render(<OpenOctiVoiceGuide />)
  fireEvent.click(await screen.findByRole('button', { name: 'Start voice with Octi' }))
  await waitFor(() => expect(peer.setRemoteDescription).toHaveBeenCalled())
  expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  expect(request.mock.calls[1][0]).toBe('/api/voice/openai/session?agent=octi-guide')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel connection' }))
  expect(track.stop).toHaveBeenCalledOnce()
  expect(peer.close).toHaveBeenCalledOnce()
  expect(dc.close).toHaveBeenCalledOnce()
})
