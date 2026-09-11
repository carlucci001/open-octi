// @vitest-environment node
import { expect, it, vi } from 'vitest'
vi.mock('../lib/openocti-keys', () => ({ effectiveProviderEnv: env => env }))
import { openOctiHelpChat } from '../lib/openocti-help-chat'
import { searchSetupHelp } from '../lib/openocti-setup-help'

it('opens troubleshooting links by topic identifier', () => {
  expect(searchSetupHelp('invalid-key').map(topic => topic.id)).toEqual(['invalid-key'])
  expect(searchSetupHelp('media-failure').map(topic => topic.id)).toEqual(['media-failure'])
})

it('makes no model request without this installation’s key', async () => {
  const fetchImpl = vi.fn()
  await expect(openOctiHelpChat('Help', {}, { env: {}, fetchImpl })).rejects.toMatchObject({ code: 'not_configured' })
  expect(fetchImpl).not.toHaveBeenCalled()
})
it('grounds model help in bundled instructions and sanitized diagnostics without tool access', async () => {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'Open Postiz settings.' } }] })))
  const result = await openOctiHelpChat('Next?', { state: 'no_channels' }, { env: { OPENAI_API_KEY: 'unit-test-only-key' }, fetchImpl })
  const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
  expect(body.messages[0].content).toContain('Installing Postiz alone does not connect Facebook')
  expect(body.messages[0].content).toContain('no_channels')
  expect(body.tools).toBeUndefined(); expect(body.messages[0].content).not.toContain('unit-test-only-key')
  expect(result.text).toBe('Open Postiz settings.')
})
