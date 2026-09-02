import crypto from 'node:crypto'

const MAX_CLOCK_SKEW_SECONDS = 300

export function verifyVisibilitySignature({ secret, timestamp, rawBody, supplied }) {
  if (!secret || !timestamp || !rawBody || !supplied?.startsWith('v1=')) return false
  const epoch = Number(timestamp)
  if (!Number.isFinite(epoch) || Math.abs(Math.floor(Date.now() / 1000) - epoch) > MAX_CLOCK_SKEW_SECONDS) return false
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url')
  const received = supplied.slice(3)
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  return expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
}
