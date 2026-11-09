// Create after microphone acquisition, matching PortalLiveVoice's device order.
// A successful provider handshake alone does not mean browser audio is usable.
export function createGeminiLiveAudio(AudioContextClass = globalThis.AudioContext, timeoutMs = 4000) {
  const context = new AudioContextClass()
  let disposed = false
  let rejectPending
  let timer
  const ready = new Promise((resolve, reject) => {
    rejectPending = reject
    timer = setTimeout(() => reject(new Error('Browser audio did not start. Start voice again to enable audio.')), timeoutMs)
    try {
      const resumed = context.state === 'running' ? undefined : context.resume()
      Promise.resolve(resumed).then(() => {
        if (disposed || context.state === 'closed') throw new Error('Voice start was cancelled')
        if (context.state !== 'running') throw new Error('Browser audio is paused. Start voice again to enable audio.')
        resolve(context)
      }).catch(reject)
    } catch (error) { reject(error) }
  }).finally(() => clearTimeout(timer))
  // Readiness can fail while getUserMedia is still awaiting user permission.
  // Attach the rejection handler now; the caller still receives the rejection.
  ready.catch(() => {})
  return {
    context,
    ready,
    isClosed: () => disposed || context.state === 'closed',
    close() {
      if (disposed) return
      disposed = true
      rejectPending(new Error('Voice start was cancelled'))
      clearTimeout(timer)
      try { Promise.resolve(context.close()).catch(() => {}) } catch {}
    },
  }
}

export function sendGeminiInitialTurn(state, { initialText = '', silent = false, agentName = 'Agent' } = {}) {
  if (!state.active || state.initialTurnSent) return false
  const spokenText = String(initialText || '').trim()
  if (!spokenText && silent) return false
  const text = spokenText || `Greet me briefly as ${agentName}, then listen for my request.`
  state.ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true } }))
  state.initialTurnSent = true
  return true
}

export async function requestGeminiLiveToken(fetcher, payload, controller, timeoutMs = 10000) {
  let timer
  let onAbort
  const cancelled = new Promise((resolve, reject) => {
    onAbort = () => reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('Voice start was cancelled'))
    controller.signal.addEventListener('abort', onAbort, { once: true })
    if (controller.signal.aborted) onAbort()
    timer = setTimeout(() => controller.abort(new Error('Gemini Live token request timed out. Start voice again.')), timeoutMs)
  })
  try {
    return await Promise.race([
      cancelled,
      (async () => {
        const response = await fetcher('/api/voice/gemini-live-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify(payload),
        })
        const data = await response.json().catch(() => null)
        return { response, data }
      })(),
    ])
  } finally {
    clearTimeout(timer)
    controller.signal.removeEventListener('abort', onAbort)
  }
}

// Start only after the user requests a session, alongside microphone readiness.
// A device error/cancellation can happen before this promise is awaited.
export function beginGeminiLiveTokenRequest(fetcher, payload, controller, onSettled = () => {}) {
  const startedAt = Date.now()
  const pending = requestGeminiLiveToken(fetcher, payload, controller).then(
    result => {
      onSettled({ status: result.response.ok && result.data?.ok ? 'ready' : 'failed', elapsedMs: Date.now() - startedAt })
      return result
    },
    error => {
      onSettled({ status: controller.signal.aborted ? 'cancelled' : 'failed', elapsedMs: Date.now() - startedAt })
      throw error
    },
  )
  pending.catch(() => {})
  return pending
}

export function decodeGeminiOutputAudio(base64, mimeType = '') {
  const mime = String(mimeType || '')
  if (mime && !/^audio\/pcm(?:\s*;|$)/i.test(mime)) throw new Error('Gemini returned an unsupported audio format.')
  const rate = mime.match(/(?:^|;)\s*rate\s*=\s*(\d+)\s*(?:;|$)/i)
  const channels = mime.match(/(?:^|;)\s*channels\s*=\s*(\d+)\s*(?:;|$)/i)
  const sampleRate = rate ? Number(rate[1]) : 24000
  if ((/;\s*rate\s*=/i.test(mime) && !rate) || sampleRate < 8000 || sampleRate > 96000) {
    throw new Error('Gemini returned an unsupported audio sample rate.')
  }
  if ((/;\s*channels\s*=/i.test(mime) && !channels) || (channels && Number(channels[1]) !== 1)) {
    throw new Error('Gemini returned unsupported audio channels.')
  }
  // A short or odd-length chunk is not worth a live call: decode the whole samples it holds.
  const raw = atob(base64)
  const samples = new Float32Array(raw.length >> 1)
  for (let i = 0; i < samples.length; i++) {
    let value = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8)
    if (value >= 0x8000) value -= 0x10000
    samples[i] = value / 0x8000
  }
  return { samples, sampleRate }
}

// Routes agent speech through an analyser on its way to the speakers, so the
// header equalizer can follow the agent's voice the way it follows the
// microphone. Returns null when the browser cannot build one; the caller then
// connects straight to the speakers and the session is unaffected.
export function createGeminiOutputMeter(context) {
  let analyser
  try {
    analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.65
    analyser.connect(context.destination)
    const bytes = new Uint8Array(analyser.frequencyBinCount)
    const meter = {
      // Where playback sources connect. Null once closed, so a late chunk
      // falls back to the speakers instead of a disconnected node.
      input: analyser,
      read() {
        if (!meter.input) return null
        analyser.getByteFrequencyData(bytes)
        return bytes
      },
      close() {
        if (!meter.input) return
        meter.input = null
        try { analyser.disconnect() } catch {}
      },
    }
    return meter
  } catch {
    try { analyser?.disconnect() } catch {}
    return null
  }
}
