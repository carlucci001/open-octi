// Keep browser capture consistent with the working PortalLiveVoice path.
export const GEMINI_MICROPHONE_CONSTRAINTS = {
  audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  video: false,
}

function audioTracks(stream) {
  return stream?.getAudioTracks?.() || (stream?.getTracks?.() || []).filter(track => !track.kind || track.kind === 'audio')
}

export function snapshotGeminiMicrophone(stream) {
  return audioTracks(stream).map(track => ({ ready: track.readyState, enabled: Boolean(track.enabled), muted: Boolean(track.muted) }))
}

export function hasLiveGeminiMicrophone(stream) {
  return audioTracks(stream).some(track => track.readyState === 'live')
}

export function stopGeminiMicrophone(stream, ownedStreams) {
  ownedStreams?.delete?.(stream)
  try { stream?.getTracks?.().forEach(track => track.stop()) } catch {}
}

export const GEMINI_MICROPHONE_ENDED_MESSAGE = 'Your microphone stopped. Check that it is connected, then start voice again.'

// A device can end its first grant while AudioContext opens the output route.
// Retry exactly once, only for a dead/missing track. Quiet and muted tracks are valid.
export async function recoverGeminiMicrophone({ stream, getUserMedia, isCurrent, signal, release = stopGeminiMicrophone, timeoutMs = 4000 }) {
  const cancelled = () => Object.assign(new Error('Voice start was cancelled'), { name: 'AbortError' })
  if (signal?.aborted || !isCurrent()) throw cancelled()
  if (hasLiveGeminiMicrophone(stream)) return stream
  release(stream)
  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, granted) => {
      if (settled) { if (granted) release(granted); return }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', abort)
      if (error) { if (granted) release(granted); reject(error) }
      else resolve(granted)
    }
    const abort = () => finish(cancelled())
    const timer = setTimeout(() => finish(new Error('Microphone did not reconnect. Check your microphone, then start voice again.')), timeoutMs)
    signal?.addEventListener?.('abort', abort, { once: true })
    if (signal?.aborted || !isCurrent()) { abort(); return }
    Promise.resolve().then(() => {
      if (signal?.aborted || !isCurrent()) throw cancelled()
      return getUserMedia(GEMINI_MICROPHONE_CONSTRAINTS)
    }).then(granted => {
      if (signal?.aborted || !isCurrent()) return finish(cancelled(), granted)
      if (!hasLiveGeminiMicrophone(granted)) return finish(new Error(GEMINI_MICROPHONE_ENDED_MESSAGE), granted)
      finish(null, granted)
    }, error => finish(error))
  })
}

function cleanGeminiMicrophoneLabel(label) {
  return String(label || '').replace(/^\s*(?:default|communications) - /i, '').replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').trim()
}

export function describeGeminiMicrophone(stream) {
  return cleanGeminiMicrophoneLabel(audioTracks(stream)[0]?.label)
}

export function geminiMicrophoneSilentMessage(label) {
  return `${label || 'Your microphone'} is not sending any audio. Reconnect it or choose a different microphone, then start voice again.`
}

// A device can hand back a live, unmuted track that never delivers a single
// frame. Read the first frame from a clone: quiet audio, muted tracks and
// hardware-muted zero frames all pass; only 'no-frames' means a dead device.
// Never rejects, and never stops or alters the original track.
export function waitForGeminiMicrophoneAudio(stream, { timeoutMs = 2500, Processor = globalThis.MediaStreamTrackProcessor } = {}) {
  const startedAt = Date.now()
  return new Promise(resolve => {
    const track = audioTracks(stream).find(candidate => candidate.readyState === 'live')
    if (!track || typeof Processor !== 'function' || typeof track.clone !== 'function') return resolve({ status: 'unsupported', elapsedMs: 0 })
    let clone
    let reader
    let timer
    let settled = false
    const finish = status => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { Promise.resolve(reader?.cancel?.()).catch(() => {}) } catch {}
      try { clone?.stop?.() } catch {}
      resolve({ status, elapsedMs: Date.now() - startedAt })
    }
    try {
      clone = track.clone()
      reader = new Processor({ track: clone }).readable.getReader()
    } catch { return finish('unsupported') }
    timer = setTimeout(() => finish(track.readyState !== 'live' ? 'unsupported' : track.muted ? 'muted' : 'no-frames'), timeoutMs)
    let pending
    try { pending = reader.read() } catch { return finish('unsupported') }
    Promise.resolve(pending).then(result => {
      if (!result?.value) return finish('unsupported')
      try { result.value.close() } catch {}
      finish('audio')
    }, () => finish('unsupported'))
  })
}

// Verify the microphone delivers audio frames; if the default device is dead,
// switch to another one that does. Ownership: every stream opened here is
// released unless returned; the original is released only when a different
// stream is returned ('fallback'). On throw the caller still owns the original.
export async function selectWorkingGeminiMicrophone({ stream, getUserMedia, enumerateDevices, isCurrent, signal, release = stopGeminiMicrophone, probe = waitForGeminiMicrophoneAudio, onNoAudio, timeoutMs = 2500, recheckMs = 300, budgetMs = 15000, maxCandidates = 3 }) {
  const cancelled = () => Object.assign(new Error('Voice start was cancelled'), { name: 'AbortError' })
  const stopped = () => signal?.aborted || !isCurrent()
  if (stopped()) throw cancelled()
  const startedAt = Date.now()
  const deadline = startedAt + budgetMs
  const elapsed = () => Date.now() - startedAt
  // enumerateDevices can take ~10 s while a dead device is open: overlap it with the probe.
  const devices = (async () => {
    try { const list = await enumerateDevices(); return Array.isArray(list) ? list : [] } catch { return [] }
  })()
  const first = await probe(stream, { timeoutMs })
  if (stopped()) throw cancelled()
  if (first.status !== 'no-frames') return { stream, status: first.status === 'audio' ? 'verified' : 'unverified', label: describeGeminiMicrophone(stream), deadLabel: '', elapsedMs: elapsed() }
  const deadTrack = audioTracks(stream)[0]
  let deadSettings = {}
  try { deadSettings = deadTrack?.getSettings?.() || {} } catch {}
  const deadRawLabel = deadTrack?.label || ''
  const deadLabel = describeGeminiMicrophone(stream)
  try { onNoAudio?.({ label: deadLabel }) } catch {}
  const list = await new Promise((resolve, reject) => {
    const done = (settle, value) => { clearTimeout(timer); signal?.removeEventListener?.('abort', abort); settle(value) }
    const abort = () => done(reject, cancelled())
    const timer = setTimeout(() => done(resolve, []), Math.max(0, deadline - Date.now()))
    signal?.addEventListener?.('abort', abort, { once: true })
    devices.then(value => done(resolve, value))
  })
  if (stopped()) throw cancelled()
  const isDead = device => Boolean(
    (deadSettings.deviceId && device.deviceId === deadSettings.deviceId) ||
    (deadSettings.groupId && device.groupId === deadSettings.groupId) ||
    (device.label && device.label === deadRawLabel) ||
    (deadLabel && cleanGeminiMicrophoneLabel(device.label) === deadLabel))
  const seen = new Set()
  const candidates = list.filter(device => {
    const id = device?.deviceId
    if (device?.kind !== 'audioinput' || !id || id === 'default' || id === 'communications' || isDead(device) || seen.has(id)) return false
    seen.add(id)
    return true
  }).slice(0, maxCandidates)
  // Resolves the granted stream, or null when the open fails or outlives the budget.
  // A grant arriving after the bound or after cancellation is released.
  const openCandidate = (deviceId, ms) => new Promise((resolve, reject) => {
    let settled = false
    const finish = (error, granted) => {
      if (settled) { if (granted) release(granted); return }
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener?.('abort', abort)
      if (error) { if (granted) release(granted); reject(error) }
      else resolve(granted || null)
    }
    const abort = () => finish(cancelled())
    const timer = setTimeout(() => finish(null), ms)
    signal?.addEventListener?.('abort', abort, { once: true })
    Promise.resolve().then(() => getUserMedia({ audio: { ...GEMINI_MICROPHONE_CONSTRAINTS.audio, deviceId: { exact: deviceId } }, video: false })).then(
      granted => (stopped() ? finish(cancelled(), granted) : finish(null, granted)),
      () => finish(null))
  })
  for (const candidate of candidates) {
    if (deadline - Date.now() <= 0) break
    const candidateStream = await openCandidate(candidate.deviceId, deadline - Date.now())
    if (stopped()) { if (candidateStream) release(candidateStream); throw cancelled() }
    if (!candidateStream) continue
    let keep = false
    try {
      const result = await probe(candidateStream, { timeoutMs })
      if (stopped()) throw cancelled()
      if (result.status !== 'audio') continue
      // A slow-starting default device may have woken up: prefer it over switching.
      const recheck = await probe(stream, { timeoutMs: recheckMs })
      if (stopped()) throw cancelled()
      if (recheck.status === 'audio') return { stream, status: 'default-recovered', label: deadLabel, deadLabel: '', elapsedMs: elapsed() }
      release(stream)
      keep = true
      return { stream: candidateStream, status: 'fallback', label: describeGeminiMicrophone(candidateStream), deadLabel, elapsedMs: elapsed() }
    } finally { if (!keep) release(candidateStream) }
  }
  throw new Error(geminiMicrophoneSilentMessage(deadLabel))
}

// Native ended does not fire for an explicit track.stop(); the processor also
// calls check(), so both forms of microphone loss stop the current session.
export function watchGeminiMicrophone(stream, { isCurrent, onEnded }) {
  let closed = false
  let failed = false
  const tracks = audioTracks(stream)
  const check = () => {
    if (closed || failed || !isCurrent()) return false
    if (hasLiveGeminiMicrophone(stream)) return true
    failed = true
    onEnded()
    return false
  }
  for (const track of tracks) track.addEventListener?.('ended', check)
  return {
    check,
    close() {
      if (closed) return
      closed = true
      for (const track of tracks) track.removeEventListener?.('ended', check)
    },
  }
}

export function encodeGeminiPcm(float32, sourceRate, targetRate = 16000) {
  const ratio = sourceRate / targetRate
  const length = Math.max(1, Math.floor(float32.length / ratio))
  const bytes = new Uint8Array(length * 2)
  const view = new DataView(bytes.buffer)
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio)
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end && j < float32.length; j += 1) sum += float32[j]
    const sample = Math.max(-1, Math.min(1, sum / Math.max(1, end - start)))
    view.setInt16(i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
  }
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

export function createGeminiInputMeter(context, source) {
  let analyser
  try {
    analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)
    const bytes = new Uint8Array(analyser.frequencyBinCount)
    let closed = false
    return {
      read() {
        if (closed) return null
        analyser.getByteFrequencyData(bytes)
        return bytes
      },
      close() {
        if (closed) return
        closed = true
        try { source.disconnect(analyser) } catch {}
        try { analyser.disconnect() } catch {}
      },
    }
  } catch {
    try { analyser?.disconnect() } catch {}
    return null
  }
}

export function createGeminiCaptureDiagnostics() {
  let peak = 0
  let squares = 0
  let samples = 0
  let frames = 0
  let signalHeard = false
  return {
    observe(input) {
      frames += 1
      let frameSquares = 0
      for (const value of input) {
        peak = Math.max(peak, Math.abs(value))
        frameSquares += value * value
      }
      squares += frameSquares
      samples += input.length
      const firstSignal = !signalHeard && Math.sqrt(frameSquares / Math.max(1, input.length)) >= 0.001
      if (firstSignal) signalHeard = true
      return firstSignal
    },
    snapshot(stream, context) {
      return {
        peak: Number(peak.toFixed(5)),
        rms: Number(Math.sqrt(squares / Math.max(1, samples)).toFixed(5)),
        frames,
        sampleRate: context.sampleRate,
        context: context.state,
        tracks: (stream.getAudioTracks?.() || stream.getTracks?.() || []).map(track => ({
          ready: track.readyState, enabled: Boolean(track.enabled), muted: Boolean(track.muted),
        })),
      }
    },
  }
}

export function wakeRecognitionErrorMessage(error, { startFailed = false } = {}) {
  const code = typeof error === 'string' ? error : error?.error || error?.name || ''
  if (!startFailed && ['aborted', 'no-speech'].includes(code)) return ''
  if (code === 'not-allowed' || code === 'NotAllowedError') return 'Microphone permission denied for wake listening. Allow the microphone, then try Go Live again.'
  if (code === 'audio-capture' || code === 'NotReadableError') return 'Wake listening could not use the microphone. Select an agent directly or check your microphone.'
  if (code === 'network') return 'Wake listening could not reconnect to the browser’s speech service. Try Go Live again, or select an agent directly to start voice.'
  if (code === 'service-not-allowed') return 'The browser blocked its speech-recognition service. Select an agent directly to start voice.'
  return 'Wake listening could not start. Try Go Live again, or select an agent directly.'
}
