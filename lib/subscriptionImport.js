const CATEGORY_ALIASES = {
  ai: 'ai',
  'ai llms': 'ai',
  'ai l l ms': 'ai',
  'ai dev tools': 'ai',
  'dev tools ai': 'ai',
  'dev tools': 'dev-tools',
  developer: 'dev-tools',
  development: 'dev-tools',
  'cloud infrastructure': 'hosting',
  hosting: 'hosting',
  infrastructure: 'hosting',
  infra: 'hosting',
  design: 'design',
  email: 'email',
  'email infrastructure': 'email',
  automation: 'productivity',
  database: 'database',
  databases: 'database',
  productivity: 'productivity',
  telephony: 'telephony',
  voice: 'telephony',
  domains: 'domains',
  media: 'media',
  finance: 'finance',
  other: 'other',
}

const FIELD_ALIASES = {
  vendor_name: 'vendorName',
  vendor: 'vendorName',
  provider: 'vendorName',
  merchant: 'vendorName',
  payee: 'vendorName',
  company: 'vendorName',
  sender: 'vendorName',
  from: 'vendorName',
  service: 'vendorName',
  product_or_plan: 'productOrPlan',
  product: 'productOrPlan',
  plan: 'productOrPlan',
  description: 'productOrPlan',
  item: 'productOrPlan',
  subscription: 'productOrPlan',
  memo: 'productOrPlan',
  category: 'category',
  amount: 'amount',
  total: 'amount',
  amount_due: 'amount',
  balance_due: 'amount',
  invoice_amount: 'amount',
  receipt_amount: 'amount',
  charged_amount: 'amount',
  payment_amount: 'amount',
  currency: 'currency',
  billing_frequency: 'billingFrequency',
  frequency: 'billingFrequency',
  cadence: 'billingFrequency',
  recurrence: 'billingFrequency',
  interval: 'billingFrequency',
  billing_type: 'billingType',
  charge_type: 'billingType',
  billing_day_of_month: 'billingDayOfMonth',
  billing_day: 'billingDayOfMonth',
  due_day: 'billingDayOfMonth',
  last_charge_date: 'lastChargeDate',
  charge_date: 'lastChargeDate',
  transaction_date: 'lastChargeDate',
  payment_date: 'lastChargeDate',
  paid_date: 'lastChargeDate',
  receipt_date: 'lastChargeDate',
  invoice_date: 'lastChargeDate',
  email_date: 'lastChargeDate',
  date: 'lastChargeDate',
  last_charge_amount: 'lastChargeAmount',
  next_charge_date: 'nextChargeDate',
  next_due: 'nextChargeDate',
  due_date: 'nextChargeDate',
  payment_due: 'nextChargeDate',
  renewal_date: 'nextChargeDate',
  status: 'status',
  payment_status: 'status',
  invoice_status: 'status',
  payment_method: 'paymentMethod',
  card: 'paymentMethod',
  card_last4: 'paymentMethod',
  account: 'paymentMethod',
  source: 'paymentMethod',
  source_receipt_id: 'sourceReceiptId',
  receipt_id: 'sourceReceiptId',
  invoice_id: 'sourceReceiptId',
  invoice_number: 'sourceReceiptId',
  order_id: 'sourceReceiptId',
  transaction_id: 'sourceReceiptId',
  email_id: 'sourceReceiptId',
  message_id: 'sourceReceiptId',
  business_entity: 'businessEntity',
  entity: 'businessEntity',
  project_or_product: 'projectOrProduct',
  project: 'projectOrProduct',
  min_observed_amount: 'minObservedAmount',
  max_observed_amount: 'maxObservedAmount',
  avg_monthly_amount: 'avgMonthlyAmount',
  average_monthly_amount: 'avgMonthlyAmount',
  last_3_charges: 'last3Charges',
  last_three_charges: 'last3Charges',
  login_url: 'loginUrl',
  url: 'loginUrl',
  notes: 'notes',
  subject: 'notes',
  snippet: 'notes',
  details: 'notes',
}

export const REQUIRED_IMPORT_FIELDS = [
  'vendor_name',
  'product_or_plan',
  'category',
  'amount',
  'currency',
  'billing_frequency',
  'billing_type',
  'billing_day_of_month',
  'last_charge_date',
  'next_charge_date',
  'status',
  'payment_method',
]

function cleanHeader(value) {
  return String(value || '')
    .trim()
    .replace(/^\uFEFF/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function cleanKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeImportKey(value) {
  return cleanKey(value)
}

function isBlankRow(row) {
  return row.every(cell => String(cell || '').trim() === '')
}

function detectDelimiter(text) {
  const sample = text.split(/\r\n|\n|\r/).find(line => line.trim()) || ''
  const candidates = [',', '\t', ';']
  let best = ','
  let bestCount = -1
  for (const candidate of candidates) {
    let count = 0
    let quoted = false
    for (let i = 0; i < sample.length; i++) {
      const ch = sample[i]
      if (ch === '"') {
        if (quoted && sample[i + 1] === '"') i++
        else quoted = !quoted
      } else if (!quoted && ch === candidate) {
        count++
      }
    }
    if (count > bestCount) {
      best = candidate
      bestCount = count
    }
  }
  return best
}

export function parseCsv(text) {
  const source = String(text || '')
  const delimiter = detectDelimiter(source)
  const rows = []
  let row = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < source.length; i++) {
    const ch = source[i]

    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else {
          quoted = false
        }
      } else {
        cell += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      if (!isBlankRow(row)) rows.push(row)
      row = []
      cell = ''
    } else if (ch === '\r') {
      row.push(cell)
      if (!isBlankRow(row)) rows.push(row)
      row = []
      cell = ''
      if (source[i + 1] === '\n') i++
    } else {
      cell += ch
    }
  }

  row.push(cell)
  if (!isBlankRow(row)) rows.push(row)
  return rows
}

export function csvToObjects(text) {
  const rows = parseCsv(text)
  if (rows.length === 0) return { headers: [], records: [] }

  const headers = rows[0].map(header => cleanHeader(header))
  const canonicalHeaders = headers.map(header => FIELD_ALIASES[header] || header)
  const records = rows.slice(1).map((row, index) => {
    const record = { _rowNumber: index + 2 }
    canonicalHeaders.forEach((header, i) => {
      if (!header) return
      record[header] = String(row[i] || '').trim()
    })
    return record
  })

  return { headers, records }
}

function parseMoney(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const negative = /^\(.*\)$/.test(raw)
  const normalized = raw.replace(/[,$\s]/g, '').replace(/[()]/g, '')
  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return negative ? -n : n
}

function parseInteger(value) {
  const n = Number.parseInt(String(value || '').trim(), 10)
  return Number.isFinite(n) ? n : null
}

function parseDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (mdy) {
    const year = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3]
    const date = new Date(Date.UTC(Number(year), Number(mdy[1]) - 1, Number(mdy[2])))
    if (!isNaN(date.getTime())) return date.toISOString().slice(0, 10)
  }

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serial = Number(raw)
    if (serial > 20000 && serial < 80000) {
      const excelEpoch = Date.UTC(1899, 11, 30)
      const date = new Date(excelEpoch + serial * 86400000)
      return date.toISOString().slice(0, 10)
    }
  }

  const date = new Date(raw)
  if (isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function mergeNotes(...values) {
  return values.map(v => String(v || '').trim()).filter(Boolean).join(' | ')
}

function normalizeFrequency(value) {
  const key = cleanKey(value)
  if (!key) return 'monthly'
  if (['annual', 'annually', 'yearly', 'year'].includes(key)) return 'yearly'
  if (['month', 'monthly'].includes(key)) return 'monthly'
  if (['quarter', 'quarterly'].includes(key)) return 'quarterly'
  if (['week', 'weekly'].includes(key)) return 'weekly'
  if (['usage based', 'usage', 'metered'].includes(key)) return 'usage-based'
  if (['one time', 'one off', 'single'].includes(key)) return 'one-time'
  return key.replace(/\s+/g, '-')
}

function normalizeBillingType(value) {
  const key = cleanKey(value)
  if (!key) return 'fixed'
  if (['fixed', 'variable'].includes(key)) return key
  if (['pay as you go', 'payg', 'metered'].includes(key)) return 'pay-as-you-go'
  if (['prepaid', 'prepaid credit', 'credit'].includes(key)) return 'prepaid-credit'
  return key.replace(/\s+/g, '-')
}

function normalizeStatus(value) {
  const key = cleanKey(value)
  if (!key) return 'active'
  if (['past due', 'pastdue', 'late'].includes(key)) return 'past-due'
  if (['inactive', 'failed inactive', 'failed'].includes(key)) return 'inactive'
  if (['cancelled', 'canceled'].includes(key)) return 'canceled'
  if (['paused', 'pause'].includes(key)) return 'paused'
  if (['active', 'current'].includes(key)) return 'active'
  return key.replace(/\s+/g, '-')
}

function normalizeCategory(value) {
  const key = cleanKey(value)
  return CATEGORY_ALIASES[key] || key.replace(/\s+/g, '-') || 'other'
}

function parseLastCharges(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed
  } catch {}
  return raw
    .split(/[|;]/)
    .map(part => part.trim())
    .filter(Boolean)
}

function missingCoreFields(raw) {
  const byCanonical = {}
  for (const field of REQUIRED_IMPORT_FIELDS) {
    byCanonical[FIELD_ALIASES[field] || field] = field
  }
  return Object.entries(byCanonical)
    .filter(([canonical]) => !String(raw[canonical] || '').trim())
    .map(([, field]) => field)
}

export function normalizeSubscriptionRecord(raw) {
  const vendor = String(raw.vendorName || '').trim()
  if (!vendor) {
    return { ok: false, rowNumber: raw._rowNumber, error: 'Missing vendor_name' }
  }

  const amount = parseMoney(raw.amount)
  const status = normalizeStatus(raw.status)
  if (amount === null && status !== 'inactive') {
    return { ok: false, rowNumber: raw._rowNumber, error: 'Missing or invalid amount' }
  }

  const billingDay = parseInteger(raw.billingDayOfMonth)
  const lastChargeDate = parseDate(raw.lastChargeDate)
  const nextChargeDate = parseDate(raw.nextChargeDate)
  const avgMonthlyAmount = parseMoney(raw.avgMonthlyAmount)
  const lastChargeAmount = parseMoney(raw.lastChargeAmount)

  return {
    ok: true,
    rowNumber: raw._rowNumber,
    warnings: missingCoreFields(raw),
    subscription: {
      vendor,
      productOrPlan: String(raw.productOrPlan || '').trim(),
      category: normalizeCategory(raw.category),
      amount: amount ?? 0,
      currency: String(raw.currency || 'USD').trim().toUpperCase() || 'USD',
      frequency: normalizeFrequency(raw.billingFrequency),
      billingType: normalizeBillingType(raw.billingType),
      billingDayOfMonth: billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null,
      lastChargeDate,
      nextDue: nextChargeDate,
      status,
      paymentMethod: String(raw.paymentMethod || '').trim(),
      businessEntity: String(raw.businessEntity || '').trim(),
      projectOrProduct: String(raw.projectOrProduct || '').trim(),
      minObservedAmount: parseMoney(raw.minObservedAmount),
      maxObservedAmount: parseMoney(raw.maxObservedAmount),
      avgMonthlyAmount,
      lastChargeAmount,
      last3Charges: parseLastCharges(raw.last3Charges),
      loginUrl: String(raw.loginUrl || '').trim(),
      notes: String(raw.notes || '').trim(),
      sourceReceiptId: String(raw.sourceReceiptId || '').trim(),
      active: !['canceled', 'paused', 'inactive'].includes(status),
      importSource: 'csv',
    },
  }
}

export function parseSubscriptionCsv(text) {
  const { headers, records } = csvToObjects(text)
  const normalized = records.map(normalizeSubscriptionRecord)
  return { headers, records: normalized }
}

export function subscriptionMatchKey(subscription) {
  const vendor = cleanKey(subscription.vendor)
  const product = cleanKey(subscription.productOrPlan)
  const method = cleanKey(subscription.paymentMethod)
  return [vendor, product, method].join('|')
}

export function normalizeReconciliationRecord(raw) {
  const vendor = String(raw.vendorName || '').trim()
  const amount = parseMoney(raw.amount)
  const productOrPlan = String(raw.productOrPlan || '').trim()
  const sourceReceiptId = String(raw.sourceReceiptId || '').trim()

  if (!vendor) {
    return { ok: false, rowNumber: raw._rowNumber, error: 'Missing vendor_name' }
  }

  if (amount === null && !productOrPlan && !sourceReceiptId) {
    return { ok: false, rowNumber: raw._rowNumber, error: 'Missing amount, product_or_plan, or source_receipt_id' }
  }

  const billingDay = parseInteger(raw.billingDayOfMonth)
  const lastChargeDate = parseDate(raw.lastChargeDate)
  const nextChargeDate = parseDate(raw.nextChargeDate)
  const status = normalizeStatus(raw.status)

  const subscription = {
    vendor,
    productOrPlan,
    category: normalizeCategory(raw.category),
    amount: amount ?? 0,
    currency: String(raw.currency || 'USD').trim().toUpperCase() || 'USD',
    frequency: normalizeFrequency(raw.billingFrequency),
    billingType: normalizeBillingType(raw.billingType),
    billingDayOfMonth: billingDay && billingDay >= 1 && billingDay <= 31 ? billingDay : null,
    lastChargeDate,
    nextDue: nextChargeDate,
    status,
    paymentMethod: String(raw.paymentMethod || '').trim(),
    businessEntity: String(raw.businessEntity || '').trim(),
    projectOrProduct: String(raw.projectOrProduct || '').trim(),
    minObservedAmount: parseMoney(raw.minObservedAmount),
    maxObservedAmount: parseMoney(raw.maxObservedAmount),
    avgMonthlyAmount: parseMoney(raw.avgMonthlyAmount),
    lastChargeAmount: parseMoney(raw.lastChargeAmount),
    last3Charges: parseLastCharges(raw.last3Charges),
    loginUrl: String(raw.loginUrl || '').trim(),
    active: !['canceled', 'paused', 'inactive'].includes(status),
    importSource: 'email-reconciliation-csv',
    sourceReceiptId,
    notes: mergeNotes(raw.notes, raw.productOrPlan),
  }

  return {
    ok: true,
    rowNumber: raw._rowNumber,
    warnings: [],
    subscription,
  }
}

export function parseReconciliationCsv(text) {
  const { headers, records } = csvToObjects(text)
  const normalized = records.map(normalizeReconciliationRecord)
  return { headers, records: normalized }
}
