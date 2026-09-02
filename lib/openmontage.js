import fs from 'fs'
import path from 'path'

const DEFAULT_PIPELINES = [
  'screen-demo',
  'podcast-repurpose',
  'documentary-montage',
  'animated-explainer',
  'talking-head',
  'cinematic',
]

function labelFromId(id = '') {
  return String(id || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
}

function candidateRoots() {
  const configured = process.env.OPENMONTAGE_ROOT || process.env.OPEN_MONTAGE_ROOT
  return [
    configured,
    path.join(process.cwd(), 'vendor', 'openmontage'),
    path.join(process.cwd(), 'openmontage'),
    '/opt/openmontage',
    '/srv/openmontage',
  ].filter(Boolean)
}

function firstExistingRoot() {
  return candidateRoots().find(root => fs.existsSync(root)) || candidateRoots()[0] || ''
}

export function getOpenMontageStatus() {
  const root = firstExistingRoot()
  const installed = !!root && fs.existsSync(root)
  const pipelineDir = installed ? path.join(root, 'pipeline_defs') : ''
  const pipelineFiles = installed && fs.existsSync(pipelineDir)
    ? fs.readdirSync(pipelineDir).filter(file => file.endsWith('.yaml'))
    : []
  const pipelineIds = pipelineFiles.map(file => path.basename(file, '.yaml')).sort()
  const featured = DEFAULT_PIPELINES
    .filter(id => pipelineIds.includes(id))
    .map(id => ({
      id,
      label: labelFromId(id),
      file: path.join('pipeline_defs', `${id}.yaml`),
    }))

  return {
    ok: true,
    installed,
    root: installed ? root : '',
    configuredRoot: process.env.OPENMONTAGE_ROOT || process.env.OPEN_MONTAGE_ROOT || '',
    pipelineCount: pipelineIds.length,
    pipelines: pipelineIds.map(id => ({
      id,
      label: labelFromId(id),
      file: path.join('pipeline_defs', `${id}.yaml`),
      featured: DEFAULT_PIPELINES.includes(id),
    })),
    featured,
    checks: {
      pythonVenv: installed && fs.existsSync(path.join(root, '.venv')),
      remotionComposer: installed && fs.existsSync(path.join(root, 'remotion-composer', 'package.json')),
      setupPy: installed && fs.existsSync(path.join(root, 'setup.py')),
      makefile: installed && fs.existsSync(path.join(root, 'Makefile')),
    },
  }
}
