import { readData, writeData } from './dataStore'

const PROD_BASE = 'https://api.privacy.com/v1'
const SANDBOX_BASE = 'https://sandbox.privacy.com/v1'
const TRANSACTION_FILE = 'privacy-transactions.json'
const CARD_FILE = 'privacy-cards.json'
const CATEGORY_FILE = 'privacy-card-categories.json'

const DEFAULT_CATEGORIES = [
  { id: 'software', name: 'Software', color: 'var(--accent)' },
  { id: 'infrastructure', name: 'Infrastructure', color: 'var(--teal)' },
  { id: 'marketing', name: 'Marketing', color: 'var(--peach)' },
  { id: 'client-expense', name: 'Client Expense', color: 'var(--green)' },
]

function norm(value) {
  return String(value || '').trim()
}

function fieldVal(cred, labelRx) {
  const f = (cred?.fields || []).find(x => labelRx.test(x.label || ''))
  return norm(f?.value)
}

export function getPrivacyCredential() {
  const data = readData('credentials.json') || { credentials: [] }
  const credential = (data.credentials || []).find(c => /privacy/i.test(c.name || ''))
  if (!credential) return { configured: false, credential: null, key: '', environment: 'production', baseUrl: PROD_BASE }

  const key = fieldVal(credential, /api\s*key|key|token/i)
  const environment = /sandbox|test/i.test(fieldVal(credential, /environment|mode/i)) ? 'sandbox' : 'production'
  const configuredBase = fieldVal(credential, /base\s*url|api\s*url/i)
  const baseUrl = configuredBase || (environment === 'sandbox' ? SANDBOX_BASE : PROD_BASE)
  return { configured: !!key, credential, key, environment, baseUrl }
}

export function privacyAuthHeaders(key) {
  return {
    Authorization: `api-key ${key}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

export function publicPrivacyWebhookUrl(origin = '') {
  const base = process.env.NEXT_PUBLIC_CRM_URL
    || process.env.PUBLIC_CRM_URL
    || process.env.CRM_PUBLIC_URL
    || origin
    || 'https://openocti.local'
  return `${String(base).replace(/\/+$/, '')}/api/privacy/transaction-webhook`
}

function centsToUsd(value) {
  if (value == null || value === '') return 0
  return Math.round((Number(value) || 0)) / 100
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function readCardMeta() {
  const data = readData(CARD_FILE) || { cards: [] }
  return Array.isArray(data.cards) ? data.cards : []
}

function writeCards(cards) {
  writeData(CARD_FILE, {
    lastUpdated: new Date().toISOString(),
    cards: cards
      .sort((a, b) => new Date(b.created || b.updatedAt) - new Date(a.created || a.updatedAt))
      .slice(0, 1000),
  })
}

function categoryExists(categories, id) {
  return !id || categories.some(c => c.id === id)
}

export function sanitizePrivacyTransaction(input = {}) {
  const merchant = input.merchant || {}
  const events = Array.isArray(input.events)
    ? input.events.slice(-12).map(e => ({
        token: norm(e.token),
        type: norm(e.type),
        result: norm(e.result),
        amount: centsToUsd(e.amount),
        created: norm(e.created),
      }))
    : []

  return {
    token: norm(input.token || input.id),
    cardToken: norm(input.card_token),
    status: norm(input.status || input.result),
    result: norm(input.result),
    amount: centsToUsd(input.amount),
    authorizationAmount: centsToUsd(input.authorization_amount),
    merchantAmount: centsToUsd(input.merchant_amount),
    currency: norm(input.merchant_currency || input.currency || 'USD') || 'USD',
    merchant: {
      descriptor: norm(merchant.descriptor || input.merchant_descriptor),
      city: norm(merchant.city),
      state: norm(merchant.state),
      country: norm(merchant.country),
      mcc: norm(merchant.mcc),
    },
    created: norm(input.created) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    events,
  }
}

export function readPrivacyTransactions() {
  const data = readData(TRANSACTION_FILE) || { transactions: [] }
  return {
    lastUpdated: data.lastUpdated || '',
    transactions: Array.isArray(data.transactions) ? data.transactions : [],
  }
}

export function readPrivacyCategories() {
  const data = readData(CATEGORY_FILE) || { categories: DEFAULT_CATEGORIES }
  const categories = Array.isArray(data.categories) && data.categories.length ? data.categories : DEFAULT_CATEGORIES
  return {
    lastUpdated: data.lastUpdated || '',
    categories,
  }
}

export function upsertPrivacyCategory(input = {}) {
  const name = norm(input.name).slice(0, 80)
  if (!name) throw new Error('Category name is required')
  const data = readPrivacyCategories()
  const id = norm(input.id) || genId('pcat')
  const category = {
    id,
    name,
    color: norm(input.color) || 'var(--accent)',
    updatedAt: new Date().toISOString(),
  }
  const i = data.categories.findIndex(c => c.id === id)
  if (i >= 0) data.categories[i] = { ...data.categories[i], ...category }
  else data.categories.push({ ...category, createdAt: category.updatedAt })
  data.lastUpdated = new Date().toISOString()
  writeData(CATEGORY_FILE, data)
  return { category, categories: data.categories, created: i < 0 }
}

export function deletePrivacyCategory(id) {
  const categoryId = norm(id)
  if (!categoryId) throw new Error('Category id is required')
  const data = readPrivacyCategories()
  data.categories = data.categories.filter(c => c.id !== categoryId)
  data.lastUpdated = new Date().toISOString()
  writeData(CATEGORY_FILE, data)

  const cards = readCardMeta().map(card => card.categoryId === categoryId ? { ...card, categoryId: '', updatedAt: new Date().toISOString() } : card)
  writeCards(cards)
  return { ok: true, categories: data.categories }
}

export function sanitizePrivacyCard(input = {}, meta = {}) {
  const funding = input.funding || {}
  return {
    token: norm(input.token || input.id),
    memo: norm(input.memo) || 'Privacy card',
    type: norm(input.type || 'SINGLE_USE'),
    state: norm(input.state || 'OPEN'),
    hostname: norm(input.hostname),
    lastFour: norm(input.last_four || input.last4),
    spendLimit: centsToUsd(input.spend_limit),
    spendLimitDuration: norm(input.spend_limit_duration || 'TRANSACTION'),
    funding: {
      token: norm(funding.token || input.funding_token),
      nickname: norm(funding.nickname),
      accountName: norm(funding.account_name),
      lastFour: norm(funding.last_four),
      type: norm(funding.type),
      state: norm(funding.state),
    },
    expMonth: norm(input.exp_month),
    expYear: norm(input.exp_year),
    cardholderName: norm(meta.cardholderName || input.cardholderName || input.cardholder_name),
    categoryId: norm(meta.categoryId || input.categoryId),
    created: norm(input.created) || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export function readPrivacyCards() {
  const data = readData(CARD_FILE) || { cards: [] }
  return {
    lastUpdated: data.lastUpdated || '',
    cards: Array.isArray(data.cards) ? data.cards : [],
  }
}

export function upsertPrivacyCard(cardInput, { source = 'privacy_api', categoryId = '', cardholderName = '' } = {}) {
  const categories = readPrivacyCategories().categories
  const existingCards = readCardMeta()
  const existing = existingCards.find(c => c.token === norm(cardInput?.token || cardInput?.id))
  const nextCategory = categoryExists(categories, categoryId) ? categoryId : ''
  const card = {
    ...sanitizePrivacyCard(cardInput, {
      categoryId: nextCategory || existing?.categoryId || '',
      cardholderName: cardholderName || existing?.cardholderName || '',
    }),
    source,
  }
  if (!card.token) card.token = genId('privacy_card')

  const i = existingCards.findIndex(c => c.token === card.token)
  if (i >= 0) existingCards[i] = { ...existingCards[i], ...card, categoryId: card.categoryId || existingCards[i].categoryId || '' }
  else existingCards.unshift(card)
  writeCards(existingCards)
  return { card: i >= 0 ? existingCards[i] : card, created: i < 0 }
}

export function assignPrivacyCardCategory(cardToken, categoryId) {
  const token = norm(cardToken)
  if (!token) throw new Error('Card token is required')
  const categories = readPrivacyCategories().categories
  if (!categoryExists(categories, categoryId)) throw new Error('Category not found')
  const cards = readCardMeta()
  const i = cards.findIndex(c => c.token === token)
  if (i < 0) throw new Error('Card not found')
  cards[i] = { ...cards[i], categoryId: norm(categoryId), updatedAt: new Date().toISOString() }
  writeCards(cards)
  return { card: cards[i] }
}

export function upsertPrivacyTransaction(transactionInput, { source = 'privacy_webhook' } = {}) {
  const transaction = { ...sanitizePrivacyTransaction(transactionInput), source }
  if (!transaction.token) transaction.token = `privacy_${Date.now().toString(36)}`

  const data = readPrivacyTransactions()
  const i = data.transactions.findIndex(t => t.token === transaction.token)
  if (i >= 0) data.transactions[i] = { ...data.transactions[i], ...transaction }
  else data.transactions.unshift(transaction)

  data.transactions = data.transactions
    .sort((a, b) => new Date(b.created || b.updatedAt) - new Date(a.created || a.updatedAt))
    .slice(0, 500)
  data.lastUpdated = new Date().toISOString()
  writeData(TRANSACTION_FILE, data)
  return { transaction, created: i < 0 }
}

export function privacySummary(transactions = [], cards = []) {
  const last30 = Date.now() - 30 * 86400000
  const recent = transactions.filter(t => new Date(t.created || t.updatedAt).getTime() >= last30)
  const approved = recent.filter(t => !/declined|voided|bounced/i.test(`${t.status} ${t.result}`))
  const declined = recent.length - approved.length
  return {
    recentCount: recent.length,
    recentSpend: approved.reduce((sum, t) => sum + Math.abs(Number(t.amount) || 0), 0),
    declinedCount: declined,
    openCards: cards.filter(c => String(c.state || '').toUpperCase() === 'OPEN').length,
    pausedCards: cards.filter(c => String(c.state || '').toUpperCase() === 'PAUSED').length,
    cardCount: cards.length,
    latestAt: transactions[0]?.created || transactions[0]?.updatedAt || '',
  }
}
