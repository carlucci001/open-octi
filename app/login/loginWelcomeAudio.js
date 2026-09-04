import { clientCapabilityStatus } from '@/lib/client-capabilities'
import { isOpenOcti } from '@/lib/edition'

const MAGGIE_WELCOME_AGENT_ID = 'main'
const MAGGIE_WELCOME_MODEL = 'eleven_turbo_v2_5'
const LOGIN_WELCOME_FETCH_TIMEOUT_MS = 7000
const LOGIN_WELCOME_PLAY_TIMEOUT_MS = 6500
const LOGIN_WELCOME_PENDING_KEY = 'fcc-login-welcome-pending'
const OPENOCTI_FIRST_LOGIN_KEY = 'openocti-first-login-complete'
const OPENOCTI_MODEL_CAPABILITIES = ['anthropic', 'openai', 'gemini', 'openrouter']
const OPENOCTI_WELCOME_ROOT = '/audio/openocti-welcome'
let queuedLoginWelcome = null

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function easternHourForNow(now = new Date()) {
  let hour = now.getHours()
  try {
    const easternHour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    }).format(now)
    hour = Number(easternHour)
  } catch {}
  if (hour === 24) hour = 0
  return hour
}

function greetingForNow(now = new Date()) {
  const hour = easternHourForNow(now)
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function openOctiWelcomeClipFor({ openOcti = isOpenOcti(), setupIncomplete = false, now = new Date() } = {}) {
  if (!openOcti) return null
  if (setupIncomplete) return `${OPENOCTI_WELCOME_ROOT}/welcome-first-run.mp3`
  const hour = easternHourForNow(now)
  if (hour < 12) return `${OPENOCTI_WELCOME_ROOT}/welcome-morning.mp3`
  if (hour < 17) return `${OPENOCTI_WELCOME_ROOT}/welcome-afternoon.mp3`
  return `${OPENOCTI_WELCOME_ROOT}/welcome-evening.mp3`
}

function firstNameFromUser(user, fallbackUsername) {
  const raw = user?.displayName || user?.username || fallbackUsername || ''
  const token = String(raw).trim().split(/[\s@._-]+/).find(Boolean) || 'there'
  const safe = token.replace(/[^a-z0-9']/gi, '')
  if (!safe) return 'there'
  return safe.charAt(0).toUpperCase() + safe.slice(1)
}

export function buildLoginWelcomeText(user, fallbackUsername, now = new Date()) {
  const name = firstNameFromUser(user, fallbackUsername)
  return `${greetingForNow(now)} ${name}. Let me know if I can help you.`
}

function logLoginWelcomeStage(stage, extra = {}) {
  if (typeof window === 'undefined') return
  try {
    fetch('/api/voice/transfer-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({
        stage: `login-welcome-${stage}`,
        to: 'Maggie',
        agentId: MAGGIE_WELCOME_AGENT_ID,
        provider: extra.provider || 'elevenlabs',
        status: extra.status || '',
        reason: extra.reason || '',
      }),
    }).catch(() => {})
  } catch {}
}

export function queueLoginWelcomeAudio(user, fallbackUsername, primedAudio) {
  queuedLoginWelcome = { user, fallbackUsername, primedAudio }
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(LOGIN_WELCOME_PENDING_KEY, JSON.stringify({
      user: {
        displayName: user?.displayName || '',
        username: user?.username || '',
      },
      fallbackUsername: fallbackUsername || '',
    }))
  } catch {}
}

function consumeLoginWelcomeAudio() {
  if (queuedLoginWelcome) {
    const queued = queuedLoginWelcome
    queuedLoginWelcome = null
    try { window.sessionStorage.removeItem(LOGIN_WELCOME_PENDING_KEY) } catch {}
    return queued
  }
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(LOGIN_WELCOME_PENDING_KEY)
    window.sessionStorage.removeItem(LOGIN_WELCOME_PENDING_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export async function playQueuedLoginWelcomeAudio({ delayMs = 120 } = {}) {
  const queued = consumeLoginWelcomeAudio()
  if (!queued) return false
  if (delayMs > 0) await wait(delayMs)
  await playLoginWelcomeAudio(queued.user, queued.fallbackUsername, queued.primedAudio)
  return true
}

async function openOctiWelcomeState() {
  if (!isOpenOcti()) return null
  let profile = {}
  try {
    const response = await fetch('/api/openocti/setup', { cache: 'no-store', credentials: 'same-origin' })
    if (response.ok) profile = (await response.json()).profile || {}
  } catch {}

  const statuses = await Promise.all([...OPENOCTI_MODEL_CAPABILITIES, 'elevenlabs'].map(clientCapabilityStatus))
  const modelConfigured = statuses.slice(0, OPENOCTI_MODEL_CAPABILITIES.length).some(item => item.status === 'configured')
  let completedLocally = false
  try { completedLocally = window.localStorage.getItem(OPENOCTI_FIRST_LOGIN_KEY) === 'true' } catch {}
  return {
    firstLogin: !modelConfigured && !profile.firstLoginCompletedAt && !completedLocally,
    elevenLabsConfigured: statuses.at(-1)?.status === 'configured',
  }
}

async function markOpenOctiFirstLoginComplete() {
  try { window.localStorage.setItem(OPENOCTI_FIRST_LOGIN_KEY, 'true') } catch {}
  try {
    await fetch('/api/openocti/setup', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({ action: 'complete-first-login' }),
    })
  } catch {}
}

async function playPrerecordedWelcome(src, primedAudio, { maxPlaybackMs = 0, blockedDelayMs = maxPlaybackMs } = {}) {
  if (!isOpenOcti() || !src) return false
  const startedAt = Date.now()
  const audio = primedAudio?.audio || new Audio()
  try {
    if (primedAudio?.ready) await primedAudio.ready.catch(() => {})
    audio.preload = 'auto'
    audio.volume = 1
    audio.src = src
    const ended = new Promise(resolve => {
      const done = () => resolve(true)
      audio.addEventListener('ended', done, { once: true })
      audio.addEventListener('error', done, { once: true })
      audio.addEventListener('abort', done, { once: true })
    })
    await audio.play()
    if (maxPlaybackMs > 0) await Promise.race([ended, wait(maxPlaybackMs)])
    else await ended
    return true
  } catch {
    const remaining = Math.max(0, blockedDelayMs - (Date.now() - startedAt))
    if (remaining) await wait(remaining)
    return false
  } finally {
    audio.pause()
    audio.removeAttribute('src')
    audio.load()
  }
}

function writeAscii(view, offset, value) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i))
  }
}

function createSilentWavUrl() {
  const channels = 1
  const sampleRate = 8000
  const bitsPerSample = 16
  const samples = 80
  const dataBytes = samples * channels * (bitsPerSample / 8)
  const bytes = new Uint8Array(44 + dataBytes)
  const view = new DataView(bytes.buffer)
  writeAscii(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeAscii(view, 8, 'WAVE')
  writeAscii(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, channels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true)
  view.setUint16(32, channels * (bitsPerSample / 8), true)
  view.setUint16(34, bitsPerSample, true)
  writeAscii(view, 36, 'data')
  view.setUint32(40, dataBytes, true)
  return URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
}

export function primeLoginWelcomeAudio() {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || typeof URL === 'undefined') return null
  const audio = new Audio()
  let silentUrl = ''
  try {
    silentUrl = createSilentWavUrl()
    audio.preload = 'auto'
    audio.volume = 0
    audio.src = silentUrl
    const cleanup = () => {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      audio.volume = 1
      if (silentUrl) URL.revokeObjectURL(silentUrl)
    }
    const ready = Promise.resolve(audio.play()).catch(() => {}).finally(cleanup)
    return { audio, ready }
  } catch {
    if (silentUrl) URL.revokeObjectURL(silentUrl)
    return null
  }
}

export async function playLoginWelcomeAudio(user, fallbackUsername, primedAudio) {
  if (typeof window === 'undefined' || typeof Audio === 'undefined' || typeof URL === 'undefined') return
  const text = buildLoginWelcomeText(user, fallbackUsername)
  const openOcti = isOpenOcti()
  const openOctiState = openOcti ? await openOctiWelcomeState() : null

  if (openOctiState?.firstLogin) {
    const played = await playPrerecordedWelcome(openOctiWelcomeClipFor({ setupIncomplete: true }), primedAudio, { blockedDelayMs: 8000 })
    logLoginWelcomeStage(played ? 'played' : 'blocked', { provider: 'prerecorded' })
    await markOpenOctiFirstLoginComplete()
    window.location.assign('/settings/models')
    return
  }

  const prerecordedFallback = async () => {
    if (!openOcti) return false
    const played = await playPrerecordedWelcome(openOctiWelcomeClipFor(), primedAudio, { maxPlaybackMs: LOGIN_WELCOME_PLAY_TIMEOUT_MS })
    if (played) logLoginWelcomeStage('played', { provider: 'prerecorded' })
    return played
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timeoutId = controller ? window.setTimeout(() => controller.abort(), LOGIN_WELCOME_FETCH_TIMEOUT_MS) : null
  let audioUrl = ''
  let audio = null
  try {
    const capability = openOctiState
      ? { status: openOctiState.elevenLabsConfigured ? 'configured' : 'not_configured' }
      : await clientCapabilityStatus('elevenlabs')
    if (capability.status !== 'configured') {
      if (!(await prerecordedFallback())) logLoginWelcomeStage('silent', { reason: 'elevenlabs not configured' })
      return
    }
    logLoginWelcomeStage('requested')
    const response = await fetch('/api/voice/lab-tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller?.signal,
      body: JSON.stringify({
        provider: 'elevenlabs',
        model: MAGGIE_WELCOME_MODEL,
        agentId: MAGGIE_WELCOME_AGENT_ID,
        text,
      }),
    })
    if (!response.ok) {
      logLoginWelcomeStage('tts-failed', { status: String(response.status), reason: `lab-tts ${response.status}` })
      if (!(await prerecordedFallback())) logLoginWelcomeStage('silent', { reason: `lab-tts ${response.status}` })
      return
    }

    const blob = await response.blob()
    if (!blob.size) {
      logLoginWelcomeStage('tts-failed', { reason: 'empty audio blob' })
      if (!(await prerecordedFallback())) logLoginWelcomeStage('silent', { reason: 'empty audio blob' })
      return
    }

    audioUrl = URL.createObjectURL(blob)
    if (primedAudio?.ready) await primedAudio.ready.catch(() => {})

    audio = primedAudio?.audio || new Audio()
    audio.preload = 'auto'
    audio.volume = 1
    audio.src = audioUrl

    const ended = new Promise(resolve => {
      const done = () => resolve()
      audio.addEventListener('ended', done, { once: true })
      audio.addEventListener('error', done, { once: true })
      audio.addEventListener('abort', done, { once: true })
    })

    await audio.play()
    logLoginWelcomeStage('played')
    await Promise.race([ended, wait(LOGIN_WELCOME_PLAY_TIMEOUT_MS)])
  } catch (error) {
    logLoginWelcomeStage('failed', { reason: error?.name || error?.message || 'playback failed' })
    if (!(await prerecordedFallback())) logLoginWelcomeStage('silent', { reason: error?.name || error?.message || 'playback failed' })
    // Login must remain fail-open if the browser blocks audio or the TTS service is unavailable.
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)
    if (audio) {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
    }
    if (audioUrl) URL.revokeObjectURL(audioUrl)
  }
}
