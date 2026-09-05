import fs from 'node:fs'
import path from 'node:path'
import schema from './manifest.schema.json'
import { loadAll, saveAll } from '@/lib/entityStore'

export const LEAD_SOURCE_ROOT = path.join(process.cwd(), 'vault', 'lead-sources')

let cache = { signature: '', manifests: [] }

function parseValue(raw) {
  const text = raw.trim()
  try { return JSON.parse(text) } catch { return text.replace(/^['"]|['"]$/g, '') }
}

export function parseManifestMarkdown(markdown, filename = 'manifest.md') {
  const match = String(markdown || '').match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/)
  if (!match) throw new Error(`${filename}: frontmatter is required`)
  const manifest = {}
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    const split = line.indexOf(':')
    if (split < 1) throw new Error(`${filename}: invalid frontmatter line`)
    manifest[line.slice(0, split).trim()] = parseValue(line.slice(split + 1))
  }
  manifest.notes = match[2].trim()
  return manifest
}

function typeMatches(value, type) {
  if (type === 'array') return Array.isArray(value)
  if (type === 'null') return value === null
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value)
  return typeof value === type
}

export function validateManifest(manifest) {
  for (const field of schema.required) {
    if (manifest[field] === undefined || manifest[field] === null || manifest[field] === '') {
      throw new Error(`manifest.${field} is required`)
    }
  }
  for (const [field, rule] of Object.entries(schema.properties)) {
    const value = manifest[field]
    if (value === undefined) continue
    if (rule.type) {
      const types = Array.isArray(rule.type) ? rule.type : [rule.type]
      if (!types.some(type => typeMatches(value, type))) throw new Error(`manifest.${field} must be ${types.join(' or ')}`)
    }
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`manifest.${field} must be one of ${rule.enum.join(', ')}`)
    if (rule.pattern && typeof value === 'string' && !(new RegExp(rule.pattern)).test(value)) throw new Error(`manifest.${field} has an invalid format`)
    if (rule.minItems && (!Array.isArray(value) || value.length < rule.minItems)) throw new Error(`manifest.${field} must contain at least ${rule.minItems} item`)
    for (const nested of rule.required || []) {
      if (value?.[nested] === undefined) throw new Error(`manifest.${field}.${nested} is required`)
    }
  }
  if (manifest.compliance.dppa === true) throw new Error('manifest.compliance.dppa must be false; DMV-derived data is not accepted')
  if (manifest.tier !== 'A' && manifest.platform !== 'bulk-file' && manifest.proving.status !== 'excluded-from-build') {
    throw new Error('manifest.proving.status must be excluded-from-build for Tier B, C, or D')
  }
  return manifest
}

function markdownFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('_')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) markdownFiles(full, out)
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(full)
  }
  return out
}

function signature(files) {
  return files.map(file => `${file}:${fs.statSync(file).mtimeMs}:${fs.statSync(file).size}`).join('|')
}

export function loadLeadSourceRegistry({ syncStore = true, force = false } = {}) {
  const files = markdownFiles(LEAD_SOURCE_ROOT).sort()
  const nextSignature = signature(files)
  if (!force && cache.signature === nextSignature) return cache.manifests
  const validations = syncStore ? loadAll('sourceValidations') : []
  const manifests = files.map(file => {
    const parsed = validateManifest(parseManifestMarkdown(fs.readFileSync(file, 'utf8'), path.relative(LEAD_SOURCE_ROOT, file)))
    const latest = validations
      .filter(item => item.sourceId === parsed.id)
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))[0]
    return latest ? { ...parsed, proving: { ...parsed.proving, status: latest.status, score: latest.score, jurisdiction: latest.jurisdiction } } : parsed
  })
  if (syncStore) saveAll('leadSources', manifests.map(item => ({ ...item, notes: item.notes || '' })))
  cache = { signature: nextSignature, manifests }
  return manifests
}

export function getLeadSource(sourceId, options) {
  return loadLeadSourceRegistry(options).find(source => source.id === sourceId) || null
}

export async function refreshLeadSourceRegistry(options = {}) {
  const manifests = loadLeadSourceRegistry({ ...options, force: true })
  const { indexVault } = await import('@/lib/fkl-index')
  await indexVault('lead-sources', LEAD_SOURCE_ROOT, '')
  return manifests
}

export function upsertDiscoveredManifest(manifest) {
  validateManifest(manifest)
  const dir = path.join(LEAD_SOURCE_ROOT, manifest.level)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${manifest.id}.md`)
  const entries = Object.entries(manifest).filter(([key]) => key !== 'notes')
  const frontmatter = entries.map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n')
  fs.writeFileSync(file, `---\n${frontmatter}\n---\n\n${manifest.notes || 'Discovered through public data catalogs. Prove before use.'}\n`)
  cache.signature = ''
  return file
}
