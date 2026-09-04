import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const sourceOverlay = path.join(cwd, 'openocti')
const root = path.resolve(process.argv[2] || (fs.existsSync(path.join(sourceOverlay, 'README.md')) ? sourceOverlay : cwd))
const markdownFiles = []

function walk(directory) {
  if (!fs.existsSync(directory)) return
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (entry.name.toLowerCase().endsWith('.md')) markdownFiles.push(full)
  }
}

const readme = path.join(root, 'README.md')
if (fs.existsSync(readme)) markdownFiles.push(readme)
walk(path.join(root, 'docs', 'guides'))

const failures = []
const imagePattern = /!\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const linkPattern = /(?<!!)\[[^\]]+\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g

function localTarget(sourceFile, rawTarget) {
  if (/^(?:https?:|mailto:|tel:|data:)/i.test(rawTarget) || rawTarget.startsWith('#')) return null
  const withoutSuffix = rawTarget.split('#', 1)[0].split('?', 1)[0]
  if (!withoutSuffix) return null
  let decoded
  try { decoded = decodeURIComponent(withoutSuffix) } catch { decoded = withoutSuffix }
  return path.resolve(path.dirname(sourceFile), decoded)
}

for (const sourceFile of markdownFiles) {
  const text = fs.readFileSync(sourceFile, 'utf8')
  const relativeSource = path.relative(root, sourceFile).replaceAll('\\', '/')
  for (const pattern of [imagePattern, linkPattern]) {
    pattern.lastIndex = 0
    for (const match of text.matchAll(pattern)) {
      const target = localTarget(sourceFile, match[1])
      if (!target) continue
      const sourceTreeTarget = root === sourceOverlay && sourceFile === readme
        ? path.resolve(cwd, match[1].split('#', 1)[0].split('?', 1)[0])
        : ''
      const resolved = fs.existsSync(target)
        ? target
        : fs.existsSync(path.join(target, 'README.md'))
          ? path.join(target, 'README.md')
          : sourceTreeTarget && fs.existsSync(sourceTreeTarget)
            ? sourceTreeTarget
            : ''
      if (!resolved) {
        failures.push(`${relativeSource}: missing ${match[1]}`)
        continue
      }
      if (pattern === imagePattern) {
        const limit = path.extname(resolved).toLowerCase() === '.gif' ? 3 * 1024 * 1024 : 400 * 1024
        const size = fs.statSync(resolved).size
        if (size > limit) failures.push(`${relativeSource}: image ${match[1]} is ${size} bytes (limit ${limit})`)
      }
    }
  }
}

if (failures.length) {
  console.error(`Documentation link check failed (${failures.length}):\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(`Documentation link check passed: ${markdownFiles.length} Markdown files, all local targets present.`)
