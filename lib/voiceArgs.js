// Voice webhook tools (ElevenLabs) can only send argument keys their schema
// declares. crm_execute therefore declares a few common keys plus
// `extra_json` (a JSON-encoded object) for everything else, and some agents
// send `args` itself as a JSON string. Normalize all of those into one object.
export function coerceVoiceArgs(args) {
  let out = args
  if (typeof out === 'string') {
    try { out = JSON.parse(out) } catch { out = {} }
  }
  if (!out || typeof out !== 'object' || Array.isArray(out)) return out
  const extra = out.extra_json
  if (extra !== undefined) {
    const { extra_json: _drop, ...rest } = out
    let parsed = extra
    if (typeof extra === 'string') {
      try { parsed = extra.trim() ? JSON.parse(extra) : {} } catch { parsed = {} }
    }
    out = { ...(parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}), ...rest }
  }
  for (const [k, v] of Object.entries(out)) if (v === '' || v === null) delete out[k]
  return out
}
