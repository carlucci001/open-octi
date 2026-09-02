import fs from 'fs'
import path from 'path'
import { readData } from '@/lib/dataStore'

export const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.cache', 'coverage', '__pycache__'])

function slug(value, fallback = 'vault') {
  return String(value || fallback).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || fallback
}

function normalizePath(value) {
  return String(value || '').replace(/\\/g, '/')
}

function linuxMirrorForWindowsPath(value) {
  const clean = normalizePath(value)
  const m = clean.match(/^[a-z]:\/dev\/(.+)$/i)
  return m ? `/home/carl/dev/${m[1]}` : ''
}

function rootMirrorForDevPath(value) {
  const clean = normalizePath(value)
  const windows = clean.match(/^[a-z]:\/dev\/(.+)$/i)
  if (windows) return `/root/${windows[1]}`
  const homeDev = clean.match(/^\/home\/carl\/dev\/(.+)$/i)
  return homeDev ? `/root/${homeDev[1]}` : ''
}

function candidatePaths(vault) {
  const candidates = []
  const add = value => {
    const clean = normalizePath(value)
    if (clean && !candidates.includes(clean)) candidates.push(clean)
  }

  if (process.platform === 'win32') {
    add(vault.windowsPath)
    add(vault.localPath)
    add(vault.path)
    add(vault.linuxPath)
  } else {
    add(vault.linuxPath)
    add(vault.productionPath)
    add(vault.serverPath)
    add(vault.path)
    add(linuxMirrorForWindowsPath(vault.windowsPath || vault.localPath || vault.path))
    add(rootMirrorForDevPath(vault.linuxPath || vault.windowsPath || vault.localPath || vault.path))
  }

  return candidates
}

function resolveVaultPath(vault) {
  const candidates = candidatePaths(vault)
  return candidates.find(p => fs.existsSync(p)) || candidates[0] || ''
}

function normalizeRoot(root, index = 0) {
  const name = root.name || root.id || `Root ${index + 1}`
  const pathValue = resolveVaultPath(root)
  return {
    id: root.id || slug(name, `root-${index + 1}`),
    name,
    color: root.color || '',
    path: pathValue,
    configuredPath: normalizePath(root.path || root.windowsPath || root.linuxPath || ''),
    available: Boolean(pathValue && fs.existsSync(pathValue)),
  }
}

export function getVaults() {
  const cfg = readData('notes-config.json') || {}
  const configured = Array.isArray(cfg.vaults) && cfg.vaults.length
    ? cfg.vaults
    : cfg.vaultPath
      ? [{ id: 'default', name: cfg.vaultName || 'Vault', path: cfg.vaultPath }]
      : [{ id: 'default', name: 'Vault', windowsPath: 'c:/dev/newsroomaios', linuxPath: '/home/carl/dev/newsroomaios' }]

  return configured.map(v => {
    const name = v.name || v.id || v.vaultName || 'Vault'
    if (Array.isArray(v.roots) && v.roots.length) {
      const roots = v.roots.map(normalizeRoot)
      return {
        id: v.id || slug(name),
        name,
        path: roots.find(r => r.available)?.path || roots[0]?.path || '',
        configuredPath: roots.map(r => r.configuredPath).filter(Boolean).join('; '),
        roots,
        defaultRoot: v.defaultRoot || roots[0]?.id || '',
        available: roots.some(r => r.available),
      }
    }
    const pathValue = resolveVaultPath(v)
    return {
      id: v.id || slug(name),
      name,
      path: pathValue,
      configuredPath: normalizePath(v.path || v.windowsPath || v.linuxPath || ''),
      available: Boolean(pathValue && fs.existsSync(pathValue)),
    }
  })
}

export function pickVault(input) {
  const vaults = getVaults()
  const requested = typeof input?.get === 'function'
    ? input.get('vault') || input.get('vaultId')
    : input?.vault || input?.vaultId
  if (requested) {
    const key = slug(requested)
    return vaults.find(v => v.id === requested || slug(v.id) === key || slug(v.name) === key) || vaults[0]
  }
  return vaults[0]
}

export function isInside(base, full) {
  const baseAbs = path.resolve(base)
  const fullAbs = path.resolve(full)
  return fullAbs === baseAbs || fullAbs.startsWith(baseAbs + path.sep)
}

export function safeJoin(vault, rel) {
  const full = path.resolve(vault, rel || '')
  if (!isInside(vault, full)) throw new Error('Path escapes vault')
  return full
}

export function resolveVaultFile(vault, rel) {
  const roots = Array.isArray(vault?.roots) ? vault.roots.filter(r => r.available) : []
  if (!roots.length) return safeJoin(vault.path || vault, rel)

  const clean = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '')
  const [prefix, ...rest] = clean.split('/')
  const root = roots.find(r => r.id === prefix || slug(r.name) === slug(prefix)) ||
    roots.find(r => r.id === vault.defaultRoot) ||
    roots[0]
  const inner = root.id === prefix || slug(root.name) === slug(prefix) ? rest.join('/') : clean
  return safeJoin(root.path, inner)
}

export function walkMd(dir, vault, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const name of fs.readdirSync(dir)) {
    if (name.startsWith('.') && name !== '.claude') continue
    if (SKIP_DIRS.has(name)) continue
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) walkMd(full, vault, out)
    else if (name.toLowerCase().endsWith('.md')) {
      const rel = path.relative(vault, full).replace(/\\/g, '/')
      out.push({ path: rel, name: name.replace(/\.md$/i, ''), size: stat.size, modifiedAt: stat.mtime.toISOString() })
    }
  }
  return out
}

export function walkVaultMd(vault) {
  const roots = Array.isArray(vault?.roots) ? vault.roots.filter(r => r.available) : []
  if (!roots.length) return walkMd(vault.path || vault, vault.path || vault)

  const files = []
  for (const root of roots) {
    const rootFiles = walkMd(root.path, root.path)
    for (const file of rootFiles) {
      files.push({
        ...file,
        path: `${root.id}/${file.path}`,
        name: file.name,
        sourceRoot: root.id,
        sourceName: root.name,
        sourceColor: root.color,
      })
    }
  }
  return files
}
