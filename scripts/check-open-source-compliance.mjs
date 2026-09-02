import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..')
export const MANIFEST_PATH = 'compliance/open-source-boundary.json'

const HTTPS_URL = /^https:\/\//
const IMMUTABLE_IMAGE = /^[a-z0-9.-]+\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/
const RELEASE_GATES = ['legalReview', 'secretScan', 'clientDataRemoval', 'trademarkAssetReview']

function add(errors, condition, message) {
  if (!condition) errors.push(message)
}

export function validateOpenSourceManifest(manifest) {
  const errors = []
  add(errors, manifest?.schemaVersion === 1, 'Manifest schemaVersion must be 1.')
  add(errors, manifest?.project?.currentDistribution === 'private-internal', 'Current distribution must remain private-internal until a public release is approved.')

  const release = manifest?.project?.publicRelease
  add(errors, ['not-approved', 'approved'].includes(release?.status), 'Public release status must be not-approved or approved.')
  if (release?.status === 'approved') {
    add(errors, typeof release.licenseSpdx === 'string' && release.licenseSpdx.length > 0, 'An approved public release requires a project SPDX license.')
    for (const gate of RELEASE_GATES) {
      add(errors, release?.gates?.[gate] === 'passed', `An approved public release requires ${gate} to be passed.`)
    }
  }

  add(errors, Array.isArray(manifest?.components) && manifest.components.length > 0, 'At least one service-level open-source component is required.')
  for (const component of manifest?.components || []) {
    const label = component?.id || component?.name || 'component'
    add(errors, typeof component?.id === 'string' && component.id.length > 0, 'Every component requires an id.')
    add(errors, HTTPS_URL.test(component?.sourceRepository || ''), `${label}: sourceRepository must be an HTTPS URL.`)
    add(errors, HTTPS_URL.test(component?.licenseUrl || ''), `${label}: licenseUrl must be an HTTPS URL.`)
    add(errors, typeof component?.licenseSpdx === 'string' && component.licenseSpdx.length > 0, `${label}: licenseSpdx is required.`)
    add(errors, IMMUTABLE_IMAGE.test(component?.image || ''), `${label}: image must use an immutable sha256 repository digest, not a mutable tag.`)
    add(errors, component?.boundary?.type === 'separate-network-service', `${label}: must remain a separate network service.`)
    add(errors, component?.boundary?.vendoredSource === false, `${label}: vendoredSource must remain false.`)
    add(errors, component?.boundary?.npmDependency === false, `${label}: npmDependency must remain false.`)
    add(errors, typeof component?.boundary?.upstreamImageModified === 'boolean', `${label}: upstreamImageModified must be explicit.`)
    add(errors, typeof component?.noticeFile === 'string' && component.noticeFile.length > 0, `${label}: noticeFile is required.`)
    add(errors, component?.operations?.publicRegistrationExpected === false, `${label}: public registration must be expected disabled.`)

    if (component?.boundary?.upstreamImageModified === true && component?.networkCopyleft?.modifiedDeploymentRequiresSourceOffer === true) {
      add(errors, HTTPS_URL.test(component?.networkCopyleft?.correspondingSourceUrl || ''), `${label}: a modified network deployment requires a corresponding-source URL.`)
      add(errors, HTTPS_URL.test(component?.networkCopyleft?.sourceOfferUrl || ''), `${label}: a modified network deployment requires a source-offer URL.`)
    }
  }
  return errors
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function trackedConfigFiles(root) {
  const result = spawnSync('git', ['ls-files', '*.json', '*.yml', '*.yaml'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) return []
  return result.stdout.split(/\r?\n/).filter(Boolean)
}

export function checkRepository(root = DEFAULT_ROOT) {
  const errors = []
  const manifestFile = path.join(root, MANIFEST_PATH)
  if (!fs.existsSync(manifestFile)) return [`Missing ${MANIFEST_PATH}.`]

  let manifest
  try {
    manifest = readJson(manifestFile)
  } catch (error) {
    return [`Cannot parse ${MANIFEST_PATH}: ${error.message}`]
  }
  errors.push(...validateOpenSourceManifest(manifest))

  const packageFile = path.join(root, 'package.json')
  if (fs.existsSync(packageFile)) {
    const packageJson = readJson(packageFile)
    const dependencies = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) }
    const coupled = Object.keys(dependencies).filter(name => /postiz|gitroom/i.test(name))
    add(errors, coupled.length === 0, `Command Center must not depend directly on Postiz packages: ${coupled.join(', ')}`)
  }

  for (const component of manifest.components || []) {
    const noticePath = path.join(root, component.noticeFile || '')
    if (!fs.existsSync(noticePath)) {
      errors.push(`${component.id}: missing notice file ${component.noticeFile}.`)
      continue
    }
    const notice = fs.readFileSync(noticePath, 'utf8')
    for (const required of [component.name, component.sourceRepository, component.licenseSpdx, component.image]) {
      add(errors, notice.includes(required), `${component.id}: ${component.noticeFile} is missing ${required}.`)
    }
  }

  for (const workflow of ['.gitea/workflows/ci.yml', '.github/workflows/ci.yml']) {
    const workflowPath = path.join(root, workflow)
    add(errors, fs.existsSync(workflowPath) && fs.readFileSync(workflowPath, 'utf8').includes('npm run compliance:oss'), `${workflow} must run npm run compliance:oss.`)
  }

  const mutablePostiz = /ghcr\.io\/gitroomhq\/postiz-app:(?!.*@sha256:)[^\s"']+/i
  for (const relative of trackedConfigFiles(root)) {
    if (relative === 'package-lock.json') continue
    const full = path.join(root, relative)
    if (fs.existsSync(full) && mutablePostiz.test(fs.readFileSync(full, 'utf8'))) {
      errors.push(`${relative} contains a mutable Postiz image tag.`)
    }
  }
  return errors
}

export function main(root = DEFAULT_ROOT) {
  const errors = checkRepository(root)
  if (errors.length) {
    console.error('Open-source compliance check failed:')
    for (const error of errors) console.error(`- ${error}`)
    return 1
  }
  console.log('Open-source compliance check passed.')
  return 0
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) process.exitCode = main()
