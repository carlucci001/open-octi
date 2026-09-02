const STOP_WORDS = new Set([
  'a', 'an', 'and', 'any', 'for', 'from', 'give', 'help', 'in', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'with',
])

export function rankCrmCapabilities(tools, { component = '', task = '' } = {}) {
  const query = `${component} ${task}`.toLowerCase()
  const terms = [...new Set(query.split(/[^a-z0-9]+/).filter(term => term.length > 1 && !STOP_WORDS.has(term)))]
  return (Array.isArray(tools) ? tools : [])
    .map(tool => {
      const name = String(tool?.name || '').toLowerCase()
      const description = String(tool?.description || '').toLowerCase()
      let score = 0
      for (const term of terms) {
        if (name === term) score += 20
        if (name.includes(term)) score += 8
        if (description.includes(term)) score += 2
      }
      if (query.includes('press') && name === 'list_press_contacts') score += 30
      return { ...tool, score }
    })
    .filter(tool => terms.length === 0 || tool.score > 0)
    .sort((a, b) => b.score - a.score || String(a.name).localeCompare(String(b.name)))
    .slice(0, 12)
    .map(({ score, ...tool }) => tool)
}

export function parseCrmActionArgs(argsJson) {
  if (argsJson == null || argsJson === '') return {}
  if (typeof argsJson === 'object' && !Array.isArray(argsJson)) return argsJson
  let parsed
  try { parsed = JSON.parse(String(argsJson)) } catch { throw new Error('argsJson must be a valid JSON object') }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('argsJson must be a JSON object')
  return parsed
}
