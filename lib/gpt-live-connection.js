import { createLiveToolBridge } from './gpt-live-tools'

export const LIVE_IDLE_MS = 120000
export const LIVE_MAX_MS = 20 * 60 * 1000

// Media is WebRTC; only control, transcript and delegated Responses events use
// the channel. No legacy Realtime session.update/response.audio events here.
export function createGptLiveConnection({ agentId, agentName: rawAgentName, endpoint = '/api/voice/gpt-live/session', credentials = 'include',
  idleMs = LIVE_IDLE_MS, maxMs = LIVE_MAX_MS, extraBody = {},
  micStream, clientTools, silent = true, context = {}, isCurrent,
  onConnected = () => {}, onTranscript = () => {}, onAudio = () => {}, onError = () => {}, onClosed = () => {}, onTiming = () => {},
  makePeer = () => new RTCPeerConnection(), makeAudio = () => document.createElement('audio'), fetcher = fetch,
}) {
  if (!agentId) throw new Error('createGptLiveConnection requires an agentId.')
  const agentName = String(rawAgentName || '').trim() || 'the agent'
  const pc = makePeer()
  const audioEl = makeAudio()
  audioEl.autoplay = true
  audioEl.dataset.fccOpenaiVoice = '1'
  audioEl.style.display = 'none'
  document.body.appendChild(audioEl)
  const dc = pc.createDataChannel('oai-events')
  const abort = new AbortController()
  const transcripts = { user: '', assistant: '' }
  const backendUsage = new Map()
  const seenEvents = new Set()
  const timingSamples = []
  const startupAt = Date.now(), startupTimings = {}, reportedTimings = new Set()
  let latestInputEndMs = null, awaitingSpeech = false, delegationStartedAt = 0, backendMs = null
  let started = false, closing = false, cleaned = false, sessionId = '', greeting = '', bridge
  let startTimer, closeTimer, idleTimer, maxTimer, startedAt = 0
  let resolveReady, rejectReady
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject })
  // A Stop can arrive while the HTTP request is pending, before start awaits ready.
  void ready.catch(() => {})
  const active = () => !closing && !cleaned && isCurrent()
  function reportTiming(phase) {
    if (!active() || reportedTimings.has(phase)) return
    reportedTimings.add(phase)
    startupTimings[`${phase}Ms`] = Date.now() - startupAt
    onTiming({ phase, elapsedMs: Date.now() - startupAt, timings: { ...startupTimings } })
  }
  function noteAudibleOutput() { if (started) reportTiming('first-audio') }
  const send = event => {
    if (dc.readyState !== 'open' || cleaned) return false
    try { dc.send(JSON.stringify(event)); return true } catch { return false }
  }
  function cleanup({ confirmed = false, seconds, reason = 'connection closed' } = {}) {
    if (cleaned) return
    cleaned = true
    closing = true
    for (const timer of [startTimer, closeTimer, idleTimer, maxTimer]) clearTimeout(timer)
    abort.abort()
    rejectReady(new Error(`${agentName}’s voice connection ended before it was ready.`))
    dc.onopen = dc.onmessage = dc.onerror = dc.onclose = null
    pc.ontrack = pc.onconnectionstatechange = null
    micStream.getTracks().forEach(track => track.stop())
    try { audioEl.pause(); audioEl.srcObject?.getTracks?.().forEach(track => track.stop()); audioEl.srcObject = null; audioEl.remove() } catch {}
    try { dc.close(); pc.close() } catch {}
    onClosed({ sessionId, confirmed, seconds: Number.isFinite(seconds) ? seconds : null,
      elapsedSeconds: startedAt ? (Date.now() - startedAt) / 1000 : 0, reason, backendUsage: [...backendUsage.values()], timingSamples })
  }
  function close(reason = 'voice stopped') {
    if (closing || cleaned) return
    closing = true
    for (const timer of [startTimer, idleTimer, maxTimer]) clearTimeout(timer)
    micStream.getTracks().forEach(track => track.stop())
    audioEl.muted = true
    audioEl.pause()
    rejectReady(new Error(`${agentName}’s voice start was cancelled.`))
    if (started && send({ type: 'session.close' })) {
      closeTimer = setTimeout(() => cleanup({ reason: `${reason}; final usage unconfirmed` }), 5000)
    } else cleanup({ reason })
  }
  function touch() {
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      if (!active()) return
      onError(`${agentName} stopped after two quiet minutes to avoid idle voice charges.`)
      close('idle timeout')
    }, idleMs)
  }
  pc.ontrack = event => {
    if (!active()) return
    const stream = event.streams?.[0] || new MediaStream([event.track])
    audioEl.srcObject = stream
    onAudio(stream, audioEl)
  }
  pc.onconnectionstatechange = () => {
    if (!cleaned && ['failed', 'disconnected'].includes(pc.connectionState)) {
      if (active()) onError(`${agentName}’s voice connection was interrupted. The microphone has been stopped.`)
      close('connection interrupted')
    }
  }
  dc.onclose = () => cleanup({ reason: 'transport closed before final usage confirmation' })
  dc.onerror = () => { if (active()) onError(`${agentName}’s voice connection failed.`); close('data channel error') }
  dc.onmessage = event => {
    let msg
    try { msg = JSON.parse(event.data) } catch { return }
    if (cleaned) return
    if (msg.event_id && seenEvents.has(msg.event_id)) return
    if (msg.event_id) seenEvents.add(msg.event_id)
    if (msg.type === 'session.closed') {
      cleanup({ confirmed: true, seconds: msg.usage?.seconds, reason: msg.reason || 'session closed' })
      return
    }
    // Drain usage while closing, but never run another tool or affect a replacement.
    if (msg.type === 'response.event' && msg.event?.response?.usage && msg.event.response.id) {
      backendUsage.set(msg.event.response.id, { responseId: msg.event.response.id, usage: msg.event.response.usage })
    }
    if (!active()) return
    if (msg.type === 'session.started' && !started) {
      started = true
      startedAt = Date.now()
      clearTimeout(startTimer)
      touch()
      maxTimer = setTimeout(() => { if (active()) onError(`${agentName}’s 20-minute trial session has ended. You can start another conversation.`); close('trial duration limit') }, maxMs)
      onConnected()
      reportTiming('ready')
      if (greeting) send({ type: 'session.commentary.append', event_id: `${agentId}_greeting_${sessionId}`, delegation_id: null, content: greeting })
      resolveReady(true)
    }
    if (msg.type === 'error') {
      onError(`GPT-Live reported a session error. ${agentName} has stopped; check any action before repeating it.`)
      close('provider error')
      return
    }
    if (!started) return
    if (msg.type === 'session.delegation.created') { delegationStartedAt = Date.now(); backendMs = null }
    if (msg.type === 'response.event' && ['response.completed', 'response.failed'].includes(msg.event?.type) && delegationStartedAt) {
      backendMs = Date.now() - delegationStartedAt
    }
    if (['session.input_transcript.delta', 'session.output_transcript.delta'].includes(msg.type) && typeof msg.delta === 'string') {
      touch()
      const role = msg.type === 'session.input_transcript.delta' ? 'user' : 'assistant'
      if (role === 'assistant' && msg.delta.trim()) reportTiming('first-text')
      if (role === 'user' && Number.isFinite(msg.end_ms)) { latestInputEndMs = msg.end_ms; awaitingSpeech = true }
      if (role === 'assistant' && awaitingSpeech && Number.isFinite(msg.start_ms)) {
        timingSamples.push({ speechGapMs: Math.max(0, msg.start_ms - latestInputEndMs), backendMs })
        if (timingSamples.length > 50) timingSamples.shift()
        awaitingSpeech = false
        delegationStartedAt = 0
        backendMs = null
      }
      transcripts[role] = (transcripts[role] + msg.delta).slice(-12000)
      onTranscript({ role, text: transcripts[role], delta: msg.delta, startMs: msg.start_ms, endMs: msg.end_ms })
      // Fragments are not complete turns: never run regex-triggered transfers or
      // destructive intent handlers on them. The backend calls the existing tools.
    }
    if (msg.type === 'response.event') void bridge?.handle(msg)
  }
  async function start() {
    startTimer = setTimeout(() => { if (active()) onError(`${agentName} did not finish connecting. Please try again.`); close('connection timeout') }, 45000)
    try {
      micStream.getTracks().forEach(track => pc.addTrack(track, micStream))
      await pc.setLocalDescription(await pc.createOffer())
      if (pc.iceGatheringState !== 'complete') await new Promise((resolve, reject) => {
        let timer
        const finish = error => {
          clearTimeout(timer)
          pc.removeEventListener('icegatheringstatechange', check)
          abort.signal.removeEventListener('abort', cancelled)
          error ? reject(error) : resolve()
        }
        const check = () => { if (pc.iceGatheringState === 'complete') finish() }
        const cancelled = () => finish(new Error('Voice start cancelled.'))
        pc.addEventListener('icegatheringstatechange', check)
        abort.signal.addEventListener('abort', cancelled, { once: true })
        timer = setTimeout(() => finish(new Error('Microphone connection setup timed out.')), 10000)
        if (abort.signal.aborted) cancelled()
        else check()
      })
      if (!active()) return false
      startupTimings.iceMs = Date.now() - startupAt
      const requestAt = Date.now()
      const response = await fetcher(endpoint, {
        method: 'POST', credentials, headers: { 'Content-Type': 'application/json' }, signal: abort.signal,
        body: JSON.stringify({ ...(extraBody && typeof extraBody === 'object' ? extraBody : {}), agentId, sdp: pc.localDescription.sdp, toolNames: Object.keys(clientTools), silent, context }),
      })
      const result = await response.json()
      startupTimings.requestMs = Date.now() - requestAt
      for (const key of ['sourceMs', 'providerMs']) {
        if (Number.isFinite(result.startupTimings?.[key])) startupTimings[key] = result.startupTimings[key]
      }
      if (!active()) return false
      if (!response.ok) throw new Error(result.error || `${agentName}’s voice session could not start.`)
      sessionId = result.sessionId
      greeting = result.greeting || ''
      bridge = createLiveToolBridge({ tools: clientTools, schemas: result.toolSchemas || {}, send: event => active() && send(event), isCurrent: active,
        onError: message => { if (active()) onError(message); close('delegation error') } })
      await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp })
      return await ready
    } catch (error) {
      if (active()) { onError(error.message || `${agentName}’s voice session could not start.`); close('start failed') }
      return false
    }
  }
  return { pc, dc, audioEl, micStream, start, close, noteAudibleOutput, isCurrent: active }
}
