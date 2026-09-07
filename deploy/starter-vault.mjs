import fs from 'node:fs'
import path from 'node:path'

// Starter content is copied once. Existing installation notes are never overwritten.
export function ensureStarterVault({ appRoot = process.cwd(), dataDir = process.env.CRM_DATA_DIR || path.join(appRoot, 'data'), vaultRoot = process.env.COMMAND_VAULT_ROOT || process.env.DEV_ROOT || path.join(dataDir, 'vaults') } = {}) {
  const destination = path.join(vaultRoot, 'default')
  const copyTree = (source, target) => {
    if (!fs.existsSync(source)) return
    fs.mkdirSync(target, { recursive: true })
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue
      const from = path.join(source, entry.name), to = path.join(target, entry.name)
      if (entry.isDirectory()) copyTree(from, to)
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        try { fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL) }
        catch (error) { if (error.code !== 'EEXIST') throw error }
      }
    }
  }
  fs.mkdirSync(destination, { recursive: true })
  copyTree(path.join(appRoot, 'knowledge', 'vault'), destination)
  copyTree(path.join(appRoot, 'knowledge', 'agents'), path.join(destination, 'Agents'))
  copyTree(path.join(appRoot, 'docs', 'guides'), path.join(destination, 'Guides'))
  return destination
}
