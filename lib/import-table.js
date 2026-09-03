export function parseCsv(text) {
  const rows = []; let row = []; let value = ''; let quoted = false
  for (let index = 0; index < String(text || '').length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { value += '"'; index += 1 }
      else if (char === '"') quoted = false
      else value += char
    } else if (char === '"') quoted = true
    else if (char === ',') { row.push(value); value = '' }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(value); value = ''; if (row.some(cell => cell !== '')) rows.push(row); row = []
    } else value += char
  }
  if (value !== '' || row.length) { row.push(value); if (row.some(cell => cell !== '')) rows.push(row) }
  return rows
}

export function parseVCard(text) {
  const cards = String(text || '').split(/END:VCARD/i).map(card => card.trim()).filter(Boolean)
  const headers = ['Name', 'Email', 'Phone', 'Company', 'Title', 'Notes']
  const rows = cards.map(card => {
    const field = name => (card.match(new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'im'))?.[1] || '').trim()
    const structured = field('N').split(';')
    return [field('FN') || [structured[1], structured[0]].filter(Boolean).join(' '), field('EMAIL'), field('TEL'), field('ORG'), field('TITLE'), field('NOTE')]
  })
  return [headers, ...rows]
}

export function guessContactField(header) {
  const value = String(header || '').trim().toLowerCase()
  if (/^(full ?name|name|contact ?name)$/.test(value)) return 'name'
  if (/e-?mail/.test(value)) return 'email'
  if (/phone|mobile|cell|tel/.test(value)) return 'phone'
  if (/title|role|position/.test(value)) return 'title'
  if (/company|account|organi[sz]ation|business/.test(value)) return 'company'
  if (/note/.test(value)) return 'notes'
  return ''
}

export function mapTableRows(headers, rows, mapping) {
  return (rows || []).map(row => {
    const output = {}
    ;(headers || []).forEach((_, index) => { if (mapping[index] && row[index] !== undefined && row[index] !== null && String(row[index]).trim() !== '') output[mapping[index]] = String(row[index]).trim() })
    return output
  })
}
