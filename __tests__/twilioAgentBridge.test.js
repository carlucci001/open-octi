import { describe, expect, it } from 'vitest'
import bridge from '../lib/twilio-agent-bridge'

describe('twilio agent bridge helpers', () => {
  it('builds bidirectional Twilio stream TwiML with custom parameters', () => {
    const twiml = bridge.buildTwilioAgentTwiML({
      requestUrl: 'https://openocti.local/api/twilio/agent-voice',
      agentId: 'matilda',
      provider: 'openai',
      model: 'gpt-realtime',
      voiceName: 'marin',
      greeting: 'Hello from the bridge.',
      env: { TWILIO_AGENT_BRIDGE_TOKEN: 'test-token' },
    })

    expect(twiml).toContain('<Connect>')
    expect(twiml).toContain('<Stream')
    expect(twiml).toContain('url="wss://openocti.local/twilio-agent-stream"')
    expect(twiml).toContain('name="agentId" value="matilda"')
    expect(twiml).toContain('name="provider" value="openai"')
    expect(twiml).toContain('name="bridgeToken" value="test-token"')
  })

  it('reports sanitized bridge status without exposing secrets', () => {
    const status = bridge.bridgeStatus({
      OPENAI_API_KEY: 'sk-secret',
      TWILIO_AGENT_BRIDGE_TOKEN: 'secret-token',
      TWILIO_AGENT_STREAM_URL: 'wss://voice.example.test/twilio-agent-stream',
      NEXT_PUBLIC_APP_URL: 'https://crm.example.test',
    })

    expect(status.openaiConfigured).toBe(true)
    expect(status.bridgeTokenConfigured).toBe(true)
    expect(JSON.stringify(status)).not.toContain('sk-secret')
    expect(JSON.stringify(status)).not.toContain('secret-token')
    expect(status.streamUrl).toBe('wss://voice.example.test/twilio-agent-stream')
  })
})
