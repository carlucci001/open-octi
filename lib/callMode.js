// Global preference: does the phone icon dial via the in-browser Twilio
// softphone, or hand the number to this computer's tel: handler (e.g.
// Windows Phone Link)? Stored per-device in localStorage — every
// CallButton instance reads it, nobody has to pass it down as a prop.

const KEY = 'fcc-call-mode'
const EVENT = 'fcc-call-mode-change'
const MODES = ['twilio', 'device']
const DEFAULT_MODE = 'twilio'

export function getCallMode() {
  if (typeof window === 'undefined') return DEFAULT_MODE
  try {
    const v = window.localStorage.getItem(KEY)
    return MODES.includes(v) ? v : DEFAULT_MODE
  } catch {
    return DEFAULT_MODE
  }
}

export function setCallMode(mode) {
  if (!MODES.includes(mode)) return
  try {
    window.localStorage.setItem(KEY, mode)
  } catch {}
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: mode }))
  } catch {}
}

// Subscribes to mode changes from this tab (CustomEvent) and other tabs
// (native storage event). Returns an unsubscribe function.
export function subscribeCallMode(cb) {
  if (typeof window === 'undefined') return () => {}
  const onCustom = (e) => cb(e?.detail ?? getCallMode())
  const onStorage = (e) => { if (e.key === KEY || e.key == null) cb(getCallMode()) }
  window.addEventListener(EVENT, onCustom)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(EVENT, onCustom)
    window.removeEventListener('storage', onStorage)
  }
}

// Mirrors LeadsManager.js's normalizeTelHref: keep a leading '+', strip
// everything else non-digit.
export function telHref(phone) {
  const raw = String(phone || '').trim()
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/\D+/g, '')
  return 'tel:' + (hasPlus ? `+${digits}` : digits)
}
