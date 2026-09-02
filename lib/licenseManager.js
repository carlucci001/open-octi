import crypto from 'crypto'
import { readData, writeData } from '@/lib/dataStore'
import { getProductCatalog } from '@/lib/productCatalog'

const LICENSE_FILE = 'license-records.json'

function cleanString(value, fallback = '', limit = 1000) {
  return String(value ?? fallback).trim().slice(0, limit)
}

function cleanId(value, fallback = '') {
  return String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100)
}

export function generateLicenseKey(productId = 'product') {
  const prefix = cleanId(productId, 'fcc').slice(0, 10).toUpperCase()
  const token = crypto.randomBytes(18).toString('base64url').toUpperCase()
  return `${prefix}-${token.match(/.{1,6}/g).join('-')}`
}

function keyFingerprint(licenseKey) {
  return crypto.createHash('sha256').update(String(licenseKey || '').trim()).digest('hex')
}

export function normalizeLicense(record = {}, index = 0) {
  const productId = cleanId(record.productId, 'farrington-command-center')
  const licenseKey = cleanString(record.licenseKey, '', 160) || generateLicenseKey(productId)
  return {
    id: cleanId(record.id, `lic-${Date.now().toString(36)}-${index + 1}`),
    licenseKey,
    keyFingerprint: keyFingerprint(licenseKey),
    status: ['active', 'pending', 'suspended', 'expired', 'revoked'].includes(record.status) ? record.status : 'active',
    productId,
    packageId: cleanId(record.packageId, ''),
    licenseTemplateId: cleanId(record.licenseTemplateId, 'source-commercial'),
    supportPlanId: cleanId(record.supportPlanId, ''),
    customerName: cleanString(record.customerName, '', 160),
    company: cleanString(record.company, '', 180),
    email: cleanString(record.email, '', 180).toLowerCase(),
    licenseType: cleanString(record.licenseType, 'commercial-source', 100),
    usageType: ['single-use', 'multi-user', 'site', 'enterprise', 'developer', 'internal'].includes(record.usageType) ? record.usageType : 'single-use',
    deploymentModel: ['on-premise', 'off-premise', 'private-cloud', 'managed-cloud', 'hybrid', 'local-only'].includes(record.deploymentModel) ? record.deploymentModel : 'on-premise',
    sourceAccess: cleanString(record.sourceAccess, 'included', 100),
    seats: Math.max(1, Number(record.seats || 1) || 1),
    maxUsers: Math.max(1, Number(record.maxUsers || record.seats || 1) || 1),
    maxInstances: Math.max(1, Number(record.maxInstances || 1) || 1),
    maxTenants: Math.max(1, Number(record.maxTenants || 1) || 1),
    allowedDomains: Array.isArray(record.allowedDomains) ? record.allowedDomains.map(v => cleanString(v, '', 180)).filter(Boolean).slice(0, 50) : [],
    allowedEnvironments: Array.isArray(record.allowedEnvironments) ? record.allowedEnvironments.map(v => cleanString(v, '', 80)).filter(Boolean).slice(0, 20) : ['production'],
    allowedIps: Array.isArray(record.allowedIps) ? record.allowedIps.map(v => cleanString(v, '', 80)).filter(Boolean).slice(0, 50) : [],
    allowedHardwareIds: Array.isArray(record.allowedHardwareIds) ? record.allowedHardwareIds.map(v => cleanString(v, '', 160)).filter(Boolean).slice(0, 50) : [],
    enabledAddons: Array.isArray(record.enabledAddons) ? record.enabledAddons.map(v => cleanId(v)).filter(Boolean).slice(0, 100) : [],
    disabledFeatures: Array.isArray(record.disabledFeatures) ? record.disabledFeatures.map(v => cleanId(v)).filter(Boolean).slice(0, 100) : [],
    entitlements: record.entitlements && typeof record.entitlements === 'object' && !Array.isArray(record.entitlements) ? record.entitlements : {},
    meteredLimits: record.meteredLimits && typeof record.meteredLimits === 'object' && !Array.isArray(record.meteredLimits) ? record.meteredLimits : {},
    currentVersion: cleanString(record.currentVersion, '', 60),
    maxVersion: cleanString(record.maxVersion, '', 60),
    versionChannel: cleanString(record.versionChannel, 'stable', 60),
    repoAccess: cleanString(record.repoAccess, 'private-delivery', 120),
    repoUrl: cleanString(record.repoUrl, '', 260),
    issuedAt: cleanString(record.issuedAt, new Date().toISOString(), 80),
    expiresAt: cleanString(record.expiresAt, '', 80),
    supportStartsAt: cleanString(record.supportStartsAt, '', 80),
    supportEndsAt: cleanString(record.supportEndsAt, '', 80),
    supportStatus: ['active', 'pending', 'expired', 'none'].includes(record.supportStatus) ? record.supportStatus : 'pending',
    notes: cleanString(record.notes, '', 2000),
    updatedAt: cleanString(record.updatedAt, new Date().toISOString(), 80),
  }
}

export function getLicenseStore() {
  const data = readData(LICENSE_FILE) || { licenses: [] }
  return {
    updatedAt: data.updatedAt || null,
    licenses: Array.isArray(data.licenses) ? data.licenses.map(normalizeLicense) : [],
  }
}

export function saveLicenseStore(store) {
  const normalized = {
    updatedAt: new Date().toISOString(),
    licenses: Array.isArray(store.licenses) ? store.licenses.map(normalizeLicense) : [],
  }
  writeData(LICENSE_FILE, normalized)
  return normalized
}

export function upsertLicense(record) {
  const store = getLicenseStore()
  const normalized = normalizeLicense({ ...record, updatedAt: new Date().toISOString() })
  const idx = store.licenses.findIndex(item => item.id === normalized.id)
  if (idx >= 0) store.licenses[idx] = normalized
  else store.licenses.unshift(normalized)
  return saveLicenseStore(store)
}

export function deleteLicense(id) {
  const store = getLicenseStore()
  return saveLicenseStore({ licenses: store.licenses.filter(item => item.id !== id) })
}

function isDateExpired(value) {
  if (!value) return false
  const time = new Date(value).getTime()
  return Number.isFinite(time) && time < Date.now()
}

function findProduct(productId) {
  return getProductCatalog().products.find(p => p.id === productId || p.slug === productId)
}

export function verifyLicense({ licenseKey, productId, domain, version } = {}) {
  const fingerprint = keyFingerprint(licenseKey)
  const license = getLicenseStore().licenses.find(item => item.keyFingerprint === fingerprint || item.licenseKey === licenseKey)
  if (!license) return { valid: false, status: 'not_found', reason: 'License key not found' }
  if (productId && license.productId !== productId) return { valid: false, status: 'product_mismatch', reason: 'License is not for this product' }
  if (license.status !== 'active') return { valid: false, status: license.status, reason: `License is ${license.status}` }
  if (isDateExpired(license.expiresAt)) return { valid: false, status: 'expired', reason: 'License expired' }
  if (domain && license.allowedDomains.length && !license.allowedDomains.includes(domain)) {
    return { valid: false, status: 'domain_mismatch', reason: 'Domain is not licensed' }
  }

  const product = findProduct(license.productId)
  const supportExpired = isDateExpired(license.supportEndsAt)
  return {
    valid: true,
    status: 'active',
    productId: license.productId,
    productName: product?.name || license.productId,
    packageId: license.packageId,
    licensedTo: license.company || license.customerName,
    licenseType: license.licenseType,
    usageType: license.usageType,
    deploymentModel: license.deploymentModel,
    sourceAccess: license.sourceAccess,
    seats: license.seats,
    maxUsers: license.maxUsers,
    maxInstances: license.maxInstances,
    maxTenants: license.maxTenants,
    currentVersion: license.currentVersion || product?.versionPolicy?.currentVersion || '',
    maxVersion: license.maxVersion,
    requestedVersion: cleanString(version, '', 60),
    versionChannel: license.versionChannel,
    support: {
      status: supportExpired ? 'expired' : license.supportStatus,
      planId: license.supportPlanId,
      startsAt: license.supportStartsAt,
      endsAt: license.supportEndsAt,
    },
    entitlements: {
      allowedDomains: license.allowedDomains,
      allowedEnvironments: license.allowedEnvironments,
      allowedIps: license.allowedIps,
      allowedHardwareIds: license.allowedHardwareIds,
      enabledAddons: license.enabledAddons,
      disabledFeatures: license.disabledFeatures,
      meteredLimits: license.meteredLimits,
      custom: license.entitlements,
      repoAccess: license.repoAccess,
      updateEntitlement: product?.versionPolicy?.updateEntitlement || '',
    },
  }
}

export function publicLicense(record) {
  const { keyFingerprint: _fingerprint, ...safe } = record
  return safe
}
