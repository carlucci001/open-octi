'use client'

import ThemedSelect from '../components/ThemedSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, Check, Cloud, Coins, Copy, Edit3, FileText, Layers3, PackageCheck, PackagePlus, Plus, RefreshCw, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import { Paginator, usePagination } from '../components/Paginator'
import ProductOrdersInbox from './ProductOrdersInbox'
import CreditGrantManager from './CreditGrantManager'
import StripeCatalogSyncPanel from './StripeCatalogSyncPanel'
import SubscriptionPlanManager from './SubscriptionPlanManager'
import { brandAssetsFor } from '@/lib/brand-assets'

const FIELD = {
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  width: '100%',
  minHeight: 44,
  fontSize: 14,
}

const DEFAULT_PRODUCT_COVER = '/product-covers/command-center-cover.png'
const DEFAULT_PRODUCT_LOGO = brandAssetsFor().productLogo

const BLANK_PRODUCT = {
  id: '',
  slug: '',
  status: 'draft',
  featured: false,
  category: 'Private AI Operations',
  name: '',
  shortName: '',
  eyebrow: 'Product',
  coverImage: DEFAULT_PRODUCT_COVER,
  productLogo: '',
  accentColor: '#3b82f6',
  headline: '',
  summary: '',
  suiteCopy: '',
  checkoutEndpoint: '/api/stripe/command-center-checkout',
  defaultPackageId: '',
  packages: [],
  modules: [],
  addOns: [],
  paymentOptions: [],
  licenseTemplates: [],
  supportPlans: [],
  versionPolicy: {
    currentVersion: '1.0.0',
    channel: 'stable',
    updateEntitlement: 'Updates included during the active support term or private maintenance agreement.',
    breakingChangePolicy: 'Major upgrades require review before deployment.',
    sourceDelivery: 'Repository or archive delivery after license and payment conditions are satisfied.',
  },
  versionHistory: [
    { version: '1.0.0', label: 'Version 1', date: new Date().toISOString().slice(0, 10), notes: 'Initial product catalog release.' },
  ],
}

const STARTER_PACKAGE = {
  id: 'standard',
  name: 'Standard',
  short: 'Standard',
  packageCategory: 'managed',
  pricingModel: 'setup-deposit',
  billingInterval: 'month',
  monthlyFee: 0,
  setupPrice: 0,
  setupPriceHigh: 0,
  retainer: 0,
  stripePriceId: '',
  stripeMonthlyPriceId: '',
  stripeSetupPriceId: '',
  quoteRequired: false,
  label: 'Base offer',
  copy: 'Define the product offer, delivery scope, and starting price.',
  modules: ['product-foundation'],
}

const STARTER_MODULE = {
  id: 'product-foundation',
  name: 'Product Foundation',
  copy: 'The primary capability included with this product.',
}

const BLANK_LICENSE = {
  id: '',
  licenseKey: '',
  status: 'active',
  productId: 'farrington-command-center',
  packageId: 'core',
  licenseTemplateId: 'source-commercial',
  supportPlanId: 'implementation-support',
  customerName: '',
  company: '',
  email: '',
  licenseType: 'commercial-source',
  usageType: 'single-use',
  deploymentModel: 'on-premise',
  sourceAccess: 'included',
  seats: 1,
  maxUsers: 1,
  maxInstances: 1,
  maxTenants: 1,
  allowedDomains: [],
  allowedEnvironments: ['production'],
  allowedIps: [],
  allowedHardwareIds: [],
  enabledAddons: [],
  disabledFeatures: [],
  entitlements: {},
  meteredLimits: {},
  currentVersion: '',
  maxVersion: '',
  versionChannel: 'stable',
  repoAccess: 'private-delivery',
  repoUrl: '',
  issuedAt: '',
  expiresAt: '',
  supportStartsAt: '',
  supportEndsAt: '',
  supportStatus: 'pending',
  notes: '',
}

const USAGE_TYPE_HELP = {
  'single-use': 'One customer, one primary business use.',
  'multi-user': 'Multiple named users inside one customer organization.',
  site: 'One organization or location/site with broader internal use.',
  enterprise: 'Broad internal enterprise use with negotiated limits and support terms.',
  developer: 'Developer/evaluation use, usually not production.',
  internal: 'Internal-only use for Farrington, demos, or private testing.',
}

const DEPLOYMENT_HELP = {
  'on-premise': 'Installed in the customer environment.',
  'off-premise': 'Operated outside the customer environment by a provider or third party.',
  'private-cloud': 'Customer-controlled cloud/VPC deployment.',
  'managed-cloud': 'Farrington or a provider hosts and operates the system.',
  hybrid: 'Parts run locally/private; parts run managed or hosted.',
  'local-only': 'Runs only on a local machine or local network.',
}

const STATUS_HELP = {
  active: 'Live and valid.',
  pending: 'Prepared but not fully active yet.',
  suspended: 'Temporarily disabled.',
  expired: 'Past license or support term.',
  revoked: 'Terminated.',
}

const SUPPORT_STATUS_HELP = {
  active: 'Support entitlement is live.',
  pending: 'Support is expected but not active yet.',
  expired: 'License may remain valid, but support/update rights have ended.',
  none: 'No support entitlement attached.',
}

const PRODUCT_CATEGORY_OPTIONS = [
  'Private AI Operations',
  'Managed Command Center',
  'Private Install',
  'AI Agent Lease',
  'Custom Build',
  'Support Retainer',
  'Add-on',
]

const PACKAGE_CATEGORY_OPTIONS = [
  { id: 'managed', label: 'Managed plan' },
  { id: 'private-install', label: 'Private install' },
  { id: 'license', label: 'License / platform' },
  { id: 'add-on', label: 'Add-on' },
  { id: 'quote', label: 'Quote-required' },
]

const PRICING_MODEL_OPTIONS = [
  { id: 'one-time', label: 'One-time payment', hint: 'Single Stripe payment for the full amount.' },
  { id: 'setup-deposit', label: 'Setup / deposit', hint: 'Collects setup fee or build deposit now.' },
  { id: 'managed-subscription', label: 'Managed subscription', hint: 'Creates a recurring Stripe subscription for monthly access.' },
  { id: 'setup-plus-subscription', label: 'Setup + subscription', hint: 'Initial setup amount plus recurring monthly access.' },
  { id: 'license', label: 'License / private install', hint: 'Private install or source/license sale, usually deposit first.' },
  { id: 'quote', label: 'Quote required', hint: 'No simple checkout without review.' },
]

const BILLING_INTERVAL_OPTIONS = [
  { id: 'month', label: 'Monthly' },
  { id: 'year', label: 'Annual' },
  { id: 'week', label: 'Weekly' },
  { id: 'day', label: 'Daily' },
]

function productApiBase() {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function money(value) {
  return '$' + Number(value || 0).toLocaleString()
}

function optionLabel(options, id) {
  return options.find(option => option.id === id)?.label || id || 'Not set'
}

function pricingModelHint(id) {
  return PRICING_MODEL_OPTIONS.find(option => option.id === id)?.hint || ''
}

function packagePriceLabel(pkg) {
  const monthlyFee = Number(pkg?.monthlyFee || 0)
  const setupPrice = Number(pkg?.setupPrice || 0)
  const setupPriceHigh = Number(pkg?.setupPriceHigh || setupPrice || 0)
  if (monthlyFee && setupPrice) return `${money(monthlyFee)}/mo + ${money(setupPrice)} setup`
  if (monthlyFee) return `${money(monthlyFee)}/mo`
  if (setupPrice && setupPriceHigh && setupPriceHigh !== setupPrice) return `${money(setupPrice)}-${money(setupPriceHigh)}`
  if (setupPrice) return money(setupPrice)
  return pkg?.quoteRequired || pkg?.pricingModel === 'quote' ? 'Quote' : 'No price'
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function lowestPrice(product) {
  const prices = (product.packages || []).map(p => Number(p.setupPrice || p.monthlyFee || 0)).filter(Boolean)
  return prices.length ? Math.min(...prices) : 0
}

function highestPrice(product) {
  const prices = (product.packages || []).map(p => Number(p.setupPriceHigh || p.setupPrice || p.monthlyFee || 0)).filter(Boolean)
  return prices.length ? Math.max(...prices) : 0
}

function normalizeForSave(draft) {
  const id = slugify(draft.id || draft.name)
  const sourcePackages = Array.isArray(draft.packages) && draft.packages.length ? draft.packages : [STARTER_PACKAGE]
  const packages = sourcePackages.map((pkg, index) => {
    const packageId = slugify(pkg.id || pkg.name || `package-${index + 1}`)
    const setupPrice = Number(pkg.setupPrice || 0) || 0
    const monthlyFee = Number(pkg.monthlyFee || 0) || 0
    return {
      ...pkg,
      id: packageId,
      name: pkg.name || packageId || 'Package',
      short: pkg.short || pkg.name || packageId,
      packageCategory: pkg.packageCategory || (monthlyFee > 0 ? 'managed' : 'private-install'),
      pricingModel: pkg.pricingModel || (monthlyFee > 0 ? 'managed-subscription' : 'setup-deposit'),
      billingInterval: pkg.billingInterval || 'month',
      monthlyFee,
      setupPrice,
      setupPriceHigh: Number(pkg.setupPriceHigh || setupPrice) || 0,
      retainer: Number(pkg.retainer || 0) || 0,
      stripePriceId: pkg.stripePriceId || '',
      stripeMonthlyPriceId: pkg.stripeMonthlyPriceId || '',
      stripeSetupPriceId: pkg.stripeSetupPriceId || '',
      quoteRequired: Boolean(pkg.quoteRequired || pkg.pricingModel === 'quote'),
      modules: Array.isArray(pkg.modules) ? pkg.modules.map(slugify).filter(Boolean) : [],
    }
  })
  const modules = Array.isArray(draft.modules) && draft.modules.length ? draft.modules : [STARTER_MODULE]
  const addOns = Array.isArray(draft.addOns) ? draft.addOns : []
  const versionPolicy = {
    ...(BLANK_PRODUCT.versionPolicy || {}),
    ...(draft.versionPolicy || {}),
    currentVersion: draft.versionPolicy?.currentVersion || '1.0.0',
  }
  const versionHistory = Array.isArray(draft.versionHistory) && draft.versionHistory.length
    ? draft.versionHistory
    : [{ version: versionPolicy.currentVersion, label: 'Version 1', date: today(), notes: 'Initial product catalog release.' }]
  return {
    ...draft,
    id,
    slug: slugify(draft.slug || id),
    shortName: draft.shortName || draft.name,
    coverImage: draft.coverImage || DEFAULT_PRODUCT_COVER,
    productLogo: draft.productLogo || draft.logoImage || draft.logo || '',
    accentColor: draft.accentColor || '#3b82f6',
    defaultPackageId: draft.defaultPackageId || packages[0]?.id || '',
    packages,
    modules,
    addOns,
    versionPolicy,
    versionHistory,
  }
}

function TextInput({ label, value, onChange, textarea = false, rows = 3, placeholder = '', type = 'text', id = '', autoFocus = false }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</span>
      {textarea ? (
        <textarea id={id || undefined} rows={rows} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={FIELD} />
      ) : (
        <input id={id || undefined} autoFocus={autoFocus} type={type} value={value ?? ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={FIELD} />
      )}
    </label>
  )
}

function HelpBox({ children }) {
  if (!children) return null
  return (
    <div className="text-xs leading-relaxed rounded-lg p-3" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
      {children}
    </div>
  )
}

function Pill({ children, tone = 'neutral' }) {
  const styles = {
    neutral: { background: 'var(--surface2)', color: 'var(--text-muted)' },
    green: { background: 'rgba(34,197,94,0.14)', color: 'var(--green)' },
    amber: { background: 'rgba(245,158,11,0.14)', color: 'var(--amber)' },
    blue: { background: 'rgba(59,130,246,0.14)', color: 'var(--accent)' },
    red: { background: 'rgba(220,38,38,0.14)', color: 'var(--red)' },
  }
  return <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold" style={styles[tone]}>{children}</span>
}

function SectionTab({ active, icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
      style={{
        minHeight: 44,
        background: active ? 'var(--accent)' : 'transparent',
        color: active ? 'var(--accent-text)' : 'var(--text-muted)',
        border: 'none',
        cursor: 'pointer',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

function IconButton({ children, onClick, active, disabled, title }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className="inline-flex items-center justify-center rounded-lg"
      style={{
        width: 44,
        height: 44,
        background: active ? 'var(--accent)' : 'var(--surface2)',
        color: active ? 'var(--accent-text)' : 'var(--text)',
        border: '1px solid var(--border)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}>
      {children}
    </button>
  )
}

export default function ProductCatalogManager() {
  const [section, setSection] = useState('catalog')
  const [productSurface, setProductSurface] = useState('catalog')
  const [newDraftOpen, setNewDraftOpen] = useState(false)
  const [catalog, setCatalog] = useState({ products: [] })
  const [licenses, setLicenses] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [licenseDraft, setLicenseDraft] = useState(BLANK_LICENSE)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState('')
  const [view, setView] = useState('list')
  const [subscriptionView, setSubscriptionView] = useState('list')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedProductIds, setSelectedProductIds] = useState(new Set())
  const [bulkDeletingProducts, setBulkDeletingProducts] = useState(false)
  const editorRef = useRef(null)
  const pageSize = 6

  const products = catalog.products || []
  const selected = useMemo(() => products.find(p => p.id === selectedId) || products[0] || null, [products, selectedId])
  const featured = products.find(p => p.featured) || products[0] || null
  const publicBase = productApiBase()

  const categories = useMemo(() => Array.from(new Set(products.map(p => p.category || 'Uncategorized'))).sort(), [products])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return products.filter(product => {
      const haystack = [product.name, product.shortName, product.category, product.status, product.headline, product.summary, product.slug].join(' ').toLowerCase()
      const matchQuery = !q || haystack.includes(q)
      const matchStatus = statusFilter === 'all' || product.status === statusFilter
      const matchCategory = categoryFilter === 'all' || (product.category || 'Uncategorized') === categoryFilter
      return matchQuery && matchStatus && matchCategory
    })
  }, [products, query, statusFilter, categoryFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageProducts = filtered.slice((Math.min(page, totalPages) - 1) * pageSize, Math.min(page, totalPages) * pageSize)
  const pageProductIds = useMemo(() => pageProducts.map(product => product.id), [pageProducts])

  useEffect(() => { load() }, [])
  useEffect(() => {
    try {
      const saved = localStorage.getItem('openocti-hostucts-section')
      if (['licenses', 'orders'].includes(saved)) {
        setSection('catalog')
        setProductSurface(saved)
      } else if (['catalog', 'plans', 'clients', 'credits', 'stripe'].includes(saved)) {
        setSection(saved)
      }
      const savedSurface = localStorage.getItem('openocti-hostucts-surface')
      if (['catalog', 'licenses', 'orders'].includes(savedSurface)) setProductSurface(savedSurface)
    } catch {}
  }, [])
  useEffect(() => {
    const onSection = (event) => {
      const next = typeof event.detail === 'string' ? event.detail : event.detail?.section
      if (['licenses', 'orders', 'catalog'].includes(next)) switchSection(next)
      else if (['plans', 'clients', 'credits', 'stripe'].includes(next)) switchSection(next)
    }
    window.addEventListener('fcc:products-section', onSection)
    return () => window.removeEventListener('fcc:products-section', onSection)
  }, [])
  useEffect(() => { setPage(1) }, [query, statusFilter, categoryFilter, view])
  useEffect(() => { setSelectedProductIds(new Set()) }, [query, statusFilter, categoryFilter, view, page])
  useEffect(() => {
    if (!draft && selected) setDraft(clone(selected))
  }, [selected, draft])

  async function load() {
    setLoading(true)
    try {
      const [data, licenseData] = await Promise.all([
        fetch('/api/products/manage', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/licenses', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ licenses: [] })),
      ])
      const nextCatalog = data.catalog || { products: [] }
      setCatalog(nextCatalog)
      setLicenses(licenseData.licenses || [])
      setSelectedId(nextCatalog.products?.[0]?.id || '')
      setDraft(nextCatalog.products?.[0] ? clone(nextCatalog.products[0]) : null)
      setNewDraftOpen(false)
      setLicenseDraft(prev => ({ ...prev, issuedAt: prev.issuedAt || new Date().toISOString() }))
    } catch (e) {
      flash(e.message || 'Catalog failed to load')
    } finally {
      setLoading(false)
    }
  }

  function flash(message) {
    setToast(message)
    setTimeout(() => setToast(''), 2800)
  }

  function switchSection(next) {
    if (['catalog', 'licenses', 'orders'].includes(next)) {
      setSection('catalog')
      setProductSurface(next)
      try {
        localStorage.setItem('openocti-hostucts-section', 'catalog')
        localStorage.setItem('openocti-hostucts-surface', next)
      } catch {}
      return
    }
    setSection(next)
    try { localStorage.setItem('openocti-hostucts-section', next) } catch {}
  }

  function selectProduct(product) {
    setSelectedId(product.id)
    setDraft(clone(product))
    setNewDraftOpen(false)
    setEditorOpen(true)
  }

  function updateField(key, value) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  function updatePackage(index, key, value) {
    setDraft(prev => {
      const packages = [...(prev.packages || [])]
      const numericKeys = new Set(['monthlyFee', 'setupPrice', 'setupPriceHigh', 'retainer'])
      packages[index] = { ...packages[index], [key]: numericKeys.has(key) ? Number(value) || 0 : value }
      return { ...prev, packages }
    })
  }

  function addPackage() {
    setDraft(prev => ({
      ...prev,
      packages: [...(prev.packages || []), {
        id: `package-${(prev.packages || []).length + 1}`,
        name: 'New Package',
        short: 'New',
        packageCategory: 'managed',
        pricingModel: 'setup-deposit',
        billingInterval: 'month',
        monthlyFee: 0,
        setupPrice: 0,
        setupPriceHigh: 0,
        retainer: 0,
        label: '',
        copy: '',
        modules: [],
        stripePriceId: '',
        stripeMonthlyPriceId: '',
        stripeSetupPriceId: '',
        quoteRequired: false,
      }],
    }))
  }

  function removePackage(index) {
    setDraft(prev => ({ ...prev, packages: (prev.packages || []).filter((_, i) => i !== index) }))
  }

  function updateModule(index, key, value) {
    setDraft(prev => {
      const modules = [...(prev.modules || [])]
      modules[index] = { ...modules[index], [key]: value }
      return { ...prev, modules }
    })
  }

  function addModule() {
    setDraft(prev => ({ ...prev, modules: [...(prev.modules || []), { id: `module-${(prev.modules || []).length + 1}`, name: 'New Module', copy: '' }] }))
  }

  function removeModule(index) {
    setDraft(prev => ({ ...prev, modules: (prev.modules || []).filter((_, i) => i !== index) }))
  }

  function updateAddOn(index, key, value) {
    setDraft(prev => {
      const addOns = [...(prev.addOns || [])]
      addOns[index] = { ...addOns[index], [key]: key === 'price' ? Number(value) || 0 : value }
      return { ...prev, addOns }
    })
  }

  function addAddOn() {
    setDraft(prev => ({ ...prev, addOns: [...(prev.addOns || []), { id: `addon-${(prev.addOns || []).length + 1}`, name: 'New Add-on', price: 0, copy: '' }] }))
  }

  function removeAddOn(index) {
    setDraft(prev => ({ ...prev, addOns: (prev.addOns || []).filter((_, i) => i !== index) }))
  }

  function updateLicenseTemplate(index, key, value) {
    setDraft(prev => {
      const licenseTemplates = [...(prev.licenseTemplates || [])]
      licenseTemplates[index] = { ...licenseTemplates[index], [key]: value }
      return { ...prev, licenseTemplates }
    })
  }

  function addLicenseTemplate() {
    setDraft(prev => ({
      ...prev,
      licenseTemplates: [...(prev.licenseTemplates || []), { id: `license-${(prev.licenseTemplates || []).length + 1}`, name: 'New License', copy: '', sourceAccess: 'included', transfer: 'non-transferable', redistribution: 'prohibited', audit: '' }],
    }))
  }

  function removeLicenseTemplate(index) {
    setDraft(prev => ({ ...prev, licenseTemplates: (prev.licenseTemplates || []).filter((_, i) => i !== index) }))
  }

  function updateSupportPlan(index, key, value) {
    setDraft(prev => {
      const supportPlans = [...(prev.supportPlans || [])]
      supportPlans[index] = { ...supportPlans[index], [key]: key === 'monthlyFee' ? Number(value) || 0 : value }
      return { ...prev, supportPlans }
    })
  }

  function addSupportPlan() {
    setDraft(prev => ({
      ...prev,
      supportPlans: [...(prev.supportPlans || []), { id: `support-${(prev.supportPlans || []).length + 1}`, name: 'New Support Plan', cadence: 'Monthly', responseTime: '', copy: '', monthlyFee: 0 }],
    }))
  }

  function removeSupportPlan(index) {
    setDraft(prev => ({ ...prev, supportPlans: (prev.supportPlans || []).filter((_, i) => i !== index) }))
  }

  function updateVersionPolicy(key, value) {
    setDraft(prev => ({ ...prev, versionPolicy: { ...(prev.versionPolicy || {}), [key]: value } }))
  }

  function updateVersionHistory(index, key, value) {
    setDraft(prev => {
      const versionHistory = [...(prev.versionHistory || [])]
      versionHistory[index] = { ...versionHistory[index], [key]: value }
      return { ...prev, versionHistory }
    })
  }

  function addVersion() {
    setDraft(prev => ({
      ...prev,
      versionHistory: [
        { version: prev.versionPolicy?.currentVersion || '1.0.0', label: `Version ${(prev.versionHistory || []).length + 1}`, date: today(), notes: '' },
        ...(prev.versionHistory || []),
      ],
    }))
  }

  async function saveDraft() {
    if (!draft?.name) return flash('Name is required')
    const product = normalizeForSave(draft)
    setSaving(true)
    try {
      const data = await fetch('/api/products/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', product }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'Save failed')
      setCatalog(data.catalog)
      setSelectedId(product.id)
      setDraft(clone(data.catalog.products.find(p => p.id === product.id) || product))
      setNewDraftOpen(false)
      setEditorOpen(false)
      flash(`Saved ${product.name}`)
    } catch (e) {
      flash(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteProduct(product = draft) {
    if (!product?.id || !confirm(`Delete ${product.name}?`)) return
    setSaving(true)
    try {
      const data = await fetch('/api/products/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', product }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'Delete failed')
      setCatalog(data.catalog)
      setSelectedId(data.catalog.products?.[0]?.id || '')
      setDraft(data.catalog.products?.[0] ? clone(data.catalog.products[0]) : null)
      setEditorOpen(false)
      flash('Product deleted')
    } catch (e) {
      flash(e.message)
    } finally {
      setSaving(false)
    }
  }

  function toggleProductSelected(id, event) {
    event?.stopPropagation?.()
    setSelectedProductIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAllPageProducts() {
    setSelectedProductIds(prev => prev.size === pageProductIds.length ? new Set() : new Set(pageProductIds))
  }

  async function bulkDeleteProducts() {
    const ids = Array.from(selectedProductIds)
    if (!ids.length || !confirm(`Delete ${ids.length} selected product${ids.length === 1 ? '' : 's'}?`)) return
    setBulkDeletingProducts(true)
    try {
      const data = await fetch('/api/products/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', ids }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'Bulk delete failed')
      setCatalog(data.catalog)
      const nextProduct = data.catalog.products?.[0] || null
      setSelectedId(nextProduct?.id || '')
      setDraft(nextProduct ? clone(nextProduct) : null)
      setSelectedProductIds(new Set())
      setEditorOpen(false)
      flash('Products deleted')
    } catch (e) {
      flash(e.message)
    } finally {
      setBulkDeletingProducts(false)
    }
  }

  function startNew() {
    const starterPackage = clone(STARTER_PACKAGE)
    const starterModule = clone(STARTER_MODULE)
    const next = {
      ...clone(BLANK_PRODUCT),
      id: '',
      slug: '',
      name: '',
      shortName: '',
      headline: '',
      summary: 'Describe what the buyer gets, who it is for, and what outcome it creates.',
      defaultPackageId: starterPackage.id,
      packages: [starterPackage],
      modules: [starterModule],
      paymentOptions: [],
      licenseTemplates: [],
      supportPlans: [],
    }
    setSelectedId('')
    setDraft(next)
    setNewDraftOpen(true)
    setEditorOpen(true)
    switchSection('catalog')
    setQuery('')
    setStatusFilter('all')
    flash('New product form opened. Fill the modal and press Create Product.')
    setTimeout(() => document.getElementById('product-name-input')?.focus(), 80)
  }

  function duplicateProduct(product) {
    const copy = {
      ...clone(product),
      id: `${product.id}-copy`,
      slug: `${product.slug || product.id}-copy`,
      name: `${product.name} Copy`,
      status: 'draft',
      featured: false,
    }
    setSelectedId('')
    setDraft(copy)
    setNewDraftOpen(true)
    setEditorOpen(true)
    switchSection('catalog')
    flash('Copy opened in the product modal. Press Create Product when ready.')
  }

  function startNewLicense() {
    const product = draft || products[0] || {}
    setLicenseDraft({
      ...BLANK_LICENSE,
      productId: product.id || 'farrington-command-center',
      packageId: product.defaultPackageId || product.packages?.[0]?.id || '',
      licenseTemplateId: product.licenseTemplates?.[0]?.id || 'source-commercial',
      supportPlanId: product.supportPlans?.[0]?.id || '',
      currentVersion: product.versionPolicy?.currentVersion || '',
      maxVersion: product.versionPolicy?.currentVersion || '',
      versionChannel: product.versionPolicy?.channel || 'stable',
      issuedAt: new Date().toISOString(),
    })
    switchSection('licenses')
  }

  async function saveLicense() {
    if (!licenseDraft.company && !licenseDraft.customerName) return flash('Customer or company is required')
    setSaving(true)
    try {
      const data = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license: licenseDraft }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'License save failed')
      setLicenses(data.licenses || [])
      setLicenseDraft(BLANK_LICENSE)
      flash('License saved')
    } catch (e) {
      flash(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteLicense(id) {
    if (!id || !confirm('Delete this license record?')) return
    setSaving(true)
    try {
      const data = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'License delete failed')
      await load()
      flash('License deleted')
    } catch (e) {
      flash(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function bulkDeleteLicenses(ids) {
    if (!ids.length || !confirm(`Delete ${ids.length} selected license${ids.length === 1 ? '' : 's'}?`)) return false
    setSaving(true)
    try {
      const data = await fetch('/api/licenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', ids }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'License delete failed')
      setLicenses(data.licenses || [])
      flash('Licenses deleted')
      return true
    } catch (e) {
      flash(e.message)
      return false
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="command-workspace p-4 sm:p-6">
      {toast && (
        <button onClick={() => setToast('')} className="fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-semibold text-left"
          style={{ background: 'var(--green)', color: 'white', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}>
          {toast}
        </button>
      )}
      <PageHeader
        icon={<Box size={22} />}
        title="Products & Billing"
        subtitle="Products, subscription plans, client billing, credits, and controlled Stripe synchronization"
        viewToggle={
          section === 'catalog'
            ? <ViewModeToggle value={view === 'cards' ? 'card' : 'list'} onChange={mode => setView(mode === 'card' ? 'cards' : 'list')} modes={['list', 'card']} />
            : ['plans', 'clients'].includes(section)
              ? <ViewModeToggle value={subscriptionView === 'grid' ? 'card' : 'list'} onChange={mode => setSubscriptionView(mode === 'card' ? 'grid' : 'list')} modes={['list', 'card']} />
              : null
        }
      />

      <div className="command-toolbar mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <SectionTab active={section === 'catalog'} icon={<Layers3 size={15} />} label="Products & Services" onClick={() => switchSection('catalog')} />
          <SectionTab active={section === 'plans'} icon={<FileText size={15} />} label="Subscription Plans" onClick={() => switchSection('plans')} />
          <SectionTab active={section === 'clients'} icon={<ShieldCheck size={15} />} label="Client Subscriptions" onClick={() => switchSection('clients')} />
          <SectionTab active={section === 'credits'} icon={<Coins size={15} />} label="Credits & Billing" onClick={() => switchSection('credits')} />
          <SectionTab active={section === 'stripe'} icon={<Cloud size={15} />} label="Stripe Sync" onClick={() => switchSection('stripe')} />
        </div>
      </div>

      {section === 'catalog' && (
        <div className="command-toolbar mb-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <SectionTab active={productSurface === 'catalog'} icon={<Layers3 size={14} />} label="Catalog" onClick={() => switchSection('catalog')} />
            <SectionTab active={productSurface === 'licenses'} icon={<ShieldCheck size={14} />} label="Licenses" onClick={() => switchSection('licenses')} />
            <SectionTab active={productSurface === 'orders'} icon={<PackageCheck size={14} />} label="Orders" onClick={() => switchSection('orders')} />
          </div>
          {productSurface === 'catalog' && (
            <button onClick={startNew} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', minHeight: 44 }}>
              <PackagePlus size={15} /> New Product
            </button>
          )}
          {productSurface === 'licenses' && (
            <button onClick={startNewLicense} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', minHeight: 44 }}>
              <FileText size={15} /> Issue License
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl p-6" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Loading product catalog...</div>
      ) : section === 'catalog' && productSurface === 'licenses' ? (
        <LicenseSection
          products={products}
          licenses={licenses}
          draft={licenseDraft}
          setDraft={setLicenseDraft}
          onSave={saveLicense}
          onDelete={deleteLicense}
          onBulkDelete={bulkDeleteLicenses}
          onEdit={license => setLicenseDraft(clone(license))}
          saving={saving}
        />
      ) : section === 'catalog' && productSurface === 'orders' ? (
        <ProductOrdersInbox onToast={flash} />
      ) : section === 'plans' ? (
        <SubscriptionPlanManager view={subscriptionView} onViewChange={setSubscriptionView} onToast={flash} onStripeReview={() => switchSection('stripe')} />
      ) : section === 'clients' ? (
        <StripeCatalogSyncPanel mode="clients" view={subscriptionView} onViewChange={setSubscriptionView} onToast={flash} />
      ) : section === 'credits' ? (
        <div className="grid gap-5">
          <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <h2 className="text-lg font-bold">Credits & billing</h2>
            <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>
              Review client wallet balances and issue non-expiring service credits. Monthly plan allowances are managed under Subscription Plans and remain tied to verified paid Stripe periods.
            </p>
          </section>
          <CreditGrantManager onToast={flash} />
        </div>
      ) : section === 'stripe' ? (
        <StripeCatalogSyncPanel mode="sync" onToast={flash} />
      ) : (
        <div className="grid gap-5">
          <main className="grid gap-5">
            {featured && <CatalogHero product={featured} total={products.length} licenses={licenses.length} />}

            <div className="command-stat-grid grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard label="Products" value={products.length} detail={`${products.filter(p => p.status === 'published').length} published`} />
              <MetricCard label="Packages" value={products.reduce((sum, p) => sum + (p.packages || []).length, 0)} detail="Sellable price points" />
              <MetricCard label="Licenses" value={licenses.length} detail="Issued records" />
              <MetricCard label="Version" value="v1" detail="Catalog foundation done" />
            </div>

            <section className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_180px_220px_auto] gap-3 items-end">
                <label>
                  <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Search</span>
                  <div className="relative">
                    <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--text-muted)' }} />
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search products, modules, versions..."
                      style={{ ...FIELD, paddingLeft: 36 }} />
                  </div>
                </label>
                <label>
                  <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Status</span>
                  <ThemedSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={FIELD}>
                    <option value="all">All statuses</option>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </ThemedSelect>
                </label>
                <label>
                  <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Category</span>
                  <ThemedSelect value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} style={FIELD}>
                    <option value="all">All categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </ThemedSelect>
                </label>
                <div className="flex gap-2">
                  <IconButton onClick={load} title="Refresh"><RefreshCw size={17} /></IconButton>
                </div>
              </div>
            </section>

            {filtered.length === 0 ? (
              <section className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No matching products</div>
                <div className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Clear the filters or create a new product offer.</div>
                <button onClick={startNew} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 font-semibold"
                  style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}><Plus size={16} /> New Product</button>
              </section>
            ) : view === 'cards' ? (
              <>
                <BulkProductToolbar selected={selectedProductIds} total={pageProductIds.length} onSelectAll={toggleAllPageProducts} onClear={() => setSelectedProductIds(new Set())} onDelete={bulkDeleteProducts} deleting={bulkDeletingProducts} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {pageProducts.map(product => (
                    <ProductCard key={product.id} product={product} selected={draft?.id === product.id} bulkSelected={selectedProductIds.has(product.id)} onToggleBulk={e => toggleProductSelected(product.id, e)} onEdit={() => selectProduct(product)} onClone={() => duplicateProduct(product)} onDelete={() => deleteProduct(product)} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <BulkProductToolbar selected={selectedProductIds} total={pageProductIds.length} onSelectAll={toggleAllPageProducts} onClear={() => setSelectedProductIds(new Set())} onDelete={bulkDeleteProducts} deleting={bulkDeletingProducts} />
                <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {pageProducts.map(product => (
                    <ProductListRow key={product.id} product={product} selected={draft?.id === product.id} bulkSelected={selectedProductIds.has(product.id)} onToggleBulk={e => toggleProductSelected(product.id, e)} onEdit={() => selectProduct(product)} onClone={() => duplicateProduct(product)} onDelete={() => deleteProduct(product)} />
                  ))}
                </section>
              </>
            )}

            <Pagination page={Math.min(page, totalPages)} totalPages={totalPages} total={filtered.length} pageSize={pageSize} onPage={setPage} />
          </main>
        </div>
      )}

      {editorOpen && draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5" style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(5px)' }} onClick={() => setEditorOpen(false)}>
          <div className="w-full max-w-6xl max-h-[calc(100vh-24px)] overflow-hidden" onClick={e => e.stopPropagation()}>
          <ProductEditor
            draft={draft}
            editorRef={editorRef}
            newDraftOpen={newDraftOpen}
            setDraft={setDraft}
            updateField={updateField}
            updatePackage={updatePackage}
            addPackage={addPackage}
            removePackage={removePackage}
            updateModule={updateModule}
            addModule={addModule}
            removeModule={removeModule}
            updateAddOn={updateAddOn}
            addAddOn={addAddOn}
            removeAddOn={removeAddOn}
            updateLicenseTemplate={updateLicenseTemplate}
            addLicenseTemplate={addLicenseTemplate}
            removeLicenseTemplate={removeLicenseTemplate}
            updateSupportPlan={updateSupportPlan}
            addSupportPlan={addSupportPlan}
            removeSupportPlan={removeSupportPlan}
            updateVersionPolicy={updateVersionPolicy}
            updateVersionHistory={updateVersionHistory}
            addVersion={addVersion}
            saveDraft={saveDraft}
            deleteProduct={deleteProduct}
            saving={saving}
            publicBase={publicBase}
            onClose={() => setEditorOpen(false)}
          />
          </div>
        </div>
      )}
    </div>
  )
}

function CatalogHero({ product, total, licenses }) {
  return (
    <section className="overflow-hidden rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap gap-2 mb-4">
            <Pill tone="blue">{product.eyebrow || 'Flagship Product'}</Pill>
            <Pill tone={product.status === 'published' ? 'green' : 'amber'}>{product.status}</Pill>
            <Pill tone="neutral">{product.versionPolicy?.currentVersion || '1.0.0'}</Pill>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>{product.name}</h2>
          <p className="text-sm sm:text-base leading-relaxed max-w-3xl" style={{ color: 'var(--text-muted)' }}>{product.summary || product.headline}</p>
          <div className="grid grid-cols-3 gap-3 mt-5 max-w-xl">
            <MiniStat label="Catalog" value={total} />
            <MiniStat label="Packages" value={(product.packages || []).length} />
            <MiniStat label="Licenses" value={licenses} />
          </div>
        </div>
        <ProductMedia product={product} height={220} alt={`${product.name} cover`} style={{ minHeight: 220 }} />
      </div>
    </section>
  )
}

function MetricCard({ label, value, detail }) {
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: 'var(--text)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{detail}</div>
    </div>
  )
}

function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  )
}

function ProductMedia({ product, height = 150, compact = false, alt = '', style = {} }) {
  const cover = product?.coverImage || DEFAULT_PRODUCT_COVER
  const logo = product?.productLogo || product?.logoImage || product?.logo || ''
  const logoSize = compact ? 34 : 58
  return (
    <div className="relative overflow-hidden" style={{ height, background: '#07111f', ...style }}>
      <img src={cover} alt={alt} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      {logo && (
        <div className="absolute left-2 bottom-2 flex items-center justify-center" style={{
          width: logoSize,
          height: logoSize,
          borderRadius: compact ? 8 : 12,
          background: 'color-mix(in srgb, var(--surface) 88%, transparent)',
          border: '1px solid var(--border)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.32)',
          padding: compact ? 5 : 7,
        }}>
          <img src={logo} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', display: 'block' }} />
        </div>
      )}
    </div>
  )
}

function BulkProductToolbar({ selected, total, onSelectAll, onClear, onDelete, deleting }) {
  if (!total) return null
  return (
    <section className="rounded-xl p-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
        <input type="checkbox" checked={selected.size === total && total > 0} onChange={onSelectAll} style={{ width: 20, height: 20 }} />
        {selected.size === 0 ? 'Select all' : `${selected.size} selected`}
      </label>
      {selected.size > 0 && (
        <>
          <button type="button" onClick={onClear} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
          <button type="button" onClick={onDelete} disabled={deleting} className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: deleting ? 0.6 : 1 }}>
            <Trash2 size={15} /> {deleting ? 'Deleting...' : `Delete ${selected.size}`}
          </button>
        </>
      )}
    </section>
  )
}

function ProductCard({ product, selected, bulkSelected, onToggleBulk, onEdit, onClone, onDelete }) {
  const accent = product.accentColor || '#3b82f6'
  return (
    <article onClick={onEdit} className="rounded-xl overflow-hidden cursor-pointer" style={{ background: bulkSelected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${bulkSelected ? 'var(--accent)' : selected ? accent : 'var(--border)'}` }}>
      <ProductMedia product={product} height={150} />
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <input type="checkbox" aria-label={`Select ${product.name}`} checked={bulkSelected} onClick={e => e.stopPropagation()} onChange={onToggleBulk} style={{ width: 20, height: 20, flexShrink: 0, marginTop: 2 }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
              <Pill tone={product.status === 'published' ? 'green' : product.status === 'archived' ? 'red' : 'amber'}>{product.status}</Pill>
              <Pill tone="neutral">{product.versionPolicy?.currentVersion || '1.0.0'}</Pill>
            </div>
            <h3 className="font-bold text-lg truncate" style={{ color: 'var(--text)' }}>{product.name}</h3>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{product.category} / {product.slug}</div>
          </div>
          {product.featured && <Pill tone="blue">Featured</Pill>}
        </div>
        <p className="text-sm leading-relaxed mt-3 line-clamp-3" style={{ color: 'var(--text-muted)' }}>{product.summary || product.headline || 'No summary yet.'}</p>
        <div className="grid grid-cols-3 gap-2 mt-4">
          <MiniStat label="Packages" value={(product.packages || []).length} />
          <MiniStat label="Modules" value={(product.modules || []).length} />
          <MiniStat label="From" value={lowestPrice(product) ? money(lowestPrice(product)) : '$0'} />
        </div>
        <PackageSummary packages={product.packages || []} />
        <div className="flex gap-2 mt-4">
          <button onClick={onEdit} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold flex-1" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}><Edit3 size={14} /> Edit</button>
          <IconButton onClick={e => { e.stopPropagation(); onClone() }} title="Clone"><Copy size={15} /></IconButton>
          <IconButton onClick={e => { e.stopPropagation(); onDelete() }} title="Delete"><Trash2 size={15} /></IconButton>
        </div>
      </div>
    </article>
  )
}

function ProductListRow({ product, selected, bulkSelected, onToggleBulk, onEdit, onClone, onDelete }) {
  const packagePreview = (product.packages || []).slice(0, 3).map(pkg => `${pkg.name || pkg.id}: ${packagePriceLabel(pkg)}`).join(' | ')
  return (
    <div onClick={onEdit} className="grid grid-cols-1 xl:grid-cols-[28px_96px_minmax(0,1fr)_170px_170px_150px] gap-3 p-3 items-center cursor-pointer" style={{ borderBottom: '1px solid var(--border)', background: bulkSelected || selected ? 'var(--accent-soft)' : 'transparent' }}>
      <input type="checkbox" aria-label={`Select ${product.name}`} checked={bulkSelected} onClick={e => e.stopPropagation()} onChange={onToggleBulk} style={{ width: 20, height: 20 }} />
      <ProductMedia product={product} compact height={58} style={{ width: 96, borderRadius: 8, border: '1px solid var(--border)' }} />
      <div className="min-w-0">
        <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{product.name}</div>
        <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{product.category} / {product.slug}</div>
        {packagePreview && <div className="text-xs truncate mt-1" style={{ color: 'var(--accent)' }}>{packagePreview}</div>}
      </div>
      <div className="flex gap-2"><Pill tone={product.status === 'published' ? 'green' : 'amber'}>{product.status}</Pill><Pill>{product.versionPolicy?.currentVersion || '1.0.0'}</Pill></div>
      <div className="text-sm" style={{ color: 'var(--text)' }}>{lowestPrice(product) ? `${money(lowestPrice(product))}-${money(highestPrice(product))}` : 'No price'}</div>
      <div className="flex gap-2 xl:justify-end">
        <IconButton onClick={onEdit} title="Edit"><Edit3 size={15} /></IconButton>
        <IconButton onClick={e => { e.stopPropagation(); onClone() }} title="Clone"><Copy size={15} /></IconButton>
        <IconButton onClick={e => { e.stopPropagation(); onDelete() }} title="Delete"><Trash2 size={15} /></IconButton>
      </div>
    </div>
  )
}

function PackageSummary({ packages }) {
  if (!packages.length) return null
  const visible = packages.slice(0, 4)
  const remaining = packages.length - visible.length
  return (
    <div className="mt-4 grid gap-2">
      {visible.map(pkg => (
        <div key={pkg.id || pkg.name} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 items-start text-xs" style={{ color: 'var(--text-muted)' }}>
          <div className="min-w-0">
            <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{pkg.name || pkg.id}</div>
            <div className="truncate">{optionLabel(PACKAGE_CATEGORY_OPTIONS, pkg.packageCategory)} | {optionLabel(PRICING_MODEL_OPTIONS, pkg.pricingModel)}</div>
          </div>
          <div className="font-semibold text-right" style={{ color: 'var(--accent)' }}>{packagePriceLabel(pkg)}</div>
        </div>
      ))}
      {remaining > 0 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>+{remaining} more packages in editor</div>}
    </div>
  )
}

function ProductMediaUploadField({ draft, field, label, kind, updateField, placeholder }) {
  const inputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const value = draft?.[field] || ''

  const handleFile = async (file) => {
    if (!file) return
    setUploading(true)
    setMessage('')
    try {
      const productKey = slugify(draft?.slug || draft?.id || draft?.name || 'product')
      const form = new FormData()
      form.append('file', file)
      form.append('title', `${draft?.shortName || draft?.name || 'Product'} ${kind}`)
      form.append('folder', `products:${productKey}`)
      form.append('tags', `product,${kind}`)
      const response = await fetch('/api/media', { method: 'POST', body: form })
      const json = await response.json().catch(() => ({}))
      if (!response.ok || !json.ok) throw new Error(json.error || `Upload failed (${response.status})`)
      const uploadedUrl = json.item?.url || (json.item?.file ? `/media/${json.item.file}` : '')
      if (!uploadedUrl) throw new Error('Upload finished but no image URL was returned.')
      updateField(field, uploadedUrl)
      setMessage('Uploaded')
    } catch (error) {
      setMessage(error.message || 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="grid gap-2">
      <TextInput label={label} value={value} onChange={v => updateField(field, v)} placeholder={placeholder} />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: uploading ? 0.65 : 1 }}>
          <PackagePlus size={15} /> {uploading ? 'Uploading...' : `Replace ${kind}`}
        </button>
        {field === 'productLogo' && value && (
          <button type="button" onClick={() => updateField(field, '')} className="rounded-lg px-3 py-2 text-sm"
            style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Clear logo
          </button>
        )}
        {message && <span className="text-xs" style={{ color: message === 'Uploaded' ? 'var(--green)' : 'var(--red)' }}>{message}</span>}
      </div>
    </div>
  )
}

function Pagination({ page, totalPages, total, pageSize, onPage }) {
  const start = total === 0 ? 0 : ((page - 1) * pageSize) + 1
  const end = Math.min(total, page * pageSize)
  return (
    <div className="rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Showing {start}-{end} of {total}</div>
      <div className="flex gap-2">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: page <= 1 ? 0.5 : 1 }}>Previous</button>
        <span className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ color: 'var(--text-muted)' }}>Page {page} / {totalPages}</span>
        <button onClick={() => onPage(Math.min(totalPages, page + 1))} disabled={page >= totalPages} className="rounded-lg px-3 py-2 text-sm font-semibold"
          style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', opacity: page >= totalPages ? 0.5 : 1 }}>Next</button>
      </div>
    </div>
  )
}

function ProductEditor({
  editorRef,
  newDraftOpen = false,
  draft, updateField, updatePackage, addPackage, removePackage,
  updateModule, addModule, removeModule,
  updateAddOn, addAddOn, removeAddOn,
  updateLicenseTemplate, addLicenseTemplate, removeLicenseTemplate,
  updateSupportPlan, addSupportPlan, removeSupportPlan,
  updateVersionPolicy, updateVersionHistory, addVersion,
  saveDraft, deleteProduct, saving, publicBase, onClose,
}) {
  if (!draft) {
    return (
      <aside className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="font-semibold" style={{ color: 'var(--text)' }}>No product selected</div>
      </aside>
    )
  }
  const isNew = !draft.id
  const categoryOptions = Array.from(new Set([draft.category, ...PRODUCT_CATEGORY_OPTIONS].filter(Boolean)))
  return (
    <aside id="product-builder" ref={editorRef} className="rounded-xl p-4 max-h-[calc(100vh-24px)] overflow-auto" style={{ background: 'var(--surface)', border: isNew ? '2px solid var(--accent)' : '1px solid var(--border)', boxShadow: isNew ? '0 0 0 4px rgba(59,130,246,0.12)' : '0 18px 60px rgba(0,0,0,0.35)' }}>
      {isNew && newDraftOpen && (
        <div className="rounded-lg p-3 mb-4" style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.35)', color: 'var(--text)' }}>
          <div className="font-semibold text-sm">New product form</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>This product is not saved yet. Add a name and package price, then press Create Product.</div>
        </div>
      )}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <div className="text-xs uppercase" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Product Builder</div>
          <h3 className="font-bold text-lg" style={{ color: 'var(--text)' }}>{draft.name || 'New Product'}</h3>
          {isNew && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>New product draft. Name it, price its Standard offer, then create it.</div>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={saveDraft} disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
            style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: saving ? 0.65 : 1 }}>
            <Save size={15} /> {saving ? 'Saving' : isNew ? 'Create' : 'Save'}
          </button>
          <button type="button" onClick={onClose} aria-label="Close product editor" title="Close" className="inline-flex items-center justify-center rounded-lg"
            style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="grid gap-4">
        <EditorSection title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TextInput id="product-name-input" autoFocus={isNew} label="Name" value={draft.name} onChange={v => updateField('name', v)} placeholder="Command Center Pro, ContentHub Starter..." />
            <TextInput label="Slug" value={draft.slug} onChange={v => updateField('slug', slugify(v))} placeholder="Auto-created from name if blank" />
            <TextInput label="Short name" value={draft.shortName} onChange={v => updateField('shortName', v)} />
            <label>
              <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Category</span>
              <ThemedSelect value={draft.category || ''} onChange={e => updateField('category', e.target.value)} style={FIELD}>
                {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
              </ThemedSelect>
            </label>
            <label>
              <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Status</span>
              <ThemedSelect value={draft.status} onChange={e => updateField('status', e.target.value)} style={FIELD}>
                <option value="draft">draft</option>
                <option value="published">published</option>
                <option value="archived">archived</option>
              </ThemedSelect>
            </label>
            <TextInput label="Accent color" type="color" value={draft.accentColor || '#3b82f6'} onChange={v => updateField('accentColor', v)} />
          </div>
          <TextInput label="Eyebrow" value={draft.eyebrow} onChange={v => updateField('eyebrow', v)} />
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_240px] gap-3 items-start">
            <div className="grid gap-3">
              <ProductMediaUploadField draft={draft} field="coverImage" label="Product image" kind="image" updateField={updateField} placeholder={DEFAULT_PRODUCT_COVER} />
              <ProductMediaUploadField draft={draft} field="productLogo" label="Product logo" kind="logo" updateField={updateField} placeholder={DEFAULT_PRODUCT_LOGO} />
            </div>
            <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)', background: '#07111f' }}>
              <ProductMedia product={draft} height={148} alt="Current product media preview" />
              <div className="px-3 py-2 text-[10px] uppercase" style={{ color: 'var(--text-muted)', background: 'var(--surface2)', borderTop: '1px solid var(--border)', letterSpacing: '0.06em' }}>Image + logo preview</div>
            </div>
          </div>
          <TextInput label="Headline" value={draft.headline} onChange={v => updateField('headline', v)} />
          <TextInput label="Summary" textarea rows={4} value={draft.summary} onChange={v => updateField('summary', v)} />
          <TextInput label="Suite card copy" textarea rows={3} value={draft.suiteCopy} onChange={v => updateField('suiteCopy', v)} />
        </EditorSection>

        <EditorSection title="Version Control" action={<button onClick={addVersion} style={smallBtn}><Plus size={14} /> Release</button>}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TextInput label="Current version" value={draft.versionPolicy?.currentVersion} onChange={v => updateVersionPolicy('currentVersion', v)} />
            <TextInput label="Channel" value={draft.versionPolicy?.channel} onChange={v => updateVersionPolicy('channel', v)} />
            <TextInput label="Source delivery" value={draft.versionPolicy?.sourceDelivery} onChange={v => updateVersionPolicy('sourceDelivery', v)} />
          </div>
          <TextInput label="Update entitlement" textarea rows={2} value={draft.versionPolicy?.updateEntitlement} onChange={v => updateVersionPolicy('updateEntitlement', v)} />
          <TextInput label="Breaking change policy" textarea rows={2} value={draft.versionPolicy?.breakingChangePolicy} onChange={v => updateVersionPolicy('breakingChangePolicy', v)} />
          <div className="grid gap-2">
            {(draft.versionHistory || []).map((entry, index) => (
              <div key={index} className="rounded-lg p-3 grid gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="grid grid-cols-3 gap-2">
                  <TextInput label="Version" value={entry.version} onChange={v => updateVersionHistory(index, 'version', v)} />
                  <TextInput label="Label" value={entry.label} onChange={v => updateVersionHistory(index, 'label', v)} />
                  <TextInput label="Date" value={entry.date} onChange={v => updateVersionHistory(index, 'date', v)} />
                </div>
                <TextInput label="Release notes" textarea rows={2} value={entry.notes} onChange={v => updateVersionHistory(index, 'notes', v)} />
              </div>
            ))}
          </div>
        </EditorSection>

        <EditorSection title="Packages" action={<button onClick={addPackage} style={smallBtn}><Plus size={14} /> Package</button>}>
          {(draft.packages || []).map((pkg, index) => {
            const pricingModel = pkg.pricingModel || (Number(pkg.monthlyFee || 0) > 0 ? 'managed-subscription' : 'setup-deposit')
            const packageCategory = pkg.packageCategory || (Number(pkg.monthlyFee || 0) > 0 ? 'managed' : 'private-install')
            const billingInterval = pkg.billingInterval || 'month'
            return (
              <div key={index} className="rounded-lg p-3 grid gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{pkg.name || `Package ${index + 1}`}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {packagePriceLabel(pkg)} | {optionLabel(PACKAGE_CATEGORY_OPTIONS, packageCategory)}
                    </div>
                  </div>
                  <button type="button" onClick={() => removePackage(index)} aria-label="Remove package" title="Remove package" style={{ ...dangerBtn, width: 38, minHeight: 38, padding: 0 }}>
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <TextInput label="ID" value={pkg.id} onChange={v => updatePackage(index, 'id', slugify(v))} />
                  <TextInput label="Name" value={pkg.name} onChange={v => updatePackage(index, 'name', v)} />
                  <TextInput label="Short label" value={pkg.short} onChange={v => updatePackage(index, 'short', v)} />
                  <TextInput label="Display label" value={pkg.label} onChange={v => updatePackage(index, 'label', v)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label>
                    <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Package category</span>
                    <ThemedSelect value={packageCategory} onChange={e => updatePackage(index, 'packageCategory', e.target.value)} style={FIELD}>
                      {PACKAGE_CATEGORY_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </ThemedSelect>
                  </label>
                  <label>
                    <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Pricing model</span>
                    <ThemedSelect value={pricingModel} onChange={e => updatePackage(index, 'pricingModel', e.target.value)} style={FIELD}>
                      {PRICING_MODEL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </ThemedSelect>
                  </label>
                  <label>
                    <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Billing interval</span>
                    <ThemedSelect value={billingInterval} onChange={e => updatePackage(index, 'billingInterval', e.target.value)} style={FIELD}>
                      {BILLING_INTERVAL_OPTIONS.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
                    </ThemedSelect>
                  </label>
                  <TextInput label="Monthly fee" value={pkg.monthlyFee} onChange={v => updatePackage(index, 'monthlyFee', v)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <TextInput label="Setup low" value={pkg.setupPrice} onChange={v => updatePackage(index, 'setupPrice', v)} />
                  <TextInput label="Setup high" value={pkg.setupPriceHigh} onChange={v => updatePackage(index, 'setupPriceHigh', v)} />
                  <TextInput label="Due today" value={pkg.retainer} onChange={v => updatePackage(index, 'retainer', v)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <TextInput label="Stripe one-time price ID" value={pkg.stripePriceId} onChange={v => updatePackage(index, 'stripePriceId', v)} />
                  <TextInput label="Stripe monthly price ID" value={pkg.stripeMonthlyPriceId} onChange={v => updatePackage(index, 'stripeMonthlyPriceId', v)} />
                  <TextInput label="Stripe setup price ID" value={pkg.stripeSetupPriceId} onChange={v => updatePackage(index, 'stripeSetupPriceId', v)} />
                </div>

                <TextInput label="Included modules" value={(pkg.modules || []).join(', ')} onChange={v => updatePackage(index, 'modules', v.split(',').map(slugify).filter(Boolean))} />
                <TextInput label="Copy" textarea rows={2} value={pkg.copy} onChange={v => updatePackage(index, 'copy', v)} />
                <label className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ color: 'var(--text)', border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <input type="checkbox" checked={Boolean(pkg.quoteRequired)} onChange={e => updatePackage(index, 'quoteRequired', e.target.checked)} />
                  Quote required before checkout
                </label>
                <HelpBox>{pricingModelHint(pricingModel)}</HelpBox>
              </div>
            )
          })}
        </EditorSection>

        <EditorSection title="Modules" action={<button onClick={addModule} style={smallBtn}><Plus size={14} /> Module</button>}>
          {(draft.modules || []).map((mod, index) => (
            <div key={index} className="rounded-lg p-3 grid gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <TextInput label="ID" value={mod.id} onChange={v => updateModule(index, 'id', slugify(v))} />
                <TextInput label="Name" value={mod.name} onChange={v => updateModule(index, 'name', v)} />
                <button onClick={() => removeModule(index)} style={{ ...dangerBtn, alignSelf: 'end', minHeight: 44 }}><Trash2 size={14} /></button>
              </div>
              <TextInput label="Copy" value={mod.copy} onChange={v => updateModule(index, 'copy', v)} />
            </div>
          ))}
        </EditorSection>

        <EditorSection title="Add-ons" action={<button onClick={addAddOn} style={smallBtn}><Plus size={14} /> Add-on</button>}>
          {(draft.addOns || []).length === 0 && <div className="text-sm" style={{ color: 'var(--text-muted)' }}>No priced add-ons yet.</div>}
          {(draft.addOns || []).map((addOn, index) => (
            <div key={index} className="rounded-lg p-3 grid gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-[1fr_1fr_120px_auto] gap-2">
                <TextInput label="ID" value={addOn.id} onChange={v => updateAddOn(index, 'id', slugify(v))} />
                <TextInput label="Name" value={addOn.name} onChange={v => updateAddOn(index, 'name', v)} />
                <TextInput label="Price" value={addOn.price} onChange={v => updateAddOn(index, 'price', v)} />
                <button onClick={() => removeAddOn(index)} style={{ ...dangerBtn, alignSelf: 'end', minHeight: 44 }}><Trash2 size={14} /></button>
              </div>
              <TextInput label="Copy" value={addOn.copy} onChange={v => updateAddOn(index, 'copy', v)} />
            </div>
          ))}
        </EditorSection>

        <EditorSection title="License Templates" action={<button onClick={addLicenseTemplate} style={smallBtn}><Plus size={14} /> License</button>}>
          {(draft.licenseTemplates || []).map((template, index) => (
            <div key={index} className="rounded-lg p-3 grid gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-2 gap-2">
                <TextInput label="ID" value={template.id} onChange={v => updateLicenseTemplate(index, 'id', slugify(v))} />
                <TextInput label="Name" value={template.name} onChange={v => updateLicenseTemplate(index, 'name', v)} />
                <TextInput label="Source" value={template.sourceAccess} onChange={v => updateLicenseTemplate(index, 'sourceAccess', v)} />
                <TextInput label="Transfer" value={template.transfer} onChange={v => updateLicenseTemplate(index, 'transfer', v)} />
              </div>
              <TextInput label="Summary" textarea rows={2} value={template.copy} onChange={v => updateLicenseTemplate(index, 'copy', v)} />
              <TextInput label="Audit / verification" value={template.audit} onChange={v => updateLicenseTemplate(index, 'audit', v)} />
              <button onClick={() => removeLicenseTemplate(index)} style={dangerBtn}><Trash2 size={14} /> Remove license</button>
            </div>
          ))}
        </EditorSection>

        <EditorSection title="Support Plans" action={<button onClick={addSupportPlan} style={smallBtn}><Plus size={14} /> Support</button>}>
          {(draft.supportPlans || []).map((plan, index) => (
            <div key={index} className="rounded-lg p-3 grid gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="grid grid-cols-2 gap-2">
                <TextInput label="ID" value={plan.id} onChange={v => updateSupportPlan(index, 'id', slugify(v))} />
                <TextInput label="Name" value={plan.name} onChange={v => updateSupportPlan(index, 'name', v)} />
                <TextInput label="Cadence" value={plan.cadence} onChange={v => updateSupportPlan(index, 'cadence', v)} />
                <TextInput label="Monthly fee" value={plan.monthlyFee} onChange={v => updateSupportPlan(index, 'monthlyFee', v)} />
              </div>
              <TextInput label="Response time" value={plan.responseTime} onChange={v => updateSupportPlan(index, 'responseTime', v)} />
              <TextInput label="Scope" textarea rows={2} value={plan.copy} onChange={v => updateSupportPlan(index, 'copy', v)} />
              <button onClick={() => removeSupportPlan(index)} style={dangerBtn}><Trash2 size={14} /> Remove support</button>
            </div>
          ))}
        </EditorSection>

        <EditorSection title="Storefront + API">
          <TextInput label="Checkout endpoint" value={draft.checkoutEndpoint} onChange={v => updateField('checkoutEndpoint', v)} />
          <pre className="rounded-lg p-3 overflow-auto text-xs" style={{ background: 'var(--base)', color: 'var(--text)', border: '1px solid var(--border)' }}>{`<div data-openocti-hostucts></div>
<script src="${publicBase}/api/products/bridge.js"
  data-api-base="${publicBase}"
  data-product="${draft.slug || '{slug}'}"
  data-target="[data-openocti-hostucts]"></script>`}</pre>
        </EditorSection>

        <div className="flex gap-2 justify-end sticky bottom-0 py-3" style={{ background: 'var(--surface)' }}>
          <button onClick={() => deleteProduct(draft)} style={dangerBtn}><Trash2 size={14} /> Delete</button>
          <button onClick={saveDraft} disabled={saving} className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: saving ? 0.65 : 1 }}><Check size={15} /> {isNew ? 'Create Product' : 'Save Product'}</button>
        </div>
      </div>
    </aside>
  )
}

function EditorSection({ title, action, children }) {
  return (
    <section className="rounded-xl p-3 grid gap-3" style={{ background: 'rgba(148,163,184,0.06)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="font-semibold" style={{ color: 'var(--text)' }}>{title}</h4>
        {action}
      </div>
      {children}
    </section>
  )
}

const smallBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'var(--surface2)',
  color: 'var(--accent)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '8px 10px',
  minHeight: 36,
  fontSize: 12,
  fontWeight: 700,
}

const dangerBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  background: 'rgba(220,38,38,0.12)',
  color: 'var(--red)',
  border: '1px solid rgba(220,38,38,0.35)',
  borderRadius: 8,
  padding: '9px 11px',
  minHeight: 40,
  fontSize: 12,
  fontWeight: 700,
}

function LicenseSection({ products, licenses, draft, setDraft, onSave, onDelete, onBulkDelete, onEdit, saving }) {
  const [licenseQuery, setLicenseQuery] = useState('')
  const [licenseStatus, setLicenseStatus] = useState('all')
  const [licenseProduct, setLicenseProduct] = useState('all')
  const [selectedLicenseIds, setSelectedLicenseIds] = useState(new Set())
  const selectedProduct = products.find(p => p.id === draft.productId) || products[0] || {}
  const packageOptions = selectedProduct.packages || []
  const licenseOptions = selectedProduct.licenseTemplates || []
  const supportOptions = selectedProduct.supportPlans || []
  const selectedLicenseTemplate = licenseOptions.find(t => t.id === draft.licenseTemplateId)
  const selectedSupportPlan = supportOptions.find(p => p.id === draft.supportPlanId)
  const selectedPackage = packageOptions.find(p => p.id === draft.packageId)
  const productById = useMemo(() => new Map(products.map(product => [product.id, product])), [products])
  const filteredLicenses = useMemo(() => {
    const q = licenseQuery.trim().toLowerCase()
    return licenses.filter(license => {
      const haystack = [
        license.company,
        license.customerName,
        license.email,
        license.licenseKey,
        license.productId,
        license.packageId,
        license.usageType,
        license.deploymentModel,
        license.supportStatus,
        license.notes,
      ].join(' ').toLowerCase()
      const matchesQuery = !q || haystack.includes(q)
      const matchesStatus = licenseStatus === 'all' || license.status === licenseStatus
      const matchesProduct = licenseProduct === 'all' || license.productId === licenseProduct
      return matchesQuery && matchesStatus && matchesProduct
    })
  }, [licenses, licenseQuery, licenseStatus, licenseProduct])
  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filteredLicenses, 25)
  const paginatedLicenseIds = useMemo(() => paginated.map(license => license.id), [paginated])

  const update = (key, value) => setDraft(prev => ({ ...prev, [key]: value }))
  const updateList = (key, value) => setDraft(prev => ({ ...prev, [key]: String(value || '').split(',').map(v => v.trim()).filter(Boolean) }))

  useEffect(() => { setPage(1) }, [licenseQuery, licenseStatus, licenseProduct, setPage])
  useEffect(() => { setSelectedLicenseIds(new Set()) }, [licenseQuery, licenseStatus, licenseProduct, page])

  const toggleLicenseSelected = (id) => {
    setSelectedLicenseIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAllLicenses = () => {
    setSelectedLicenseIds(prev => prev.size === paginatedLicenseIds.length ? new Set() : new Set(paginatedLicenseIds))
  }
  const deleteSelectedLicenses = async () => {
    const ok = await onBulkDelete(Array.from(selectedLicenseIds))
    if (ok) setSelectedLicenseIds(new Set())
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_440px] gap-5">
      <section className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
          <h3 className="font-semibold" style={{ color: 'var(--text)' }}>Issued Licenses</h3>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{filteredLicenses.length} of {licenses.length} shown</div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_180px_220px] gap-3 mb-4">
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Search</span>
            <input value={licenseQuery} onChange={e => setLicenseQuery(e.target.value)} placeholder="Customer, key, product, notes..." style={FIELD} />
          </label>
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Status</span>
            <ThemedSelect value={licenseStatus} onChange={e => setLicenseStatus(e.target.value)} style={FIELD}>
              <option value="all">All Statuses</option>
              {['active', 'pending', 'suspended', 'expired', 'revoked'].map(status => <option key={status} value={status}>{status}</option>)}
            </ThemedSelect>
          </label>
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Product</span>
            <ThemedSelect value={licenseProduct} onChange={e => setLicenseProduct(e.target.value)} style={FIELD}>
              <option value="all">All Products</option>
              {products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
            </ThemedSelect>
          </label>
        </div>
        {paginated.length > 0 && (
          <div className="rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={selectedLicenseIds.size === paginatedLicenseIds.length && paginatedLicenseIds.length > 0} onChange={toggleAllLicenses} style={{ width: 20, height: 20 }} />
              {selectedLicenseIds.size === 0 ? 'Select all' : `${selectedLicenseIds.size} selected`}
            </label>
            {selectedLicenseIds.size > 0 && (
              <>
                <button type="button" onClick={() => setSelectedLicenseIds(new Set())} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
                <button type="button" onClick={deleteSelectedLicenses} disabled={saving} className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: saving ? 0.6 : 1 }}>
                  <Trash2 size={15} /> {saving ? 'Deleting...' : `Delete ${selectedLicenseIds.size}`}
                </button>
              </>
            )}
          </div>
        )}
        <div className="rounded-lg overflow-auto" style={{ border: '1px solid var(--border)' }}>
          <table className="w-full text-sm min-w-[760px]">
            <thead style={{ background: 'var(--surface2)' }}>
              <tr>
                <th className="text-left p-3 w-[44px]" style={{ color: 'var(--text-muted)' }}></th>
                <th className="text-left p-3" style={{ color: 'var(--text-muted)' }}>Customer</th>
                <th className="text-left p-3" style={{ color: 'var(--text-muted)' }}>Product</th>
                <th className="text-left p-3" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="text-left p-3" style={{ color: 'var(--text-muted)' }}>Use</th>
                <th className="text-left p-3" style={{ color: 'var(--text-muted)' }}>Support</th>
                <th className="text-right p-3" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {licenses.length === 0 && <tr><td colSpan={7} className="p-5 text-center" style={{ color: 'var(--text-muted)' }}>No licenses issued yet.</td></tr>}
              {licenses.length > 0 && filteredLicenses.length === 0 && <tr><td colSpan={7} className="p-5 text-center" style={{ color: 'var(--text-muted)' }}>No licenses match the current controls.</td></tr>}
              {paginated.map(license => {
                const isSelected = selectedLicenseIds.has(license.id)
                return (
                <tr key={license.id} style={{ borderTop: '1px solid var(--border)', background: isSelected ? 'var(--accent-soft)' : 'transparent' }}>
                  <td className="p-3"><input type="checkbox" aria-label={`Select ${license.company || license.customerName || license.id}`} checked={isSelected} onChange={() => toggleLicenseSelected(license.id)} style={{ width: 20, height: 20 }} /></td>
                  <td className="p-3"><div style={{ color: 'var(--text)' }}>{license.company || license.customerName || 'Unnamed'}</div><div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{license.licenseKey || 'generated on save'}</div></td>
                  <td className="p-3" style={{ color: 'var(--text)' }}>{productById.get(license.productId)?.name || license.productId}<div className="text-xs" style={{ color: 'var(--text-muted)' }}>{license.packageId}</div></td>
                  <td className="p-3"><Pill tone={license.status === 'active' ? 'green' : 'amber'}>{license.status}</Pill></td>
                  <td className="p-3" style={{ color: 'var(--text)' }}>{license.usageType}<div className="text-xs" style={{ color: 'var(--text-muted)' }}>{license.deploymentModel}</div></td>
                  <td className="p-3" style={{ color: 'var(--text)' }}>{license.supportStatus}<div className="text-xs" style={{ color: 'var(--text-muted)' }}>{license.supportEndsAt || 'no end date'}</div></td>
                  <td className="p-3 text-right"><button onClick={() => onEdit(license)} style={{ color: 'var(--accent)', background: 'transparent', border: 0 }}>Edit</button><button onClick={() => onDelete(license.id)} style={{ color: 'var(--red)', background: 'transparent', border: 0, marginLeft: 12 }}>Delete</button></td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {filteredLicenses.length > 0 && <Paginator total={filteredLicenses.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="licenses" />}
      </section>

      <aside className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h3 className="font-semibold mb-4" style={{ color: 'var(--text)' }}>{draft.id ? 'Edit License' : 'Issue License'}</h3>
        <div className="grid gap-3">
          <TextInput label="Company" value={draft.company} onChange={v => update('company', v)} />
          <TextInput label="Customer name" value={draft.customerName} onChange={v => update('customerName', v)} />
          <TextInput label="Email" value={draft.email} onChange={v => update('email', v)} />
          <label><span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Product</span><ThemedSelect value={draft.productId} onChange={e => update('productId', e.target.value)} style={FIELD}>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</ThemedSelect></label>
          <label><span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Package</span><ThemedSelect value={draft.packageId} onChange={e => update('packageId', e.target.value)} style={FIELD}>{packageOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</ThemedSelect></label>
          {selectedPackage?.copy && <HelpBox>{selectedPackage.copy}</HelpBox>}
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>License Template</span>
            <ThemedSelect value={draft.licenseTemplateId} onChange={e => update('licenseTemplateId', e.target.value)} style={FIELD}>
              {licenseOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </ThemedSelect>
          </label>
          {selectedLicenseTemplate && <HelpBox><strong style={{ color: 'var(--text)' }}>{selectedLicenseTemplate.name}:</strong> {selectedLicenseTemplate.copy || 'No description yet.'}</HelpBox>}
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Support Plan</span>
            <ThemedSelect value={draft.supportPlanId} onChange={e => update('supportPlanId', e.target.value)} style={FIELD}>
              {supportOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </ThemedSelect>
          </label>
          {selectedSupportPlan && <HelpBox><strong style={{ color: 'var(--text)' }}>{selectedSupportPlan.name}:</strong> {selectedSupportPlan.copy || 'No support scope yet.'}<div className="mt-2">Cadence: {selectedSupportPlan.cadence || 'not set'} / Response: {selectedSupportPlan.responseTime || 'not set'} / Monthly fee: {money(selectedSupportPlan.monthlyFee)}</div></HelpBox>}
          <div className="grid grid-cols-2 gap-3">
            <label><span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Status</span><ThemedSelect value={draft.status} onChange={e => update('status', e.target.value)} style={FIELD}>{['active', 'pending', 'suspended', 'expired', 'revoked'].map(v => <option key={v} value={v}>{v}</option>)}</ThemedSelect></label>
            <label><span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Usage type</span><ThemedSelect value={draft.usageType} onChange={e => update('usageType', e.target.value)} style={FIELD}>{['single-use', 'multi-user', 'site', 'enterprise', 'developer', 'internal'].map(v => <option key={v} value={v}>{v}</option>)}</ThemedSelect></label>
          </div>
          <HelpBox>{STATUS_HELP[draft.status]} Usage: {USAGE_TYPE_HELP[draft.usageType]}</HelpBox>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Deployment</span><ThemedSelect value={draft.deploymentModel} onChange={e => update('deploymentModel', e.target.value)} style={FIELD}>{['on-premise', 'off-premise', 'private-cloud', 'managed-cloud', 'hybrid', 'local-only'].map(v => <option key={v} value={v}>{v}</option>)}</ThemedSelect></label>
            <TextInput label="Seats" value={draft.seats} onChange={v => update('seats', Number(v) || 1)} />
          </div>
          <HelpBox>{DEPLOYMENT_HELP[draft.deploymentModel]}</HelpBox>
          <div className="grid grid-cols-3 gap-3">
            <TextInput label="Max users" value={draft.maxUsers} onChange={v => update('maxUsers', Number(v) || 1)} />
            <TextInput label="Max instances" value={draft.maxInstances} onChange={v => update('maxInstances', Number(v) || 1)} />
            <TextInput label="Max tenants" value={draft.maxTenants} onChange={v => update('maxTenants', Number(v) || 1)} />
          </div>
          <TextInput label="License key" value={draft.licenseKey} onChange={v => update('licenseKey', v)} placeholder="Leave blank to generate" />
          <TextInput label="Allowed domains" value={(draft.allowedDomains || []).join(', ')} onChange={v => updateList('allowedDomains', v)} placeholder="example.com, app.example.com" />
          <TextInput label="Allowed IPs" value={(draft.allowedIps || []).join(', ')} onChange={v => updateList('allowedIps', v)} />
          <TextInput label="Hardware IDs" value={(draft.allowedHardwareIds || []).join(', ')} onChange={v => updateList('allowedHardwareIds', v)} />
          <TextInput label="Enabled add-ons" value={(draft.enabledAddons || []).join(', ')} onChange={v => updateList('enabledAddons', v)} />
          <TextInput label="Disabled features" value={(draft.disabledFeatures || []).join(', ')} onChange={v => updateList('disabledFeatures', v)} />
          <TextInput label="Metered limits JSON" textarea rows={2} value={JSON.stringify(draft.meteredLimits || {}, null, 2)} onChange={v => { try { update('meteredLimits', JSON.parse(v || '{}')) } catch {} }} />
          <TextInput label="Custom entitlements JSON" textarea rows={2} value={JSON.stringify(draft.entitlements || {}, null, 2)} onChange={v => { try { update('entitlements', JSON.parse(v || '{}')) } catch {} }} />
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="Current version" value={draft.currentVersion} onChange={v => update('currentVersion', v)} />
            <TextInput label="Max version" value={draft.maxVersion} onChange={v => update('maxVersion', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TextInput label="License expires" value={draft.expiresAt} onChange={v => update('expiresAt', v)} placeholder="2027-05-11" />
            <TextInput label="Support ends" value={draft.supportEndsAt} onChange={v => update('supportEndsAt', v)} placeholder="2027-05-11" />
          </div>
          <label><span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Support Status</span><ThemedSelect value={draft.supportStatus} onChange={e => update('supportStatus', e.target.value)} style={FIELD}>{['active', 'pending', 'expired', 'none'].map(v => <option key={v} value={v}>{v}</option>)}</ThemedSelect></label>
          <HelpBox>{SUPPORT_STATUS_HELP[draft.supportStatus]}</HelpBox>
          <TextInput label="Repo URL" value={draft.repoUrl} onChange={v => update('repoUrl', v)} />
          <TextInput label="Notes" textarea rows={3} value={draft.notes} onChange={v => update('notes', v)} />
          <button onClick={onSave} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 0, minHeight: 44 }}>
            <Save size={15} /> {saving ? 'Saving...' : 'Save License'}
          </button>
        </div>
      </aside>
    </div>
  )
}
