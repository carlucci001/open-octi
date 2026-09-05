import { JSDOM } from 'jsdom'

const DROP_ELEMENTS = [
  'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet',
  'form', 'input', 'button', 'select', 'option', 'textarea', 'meta', 'base', 'link',
  'svg', 'math', 'template', 'noscript', 'audio', 'video', 'source', 'track',
]
const REMOTE_OR_ACTION_ATTRIBUTES = new Set([
  'src', 'srcset', 'imagesrcset', 'lowsrc', 'dynsrc', 'poster', 'background',
  'action', 'formaction', 'xlink:href', 'ping',
])
const SAFE_SCHEMES = new Set(['http:', 'https:', 'mailto:', 'tel:'])

function safeUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return false
  if (raw.startsWith('#')) return true
  const compact = raw.replace(/[\u0000-\u0020]/g, '')
  try {
    const parsed = new URL(compact)
    return SAFE_SCHEMES.has(parsed.protocol)
  } catch {
    return false
  }
}

export function sanitizeEmailHtml(value) {
  const source = String(value || '').slice(0, 250_000)
  if (!source) return ''

  const dom = new JSDOM(source)
  const document = dom.window.document
  for (const node of document.querySelectorAll(DROP_ELEMENTS.join(','))) node.remove()
  for (const element of document.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on') || name === 'style' || name === 'srcdoc' || name === 'xmlns') {
        element.removeAttribute(attribute.name)
      } else if (REMOTE_OR_ACTION_ATTRIBUTES.has(name) || (name === 'href' && !safeUrl(attribute.value))) {
        element.removeAttribute(attribute.name)
      }
    }
    if (element.tagName === 'A' && element.getAttribute('target') === '_blank') {
      element.setAttribute('rel', 'noopener noreferrer')
    }
  }
  const sanitized = document.body.innerHTML
  if (sanitized.length <= 30_000) return sanitized

  // Do not slice serialized markup mid-tag. Oversized messages fall back to a
  // bounded plain-text paragraph, using the DOM serializer for escaping.
  const text = document.body.textContent || ''
  const paragraph = document.createElement('p')
  document.body.replaceChildren(paragraph)
  let low = 0
  let high = text.length
  let best = ''
  while (low <= high) {
    const middle = Math.floor((low + high) / 2)
    paragraph.textContent = text.slice(0, middle)
    const candidate = document.body.innerHTML
    if (candidate.length <= 30_000) {
      best = candidate
      low = middle + 1
    } else {
      high = middle - 1
    }
  }
  return best
}

export function sanitizeInboundEmailMessage(message) {
  if (!message || typeof message !== 'object') return message
  return { ...message, html: sanitizeEmailHtml(message.html || '') }
}
