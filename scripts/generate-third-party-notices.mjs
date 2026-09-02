import { spawnSync } from 'node:child_process'

function normalizeLicense(value) {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (Array.isArray(value)) return value.map(normalizeLicense).filter(Boolean).join(' OR ')
  if (value && typeof value === 'object') return normalizeLicense(value.type || value.name)
  return 'UNKNOWN'
}

function walkDependencies(dependencies, found) {
  for (const [name, details] of Object.entries(dependencies || {})) {
    if (!details || typeof details !== 'object') continue
    const version = details.version || 'unknown'
    found.set(`${name}@${version}`, {
      name,
      version,
      license: normalizeLicense(details.license || details.licenses),
    })
    walkDependencies(details.dependencies, found)
  }
}

export function generateThirdPartyNotices(root) {
  const result = spawnSync('npm', ['ls', '--prod', '--json', '--long', '--all'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  })
  if (!result.stdout?.trim()) {
    throw new Error('npm ls --prod --json --long --all did not return a dependency tree.')
  }

  let tree
  try {
    tree = JSON.parse(result.stdout)
  } catch {
    throw new Error('Could not parse npm ls --prod --json --long --all output.')
  }

  const dependencies = new Map()
  walkDependencies(tree.dependencies, dependencies)
  const rows = [...dependencies.values()].sort((a, b) =>
    a.name.localeCompare(b.name) || a.version.localeCompare(b.version),
  )

  const lines = [
    '# Third-Party Notices',
    '',
    'OpenOcti includes or interoperates with the software listed below. Each component remains under its own license.',
    '',
    'This inventory was generated from `npm ls --prod --json --long --all`.',
    '',
    '| Package | Version | License |',
    '| --- | --- | --- |',
    ...rows.map(({ name, version, license }) => `| ${name} | ${version} | ${license} |`),
    '',
    '## Runtime services',
    '',
    '- OpenClaw 2026.6.34 — separate agent-runtime service; see its published package for license terms.',
    '- DeerFlow — optional, disabled-by-default research profile; distributed separately under its upstream license.',
    '',
    'Review the corresponding package or upstream repository for complete license text and attribution requirements.',
    '',
  ]
  return { content: lines.join('\n'), packageCount: rows.length }
}
