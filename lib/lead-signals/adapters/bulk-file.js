import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'
import { Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
import { AsyncUnzipInflate, Unzip } from 'fflate'
import { renderTemplate } from './common'

const DAY_MS = 86400000
const CACHE_ROOT = path.join(process.cwd(), 'data', 'lead-source-cache')

function safeName(value = '') {
  return String(value || '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'file'
}

function normalizeKey(value = '') {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function clean(value) {
  if (value === null || value === undefined) return null
  const text = String(value).replace(/\s+/g, ' ').trim()
  return text || null
}

export function rawValue(row, spec) {
  const candidates = Array.isArray(spec) ? spec : [spec]
  for (const candidate of candidates) {
    if (candidate === null || candidate === undefined) continue
    if (Object.prototype.hasOwnProperty.call(row, candidate)) {
      const value = row[candidate]
      if (value !== null && value !== undefined && String(value).trim() !== '') return value
    }
    const wanted = normalizeKey(candidate)
    const key = Object.keys(row).find(name => normalizeKey(name) === wanted)
    if (key && row[key] !== null && row[key] !== undefined && String(row[key]).trim() !== '') return row[key]
  }
  return null
}

export function parseBulkDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const text = String(value).trim()
  const compact = text.match(/^(\d{4})(\d{2})(\d{2})$/)
  const us = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  const date = compact
    ? new Date(`${compact[1]}-${compact[2]}-${compact[3]}T00:00:00.000Z`)
    : us
      ? new Date(`${us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}T00:00:00.000Z`)
      : new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function isoDate(value) {
  return parseBulkDate(value)?.toISOString() || null
}

function booleanValue(value) {
  if (typeof value === 'boolean') return value
  return /^(?:1|true|yes|y|exempt|e)$/i.test(String(value || '').trim())
}

function classificationsFrom(row, manifest) {
  const direct = clean(rawValue(row, manifest.fields?.classifications))
  const values = direct ? direct.split(/[;,|/]+|\s{2,}/) : []
  const prefixes = manifest.request?.classificationPrefixes || ['class', 'classification', 'princlass']
  for (const [key, value] of Object.entries(row)) {
    if (prefixes.some(prefix => normalizeKey(key).startsWith(normalizeKey(prefix)))) values.push(...String(value || '').split(/[;,|/]+|\s{2,}/))
  }
  return [...new Set(values.map(value => String(value).trim().toUpperCase()).filter(Boolean))]
}

function phoneFrom(row, manifest) {
  const direct = clean(rawValue(row, manifest.fields?.phone))
  if (direct) return direct
  const parts = (manifest.request?.phoneParts || []).map(spec => clean(rawValue(row, spec))).filter(Boolean)
  return parts.length ? parts.join('') : null
}

function countyFipsFrom(row, manifest) {
  const direct = clean(rawValue(row, manifest.fields?.countyFips))
  if (direct) return direct.padStart(5, '0')
  const county = normalizeKey(rawValue(row, manifest.fields?.county))
  return manifest.request?.countyFips?.[county] || null
}

function activeStatus(status, manifest) {
  const current = String(status || '').trim().toUpperCase()
  return (manifest.request?.activeStatuses || ['ACTIVE', 'CLEAR']).some(value => current === String(value).trim().toUpperCase())
}

export function contractorTriggerMatch({ row, manifest, preset = 'license-issued', days = 30, now = new Date(), previousStatus = null, classification = '' }) {
  const fields = manifest.fields || {}
  const issued = parseBulkDate(rawValue(row, fields.licenseIssued || fields.triggeredAt))
  const licenseExpires = parseBulkDate(rawValue(row, fields.licenseExpires))
  const wcExpires = parseBulkDate(rawValue(row, fields.wcExpires))
  const wcExempt = booleanValue(rawValue(row, fields.wcExempt))
  const status = rawValue(row, fields.status)
  const windowDays = Math.max(1, Number(days) || (preset === 'license-issued' ? 30 : 60))
  const start = new Date(now.getTime() - windowDays * DAY_MS)
  const end = new Date(now.getTime() + windowDays * DAY_MS)
  const targetClass = String(classification || '').trim().toUpperCase()
  const classifications = classificationsFrom(row, manifest)
  if (targetClass && !classifications.includes(targetClass)) return { matched: false }

  if (preset === 'insurance-expiring') {
    return { matched: !wcExempt && Boolean(wcExpires && wcExpires >= now && wcExpires <= end), triggerDate: wcExpires, classifications, wcExempt }
  }
  if (preset === 'license-expiring') {
    return { matched: Boolean(licenseExpires && licenseExpires >= now && licenseExpires <= end), triggerDate: licenseExpires, classifications, wcExempt }
  }
  if (preset === 'newly-active') {
    return {
      matched: activeStatus(status, manifest) && previousStatus !== null && !activeStatus(previousStatus, manifest),
      triggerDate: parseBulkDate(rawValue(row, fields.statusChangedAt)) || now,
      classifications,
      wcExempt,
    }
  }
  return { matched: Boolean(issued && issued >= start && issued <= now), triggerDate: issued, classifications, wcExempt }
}

async function* csvMatrices(readable, delimiter = ',') {
  const decoder = new TextDecoder('utf-8')
  let field = ''
  let row = []
  let quoted = false
  let pendingQuote = false
  let skipLf = false
  for await (const chunk of readable) {
    const text = decoder.decode(chunk, { stream: true })
    for (let index = 0; index < text.length; index += 1) {
      const char = text[index]
      if (skipLf) { skipLf = false; if (char === '\n') continue }
      if (pendingQuote) {
        pendingQuote = false
        if (char === '"') { field += '"'; continue }
        quoted = false
      }
      if (char === '"') {
        if (quoted && index === text.length - 1) pendingQuote = true
        else if (quoted && text[index + 1] === '"') { field += '"'; index += 1 }
        else quoted = !quoted
      } else if (char === delimiter && !quoted) {
        row.push(field)
        field = ''
      } else if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r') skipLf = true
        row.push(field)
        field = ''
        if (row.some(value => String(value).trim())) yield row
        row = []
      } else field += char
    }
  }
  const tail = decoder.decode()
  if (tail) field += tail
  if (field || row.length) { row.push(field); yield row }
}

export async function* iterateCsvRows(filePath, { delimiter = ',', headerRow = 0 } = {}) {
  let headers = null
  let rowIndex = -1
  for await (const values of csvMatrices(fs.createReadStream(filePath), delimiter)) {
    rowIndex += 1
    if (rowIndex < headerRow) continue
    if (!headers) {
      headers = values.map(value => String(value || '').replace(/^\uFEFF/, '').trim())
      continue
    }
    yield Object.fromEntries(headers.map((header, index) => [header, String(values[index] ?? '').trim()]))
  }
}

export async function* iterateXlsxRows(filePath, { headerRow = 0, worksheet = 1 } = {}) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(filePath, {
    worksheets: 'emit',
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
  })
  let sheetIndex = 0
  for await (const sheet of reader) {
    sheetIndex += 1
    if (sheetIndex !== Number(worksheet || 1)) continue
    let headers = null
    let rowIndex = -1
    for await (const row of sheet) {
      rowIndex += 1
      const values = Array.from(row.values || []).slice(1).map(value => value?.text ?? value?.result ?? value ?? '')
      if (rowIndex < Number(headerRow || 0)) continue
      if (!headers) { headers = values.map(value => String(value).trim()); continue }
      if (values.some(value => value !== null && value !== '')) yield Object.fromEntries(headers.map((header, index) => [header, values[index] instanceof Date ? values[index].toISOString() : String(values[index] ?? '').trim()]))
    }
    return
  }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback }
}

function contentDispositionName(value = '') {
  const utf = String(value).match(/filename\*=UTF-8''([^;]+)/i)
  if (utf) return decodeURIComponent(utf[1].replace(/["']/g, ''))
  return String(value).match(/filename="?([^";]+)"?/i)?.[1] || ''
}

async function extractZip(archivePath, outputPath, entryPattern) {
  await new Promise((resolve, reject) => {
    let selected = false
    let finishedInput = false
    const unzip = new Unzip(file => {
      const matches = !entryPattern || new RegExp(entryPattern, 'i').test(file.name)
      if (selected || !matches || !/\.(?:csv|xlsx)$/i.test(file.name)) return
      selected = true
      const output = fs.createWriteStream(outputPath)
      output.on('error', reject)
      file.ondata = (error, chunk, final) => {
        if (error) { reject(error); return }
        output.write(Buffer.from(chunk))
        if (final) output.end(() => resolve(file.name))
      }
      file.start()
    })
    unzip.register(AsyncUnzipInflate)
    const input = fs.createReadStream(archivePath)
    input.on('data', chunk => unzip.push(new Uint8Array(chunk), false))
    input.on('error', reject)
    input.on('end', () => { finishedInput = true; unzip.push(new Uint8Array(0), true); if (!selected) reject(new Error('ZIP did not contain a matching CSV/XLSX file')) })
    input.on('close', () => { if (finishedInput && !selected) reject(new Error('ZIP did not contain a supported data file')) })
  })
}

async function fileMagic(file) {
  const handle = await fs.promises.open(file, 'r')
  try {
    const buffer = Buffer.alloc(4)
    await handle.read(buffer, 0, 4, 0)
    return buffer
  } finally { await handle.close() }
}

async function sha256File(file) {
  const hash = crypto.createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk)
  return hash.digest('hex')
}

function nodeHeaders(headers = {}) {
  return {
    get(name) {
      const value = headers[String(name).toLowerCase()]
      return Array.isArray(value) ? value.join(', ') : (value === undefined ? null : String(value))
    },
    getSetCookie() {
      const value = headers['set-cookie']
      return Array.isArray(value) ? value : (value ? [String(value)] : [])
    },
  }
}

function nativeDownload(url, { headers = {}, timeoutMs = 900000, redirects = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url)
    const client = target.protocol === 'http:' ? http : https
    const request = client.get(target, { headers }, response => {
      const status = Number(response.statusCode) || 0
      if (status >= 300 && status < 400 && response.headers.location) {
        if (redirects >= 5) { response.resume(); reject(new Error(`Too many redirects downloading ${target.hostname}`)); return }
        const cookie = (response.headers['set-cookie'] || []).map(value => String(value).split(';')[0]).join('; ')
        response.resume()
        const nextHeaders = { ...headers, ...(cookie ? { Cookie: [headers.Cookie, cookie].filter(Boolean).join('; ') } : {}) }
        resolve(nativeDownload(new URL(response.headers.location, target).toString(), { headers: nextHeaders, timeoutMs, redirects: redirects + 1 }))
        return
      }
      resolve({
        status,
        ok: status >= 200 && status < 300,
        headers: nodeHeaders(response.headers),
        body: response,
        url: target.toString(),
      })
    })
    request.setTimeout(timeoutMs, () => request.destroy(new Error(`Download timed out after ${Math.round(timeoutMs / 1000)} seconds`)))
    request.on('error', reject)
  })
}

function expectedResponseBytes(response, offset = 0) {
  const rangeTotal = response.headers.get('content-range')?.match(/\/(\d+)$/)?.[1]
  if (rangeTotal) return Number(rangeTotal)
  const length = Number(response.headers.get('content-length'))
  return Number.isFinite(length) && length > 0 ? offset + length : null
}

async function streamResponsePart(response, file, append, byteCounter, onBytes, skipBytes = 0) {
  if (!response.body) throw new Error('Download response had no body')
  let lastReportedAt = Date.now()
  let remainingSkip = Math.max(0, Number(skipBytes) || 0)
  const meter = new Transform({ transform(chunk, encoding, callback) {
    let output = chunk
    if (remainingSkip >= output.length) {
      remainingSkip -= output.length
      callback()
      return
    }
    if (remainingSkip > 0) {
      output = output.subarray(remainingSkip)
      remainingSkip = 0
    }
    byteCounter.value += output.length
    if (Date.now() - lastReportedAt >= 30_000) {
      lastReportedAt = Date.now()
      onBytes?.(byteCounter.value)
    }
    callback(null, output)
  } })
  const source = typeof response.body.getReader === 'function' ? Readable.fromWeb(response.body) : response.body
  await pipeline(source, meter, fs.createWriteStream(file, { flags: append ? 'a' : 'w' }))
}

async function cacheDownload({ manifest, fileSpec, context, fetchImpl, onProgress }) {
  const dir = path.join(CACHE_ROOT, safeName(manifest.id), safeName(fileSpec.id || 'main'))
  await fs.promises.mkdir(dir, { recursive: true })
  const metadataPath = path.join(dir, 'metadata.json')
  const currentPath = path.join(dir, 'current')
  const previousPath = path.join(dir, 'previous')
  const expandedPath = path.join(dir, 'current.expanded')
  const previousExpandedPath = path.join(dir, 'previous.expanded')
  const metadata = readJson(metadataPath, {}) || {}
  const endpoint = new URL(renderTemplate(fileSpec.url || manifest.endpoint, context))
  const fetchedAtMs = Date.parse(metadata.fetchedAt || '')
  const localCacheFresh = fetchImpl === globalThis.fetch
    && fs.existsSync(currentPath)
    && metadata.sha256
    && Number(metadata.bytes) > 0
    && Number.isFinite(fetchedAtMs)
    && Date.now() - fetchedAtMs < 6 * 60 * 60 * 1000
  if (localCacheFresh) {
    return {
      ...metadata,
      path: metadata.expanded ? expandedPath : currentPath,
      previousPath: fs.existsSync(previousExpandedPath) ? previousExpandedPath : (fs.existsSync(previousPath) ? previousPath : null),
      changed: false,
      notModified: true,
      cacheFresh: true,
    }
  }
  const headers = {
    Accept: 'application/zip,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Accept-Encoding': 'identity',
    'User-Agent': 'Mozilla/5.0 (compatible; OpenOcti Lead Signals/1.0; public-record bulk downloader)',
  }
  if (metadata.etag) headers['If-None-Match'] = metadata.etag
  if (metadata.lastModified) headers['If-Modified-Since'] = metadata.lastModified
  let responseCookie = ''
  if (manifest.request?.establishSession && manifest.request?.officialLandingPage) {
    const session = await fetchImpl(manifest.request.officialLandingPage, {
      headers: { Accept: 'text/html', 'User-Agent': headers['User-Agent'] },
      signal: AbortSignal.timeout(30_000),
    })
    if (!session.ok) throw new Error(`HTTP ${session.status} establishing public download session with ${new URL(manifest.request.officialLandingPage).hostname}`)
    responseCookie = (session.headers.getSetCookie?.() || [session.headers.get('set-cookie')].filter(Boolean))
      .map(value => String(value).split(';')[0]).join('; ')
    await session.body?.cancel().catch(() => {})
    if (responseCookie) headers.Cookie = responseCookie
  }
  const requestDownload = fetchImpl === globalThis.fetch
    ? (url, options) => nativeDownload(url, { headers: options.headers, timeoutMs: fileSpec.timeoutMs || 900000 })
    : (url, options) => fetchImpl(url, { ...options, signal: AbortSignal.timeout(fileSpec.timeoutMs || 900000) })
  let response = await requestDownload(endpoint.toString(), { headers })
  let transferUrl = response.url || endpoint.toString()
  const downloadCookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean)
  if (downloadCookies.length) responseCookie = downloadCookies.map(value => String(value).split(';')[0]).join('; ')
  if (response.status === 304 && fs.existsSync(currentPath)) return { ...metadata, path: metadata.expanded ? expandedPath : currentPath, previousPath: fs.existsSync(previousExpandedPath) ? previousExpandedPath : (fs.existsSync(previousPath) ? previousPath : null), changed: false, notModified: true }
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${endpoint.hostname}`)
  const partialDate = new Date().toISOString().slice(0, 10)
  const endpointKey = crypto.createHash('sha256').update(endpoint.toString()).digest('hex').slice(0, 12)
  const tempPath = path.join(dir, `partial-${safeName(endpoint.hostname)}-${endpointKey}-${partialDate}`)
  const byteCounter = { value: fs.existsSync(tempPath) ? fs.statSync(tempPath).size : 0 }
  let expectedBytes = expectedResponseBytes(response)
  let attempts = 0
  let skippedResponseBytes = byteCounter.value
  let noProgressAttempts = 0
  while (true) {
    const beforeAttempt = byteCounter.value
    let streamError = null
    try {
      await streamResponsePart(response, tempPath, byteCounter.value > 0, byteCounter, bytes => onProgress?.({
        bytes,
        expectedBytes,
        label: `Downloading ${fileSpec.id || 'file'} — ${(bytes / 1048576).toFixed(1)} MB${expectedBytes ? ` of ${(expectedBytes / 1048576).toFixed(1)} MB` : ''}`,
      }), skippedResponseBytes)
    } catch (error) { streamError = error }
    skippedResponseBytes = 0
    if (!streamError && (!expectedBytes || byteCounter.value >= expectedBytes)) break
    noProgressAttempts = byteCounter.value > beforeAttempt ? 0 : noProgressAttempts + 1
    if (attempts >= 32 || noProgressAttempts >= 8) throw streamError || new Error(`Incomplete download from ${endpoint.hostname}: ${byteCounter.value} of ${expectedBytes} bytes`)
    attempts += 1
    const resumeHeaders = { ...headers, Range: `bytes=${byteCounter.value}-` }
    if (responseCookie) resumeHeaders.Cookie = responseCookie
    delete resumeHeaders['If-None-Match']
    delete resumeHeaders['If-Modified-Since']
    response = await requestDownload(transferUrl, { headers: resumeHeaders })
    transferUrl = response.url || transferUrl
    const nextCookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie')].filter(Boolean)
    if (nextCookies.length) responseCookie = nextCookies.map(value => String(value).split(';')[0]).join('; ')
    if (response.status === 416 && expectedBytes && byteCounter.value >= expectedBytes) break
    if (response.status === 200) {
      // CSLB's generated-file handler does not honor Range and occasionally
      // closes a large response early. Preserve the high-water mark, stream
      // past those already-cached bytes, then append only the unseen suffix.
      // This remains constant-memory and never accepts a truncated snapshot.
      skippedResponseBytes = byteCounter.value
      expectedBytes = expectedResponseBytes(response) || expectedBytes
      continue
    }
    if (response.status !== 206) throw new Error(`Range resume returned HTTP ${response.status} after ${byteCounter.value} bytes from ${endpoint.hostname}${streamError ? ` (${streamError.message})` : ''}`)
    expectedBytes = expectedResponseBytes(response, byteCounter.value) || expectedBytes
  }
  const bytes = byteCounter.value
  if (bytes === 0) {
    await fs.promises.unlink(tempPath).catch(() => {})
    throw new Error(`Empty download from ${endpoint.hostname} for ${fileSpec.id || 'file'}`)
  }
  const sha256 = await sha256File(tempPath)
  const changed = sha256 !== metadata.sha256
  if (!changed && fs.existsSync(currentPath)) await fs.promises.unlink(tempPath)
  else {
    if (fs.existsSync(currentPath)) await fs.promises.copyFile(currentPath, previousPath)
    if (fs.existsSync(expandedPath)) await fs.promises.copyFile(expandedPath, previousExpandedPath)
    await fs.promises.copyFile(tempPath, currentPath)
    await fs.promises.unlink(tempPath)
  }
  const magic = await fileMagic(currentPath)
  const isZip = magic[0] === 0x50 && magic[1] === 0x4b
  let dataPath = currentPath
  let entryName = metadata.entryName || ''
  if (isZip && (changed || !fs.existsSync(expandedPath))) {
    entryName = await extractZip(currentPath, expandedPath, fileSpec.entryPattern)
    dataPath = expandedPath
  } else if (isZip) dataPath = expandedPath
  const originalName = contentDispositionName(response.headers.get('content-disposition')) || entryName || path.basename(endpoint.pathname) || `${fileSpec.id || 'download'}.${fileSpec.format || 'csv'}`
  const next = {
    url: endpoint.toString(),
    fileName: originalName,
    entryName,
    format: fileSpec.format || (/\.xlsx$/i.test(entryName || originalName) ? 'xlsx' : 'csv'),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    sourceDate: response.headers.get('last-modified') || fileSpec.sourceDate || null,
    sha256,
    bytes,
    expanded: isZip,
    fetchedAt: new Date().toISOString(),
  }
  await fs.promises.writeFile(metadataPath, JSON.stringify(next, null, 2))
  return { ...next, path: dataPath, previousPath: fs.existsSync(previousExpandedPath) ? previousExpandedPath : (fs.existsSync(previousPath) ? previousPath : null), changed, notModified: false }
}

export async function* iterateBulkFileRows(file, options = {}) {
  if (String(options.format || '').toLowerCase() === 'xlsx') yield* iterateXlsxRows(file, options)
  else yield* iterateCsvRows(file, options)
}

function createJoinDb(dbPath, rowIterator, on) {
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec('CREATE TABLE join_rows (join_key TEXT PRIMARY KEY, payload TEXT NOT NULL)')
  const insert = db.prepare('INSERT OR REPLACE INTO join_rows (join_key, payload) VALUES (?, ?)')
  return (async () => {
    let batch = 0
    db.exec('BEGIN')
    try {
      for await (const row of rowIterator) {
        const key = clean(rawValue(row, on))
        if (key) insert.run(key, JSON.stringify(row))
        batch += 1
        if (batch % 2000 === 0) { db.exec('COMMIT'); db.exec('BEGIN') }
      }
      db.exec('COMMIT')
      return db
    } catch (error) {
      try { db.exec('ROLLBACK') } catch {}
      db.close()
      throw error
    }
  })()
}

function compareRank(a, b, preset, classification) {
  const dateA = parseBulkDate(a.triggeredAt)?.getTime() || 0
  const dateB = parseBulkDate(b.triggeredAt)?.getTime() || 0
  const urgencyA = preset === 'license-issued' || preset === 'newly-active' ? dateA : -dateA
  const urgencyB = preset === 'license-issued' || preset === 'newly-active' ? dateB : -dateB
  if (urgencyA !== urgencyB) return urgencyB - urgencyA
  const wanted = String(classification || '').trim().toUpperCase()
  const classA = wanted && a.attrs.classifications.includes(wanted) ? 1 : 0
  const classB = wanted && b.attrs.classifications.includes(wanted) ? 1 : 0
  if (classA !== classB) return classB - classA
  return Number(Boolean(b.entity.phone)) - Number(Boolean(a.entity.phone))
}

function normalizeContractor(row, manifest, trigger, context) {
  const fields = manifest.fields || {}
  const licenseNo = clean(rawValue(row, fields.licenseNo || fields.externalId))
  const zip = clean(rawValue(row, fields.zip))?.slice(0, 5) || null
  const county = clean(rawValue(row, fields.county))
  const countyFips = countyFipsFrom(row, manifest)
  const phone = phoneFrom(row, manifest)
  const attrs = {
    licenseNo,
    classifications: trigger.classifications,
    licenseIssued: isoDate(rawValue(row, fields.licenseIssued)),
    licenseExpires: isoDate(rawValue(row, fields.licenseExpires)),
    status: clean(rawValue(row, fields.status)),
    wcCarrier: clean(rawValue(row, fields.wcCarrier)),
    wcExpires: isoDate(rawValue(row, fields.wcExpires)),
    wcExempt: trigger.wcExempt,
    bondAmount: Number(String(rawValue(row, fields.bondAmount) || '').replace(/[^0-9.-]/g, '')) || null,
    countyFips,
    triggerDate: trigger.triggerDate?.toISOString() || null,
  }
  return {
    sourceId: manifest.id,
    externalId: licenseNo || crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex').slice(0, 24),
    triggeredAt: attrs.triggerDate,
    trigger: context.preset,
    entity: {
      name: clean(rawValue(row, fields.organizationName || fields.name)) || `California contractor ${licenseNo || ''}`.trim(),
      dba: clean(rawValue(row, fields.dba)),
      address: {
        line1: clean(rawValue(row, fields.line1)),
        city: clean(rawValue(row, fields.city)),
        state: clean(rawValue(row, fields.state)) || context.state || null,
        zip,
        county,
        countyFips,
      },
      phone,
      email: null,
      website: null,
    },
    people: [],
    attrs,
    provenance: { source: 'government', provider: 'public-record', actor: manifest.id, agency: 'CSLB', field: fields },
  }
}

export async function pullBulkFile({ manifest, jurisdiction = {}, since, limit = 50, signalOptions = {}, fetchImpl = fetch, now = new Date(), onProgress } = {}) {
  const startedAt = Date.now()
  const context = {
    state: String(signalOptions.state || jurisdiction.state || '').toUpperCase(),
    county: String(signalOptions.county || jurisdiction.county || '').replace(/\s+County$/i, '').trim(),
    countyFips: String(signalOptions.countyFips || jurisdiction.countyFips || '').trim(),
    zip: String(signalOptions.zip || jurisdiction.zip || '').slice(0, 5),
    preset: signalOptions.preset || manifest.triggers?.[0] || 'license-issued',
    days: Number(signalOptions.days) || (signalOptions.preset === 'license-issued' ? 30 : 60),
    classification: signalOptions.classification || '',
    since: since || '',
    limit: Math.min(Math.max(Number(limit) || 50, 1), 200),
  }
  const files = manifest.request?.files?.length ? manifest.request.files : [{ id: 'main', url: manifest.endpoint, format: manifest.request?.format || 'csv' }]
  onProgress?.({ phase: 'fetching', completed: 0, total: files.length, label: `Downloading ${manifest.name}` })
  const downloads = []
  for (const fileSpec of files) {
    downloads.push(await cacheDownload({
      manifest,
      fileSpec,
      context,
      fetchImpl,
      onProgress: update => onProgress?.({ phase: 'fetching', completed: downloads.length, total: files.length, ...update }),
    }))
    onProgress?.({ phase: 'fetching', completed: downloads.length, total: files.length, label: `Downloaded ${downloads.length} of ${files.length} files` })
  }
  const mainIndex = Math.max(0, files.findIndex(file => file.id === (manifest.request?.mainFile || files[0].id)))
  const mainSpec = files[mainIndex]
  const mainDownload = downloads[mainIndex]
  const joinSpec = manifest.join ? files.find(file => file.id === manifest.join.file) : null
  const joinDownload = joinSpec ? downloads[files.indexOf(joinSpec)] : null
  let joinDb = null
  let previousDb = null
  try {
    if (joinSpec && joinDownload) {
      const dbPath = path.join(CACHE_ROOT, safeName(manifest.id), `join-${safeName(joinSpec.id)}-${joinDownload.sha256.slice(0, 12)}.sqlite`)
      joinDb = fs.existsSync(dbPath) ? new Database(dbPath) : await createJoinDb(dbPath, iterateBulkFileRows(joinDownload.path, joinSpec), manifest.join.on)
    }
    if (context.preset === 'newly-active' && mainDownload.previousPath) {
      const previousPath = path.join(CACHE_ROOT, safeName(manifest.id), `previous-status-${mainDownload.sha256.slice(0, 12)}.sqlite`)
      previousDb = await createJoinDb(previousPath, iterateBulkFileRows(mainDownload.previousPath, mainSpec), manifest.join?.on || manifest.fields?.licenseNo || manifest.fields?.externalId)
    }
    const lookupJoin = joinDb?.prepare('SELECT payload FROM join_rows WHERE join_key = ?')
    const lookupPrevious = previousDb?.prepare('SELECT payload FROM join_rows WHERE join_key = ?')
    const best = []
    let scanned = 0
    let activeCount = 0
    let matchingCount = 0
    let phoneCount = 0
    for await (const masterRow of iterateBulkFileRows(mainDownload.path, mainSpec)) {
      scanned += 1
      const licenseNo = clean(rawValue(masterRow, manifest.join?.on || manifest.fields?.licenseNo || manifest.fields?.externalId))
      const joined = lookupJoin && licenseNo ? readJsonValue(lookupJoin.get(licenseNo)?.payload) : null
      const row = joined
        ? { ...joined, ...masterRow, ...Object.fromEntries(Object.entries(joined).map(([key, value]) => [`Join:${key}`, value])) }
        : masterRow
      const status = rawValue(row, manifest.fields?.status)
      if (activeStatus(status, manifest)) activeCount += 1
      const rowState = String(rawValue(row, manifest.fields?.state) || context.state || '').toUpperCase()
      if (context.state && rowState && rowState !== context.state) continue
      const rowZip = clean(rawValue(row, manifest.fields?.zip))?.slice(0, 5) || ''
      if (context.zip && rowZip !== context.zip) continue
      const rowCounty = String(rawValue(row, manifest.fields?.county) || '').replace(/\s+County$/i, '').trim()
      const rowCountyFips = countyFipsFrom(row, manifest)
      if (context.county && normalizeKey(rowCounty) !== normalizeKey(context.county)) continue
      if (context.countyFips && rowCountyFips && rowCountyFips !== context.countyFips) continue
      const previous = lookupPrevious && licenseNo ? readJsonValue(lookupPrevious.get(licenseNo)?.payload) : null
      const trigger = contractorTriggerMatch({ row, manifest, preset: context.preset, days: context.days, now, previousStatus: previous ? rawValue(previous, manifest.fields?.status) : null, classification: context.classification })
      if (!trigger.matched) continue
      matchingCount += 1
      const normalized = normalizeContractor(row, manifest, trigger, context)
      if (normalized.entity.phone) phoneCount += 1
      best.push(normalized)
      best.sort((a, b) => compareRank(a, b, context.preset, context.classification))
      if (best.length > context.limit) best.length = context.limit
      if (scanned % 25000 === 0) onProgress?.({ phase: 'parsing', completed: scanned, total: Number(mainDownload.rows || scanned), label: `Streamed ${scanned.toLocaleString('en-US')} licenses` })
    }
    const sourceDate = mainDownload.sourceDate || mainDownload.fetchedAt
    return {
      rows: best,
      cursor: null,
      stats: {
        reachability: true,
        schemaMatched: scanned > 0,
        fetched: best.length,
        scanned,
        totalActive: activeCount,
        matchingCount,
        phonePresent: matchingCount ? phoneCount / matchingCount : 0,
        fileDate: sourceDate,
        fileAgeDays: sourceDate ? Math.max(0, (now.getTime() - new Date(sourceDate).getTime()) / DAY_MS) : null,
        files: downloads.map((download, index) => ({ id: files[index].id, fileName: download.fileName, sha256: download.sha256, etag: download.etag, lastModified: download.lastModified, bytes: download.bytes, changed: download.changed })),
        elapsedMs: Date.now() - startedAt,
      },
    }
  } finally {
    joinDb?.close()
    previousDb?.close()
  }
}

function readJsonValue(value) {
  try { return value ? JSON.parse(value) : null } catch { return null }
}
