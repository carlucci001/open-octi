'use client'
import { useEffect, useMemo, useState } from 'react'
import { Copy, CreditCard, ExternalLink, Pause, Play, Plus, RefreshCcw, Tag, Trash2 } from 'lucide-react'

const fmtUSD = n => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

const CARD_TYPES = [
  { value: 'SINGLE_USE', label: 'Single use' },
  { value: 'MERCHANT_LOCKED', label: 'Merchant locked' },
  { value: 'UNLOCKED', label: 'Unlocked' },
  { value: 'DIGITAL_WALLET', label: 'Digital wallet' },
]

const LIMIT_DURATIONS = [
  { value: 'TRANSACTION', label: 'Per transaction' },
  { value: 'MONTHLY', label: 'Monthly' },
  { value: 'ANNUALLY', label: 'Annual' },
  { value: 'FOREVER', label: 'Lifetime' },
]

const EMPTY_CARD = {
  memo: '',
  cardholderName: 'Carl Farrington',
  categoryId: '',
  type: 'MERCHANT_LOCKED',
  spendLimit: '25',
  spendLimitDuration: 'TRANSACTION',
  state: 'OPEN',
  fundingToken: '',
}

const SAMPLE_CARDS = [
  {
    token: 'preview-primary',
    memo: 'Primary in-house card',
    cardholderName: 'Carl Farrington',
    lastFour: '4826',
    expMonth: '06',
    expYear: '2029',
    state: 'OPEN',
    type: 'MERCHANT_LOCKED',
    spendLimit: 250,
    spendLimitDuration: 'TRANSACTION',
  },
  {
    token: 'preview-vendor',
    memo: 'Vendor card sample',
    cardholderName: 'Carl Farrington',
    lastFour: '1042',
    expMonth: '11',
    expYear: '2029',
    state: 'OPEN',
    type: 'SINGLE_USE',
    spendLimit: 75,
    spendLimitDuration: 'FOREVER',
  },
]

const inputStyle = {
  width: '100%',
  minHeight: 38,
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  borderRadius: 8,
  padding: '7px 9px',
  fontSize: 13,
  outline: 'none',
}

function prettyDate(value) {
  if (!value) return 'Never'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString()
}

function shortToken(value) {
  const v = String(value || '')
  if (v.length <= 12) return v || 'no token'
  return `${v.slice(0, 8)}...${v.slice(-4)}`
}

function cardState(card) {
  return String(card?.state || card?.status || '').trim().toUpperCase()
}

function isVisibleCard(card) {
  const state = cardState(card)
  return !/(CLOSED|DELETED|TERMINATED|ARCHIVED|CANCELED|CANCELLED)/.test(state)
}

function cardNumberDisplay(card) {
  const raw = String(card?.pan || card?.cardNumber || card?.card_number || '').replace(/\D/g, '')
  const digits = raw || String(card?.lastFour || '').replace(/\D/g, '')
  if (digits.length >= 12) return digits.replace(/(.{4})/g, '$1 ').trim()
  return `**** **** **** ${digits.padStart(4, '*')}`
}

function expDisplay(card) {
  const month = String(card?.expMonth || card?.exp_month || '').padStart(2, '0').slice(-2)
  const year = String(card?.expYear || card?.exp_year || '').slice(-2)
  return month && year ? `${month}/${year}` : '**/**'
}

function postPrivacy(body) {
  return fetch('/api/privacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(async res => {
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.ok === false) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  })
}

export default function PrivacyFinancePanel() {
  const [state, setState] = useState({ loading: true, cards: [], categories: [], transactions: [], fundingSources: [], summary: {} })
  const [tab, setTab] = useState('cards')
  const [cardForm, setCardForm] = useState(EMPTY_CARD)
  const [categoryName, setCategoryName] = useState('')
  const [busy, setBusy] = useState('')
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const visibleCards = useMemo(() => (state.cards || []).filter(isVisibleCard), [state.cards])
  const hiddenCardCount = Math.max(0, (state.cards || []).length - visibleCards.length)

  const categoriesById = useMemo(() => {
    const map = new Map()
    ;(state.categories || []).forEach(c => map.set(c.id, c))
    return map
  }, [state.categories])

  const load = async (refresh = false) => {
    setState(prev => ({ ...prev, loading: true }))
    setError('')
    const data = await fetch(`/api/privacy${refresh ? '?refresh=1' : ''}`, { cache: 'no-store' })
      .then(r => r.json())
      .catch(err => ({ ok: false, error: err.message, cards: [], categories: [], transactions: [], fundingSources: [], summary: {} }))
    setState({ ...data, loading: false })
    if (data.error) setError(data.error)
    if (data.refreshError) setError(data.refreshError)
  }

  useEffect(() => { load(true) }, [])

  const flash = text => {
    setMessage(text)
    setTimeout(() => setMessage(''), 1800)
  }

  const run = async (name, fn) => {
    setBusy(name)
    setError('')
    try {
      await fn()
    } catch (err) {
      setError(err.message || 'Privacy action failed')
    } finally {
      setBusy('')
    }
  }

  const copyWebhook = async () => {
    if (!state.webhookUrl) return
    await navigator.clipboard?.writeText(state.webhookUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  const createCard = () => run('create_card', async () => {
    if (!cardForm.memo.trim()) throw new Error('Card memo is required')
    await postPrivacy({ action: 'create_card', card: cardForm })
    setCardForm(EMPTY_CARD)
    flash('Privacy card created')
    await load(true)
  })

  const createCategory = () => run('create_category', async () => {
    if (!categoryName.trim()) throw new Error('Category name is required')
    await postPrivacy({ action: 'create_category', category: { name: categoryName.trim() } })
    setCategoryName('')
    flash('Category created')
    await load(false)
  })

  const deleteCategory = category => run(`delete_category:${category.id}`, async () => {
    if (!confirm(`Delete category "${category.name}"? Cards will stay in Privacy and become uncategorized in CRM.`)) return
    await postPrivacy({ action: 'delete_category', id: category.id })
    flash('Category deleted')
    await load(false)
  })

  const assignCategory = (cardToken, categoryId) => run(`assign:${cardToken}`, async () => {
    await postPrivacy({ action: 'assign_category', cardToken, categoryId })
    await load(false)
  })

  const setCardState = (card, nextState) => run(`state:${card.token}`, async () => {
    await postPrivacy({ action: 'update_card_state', cardToken: card.token, state: nextState })
    flash(nextState === 'PAUSED' ? 'Card paused' : 'Card resumed')
    await load(true)
  })

  return (
    <div className="p-4 sm:p-5">
      {message && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--green)', color: 'var(--accent-text)' }}>
          {message}
        </div>
      )}

      <section className="rounded-xl mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 14 }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="rounded-lg flex items-center justify-center" style={{ width: 38, height: 38, background: 'var(--surface2)', color: 'var(--accent)' }}>
              <CreditCard size={19} />
            </div>
            <div>
              <h2 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 700, margin: 0 }}>Privacy.com</h2>
              <div style={{ color: 'var(--text-muted)', fontSize: 12.5, marginTop: 2 }}>
                {state.configured ? `${state.environment} API connected` : 'API key not stored yet'} - webhook ready
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => load(true)}
              title="Refresh Privacy data"
              aria-label="Refresh Privacy data"
              className="rounded-lg"
              style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <RefreshCcw size={16} />
            </button>
            <a
              href="https://app.privacy.com/account"
              target="_blank"
              rel="noopener noreferrer"
              title="Open Privacy account"
              aria-label="Open Privacy account"
              className="rounded-lg"
              style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>

        <div className="mt-4 grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <Metric label="Open cards" value={state.loading ? '...' : state.summary?.openCards || 0} />
          <Metric label="Paused cards" value={state.loading ? '...' : state.summary?.pausedCards || 0} />
          <Metric label="30d spend" value={state.loading ? '...' : fmtUSD(state.summary?.recentSpend)} />
          <Metric label="Declines" value={state.loading ? '...' : state.summary?.declinedCount || 0} />
        </div>

        <div className="mt-4">
          <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, marginBottom: 6 }}>Webhook URL</div>
          <div className="flex gap-2">
            <code className="flex-1 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', fontSize: 12, overflow: 'auto' }}>
              {state.webhookUrl || 'https://crm.company.example.com/api/privacy/transaction-webhook'}
            </code>
            <button
              onClick={copyWebhook}
              title="Copy webhook URL"
              aria-label="Copy webhook URL"
              className="rounded-lg"
              style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: copied ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              <Copy size={16} />
            </button>
          </div>
          {error && <div className="mt-2" style={{ color: 'var(--red)', fontSize: 12 }}>{error}</div>}
        </div>
      </section>

      <div className="command-segmented-control grid gap-1 p-1 rounded-lg mb-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        {[
          { id: 'cards', label: 'Cards' },
          { id: 'activity', label: 'Activity' },
          { id: 'categories', label: 'Categories' },
        ].map(item => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className="rounded-md transition"
            style={{
              padding: '7px 10px',
              minHeight: 34,
              fontSize: 13,
              fontWeight: 650,
              background: tab === item.id ? 'var(--accent)' : 'transparent',
              color: tab === item.id ? 'var(--accent-text)' : 'var(--text-muted)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'cards' && (
        <div className="grid gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]" style={{ alignItems: 'start' }}>
          <section className="rounded-xl lg:col-start-1 lg:row-start-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 14 }}>
            <div className="flex items-center gap-2 mb-3">
              <Plus size={17} style={{ color: 'var(--accent)' }} />
              <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>Create Card</h3>
            </div>
            <div className="grid gap-3">
              <label>
                <FieldLabel>Memo</FieldLabel>
                <input style={inputStyle} value={cardForm.memo} onChange={e => setCardForm(p => ({ ...p, memo: e.target.value }))} placeholder="Vendor or use case" />
              </label>
              <label>
                <FieldLabel>Cardholder name</FieldLabel>
                <input style={inputStyle} value={cardForm.cardholderName} onChange={e => setCardForm(p => ({ ...p, cardholderName: e.target.value }))} placeholder="Carl Farrington" />
              </label>
              <label>
                <FieldLabel>Category</FieldLabel>
                <select style={inputStyle} value={cardForm.categoryId} onChange={e => setCardForm(p => ({ ...p, categoryId: e.target.value }))}>
                  <option value="">Uncategorized</option>
                  {(state.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label>
                <FieldLabel>Type</FieldLabel>
                <select style={inputStyle} value={cardForm.type} onChange={e => setCardForm(p => ({ ...p, type: e.target.value }))}>
                  {CARD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label>
                <FieldLabel>Spend limit</FieldLabel>
                <input style={inputStyle} type="number" min="0" step="0.01" value={cardForm.spendLimit} onChange={e => setCardForm(p => ({ ...p, spendLimit: e.target.value }))} />
              </label>
              <label>
                <FieldLabel>Limit window</FieldLabel>
                <select style={inputStyle} value={cardForm.spendLimitDuration} onChange={e => setCardForm(p => ({ ...p, spendLimitDuration: e.target.value }))}>
                  {LIMIT_DURATIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label>
                <FieldLabel>Funding source</FieldLabel>
                <select style={inputStyle} value={cardForm.fundingToken} onChange={e => setCardForm(p => ({ ...p, fundingToken: e.target.value }))}>
                  <option value="">Default</option>
                  {(state.fundingSources || []).map(f => <option key={f.token} value={f.token}>{f.label}</option>)}
                </select>
              </label>
            </div>
            <button
              onClick={createCard}
              disabled={!state.configured || busy === 'create_card'}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-50"
              style={{ minHeight: 42, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', width: '100%' }}
            >
              <CreditCard size={16} /> {busy === 'create_card' ? 'Creating' : 'Create Privacy Card'}
            </button>
          </section>

          <section className="rounded-xl overflow-hidden lg:col-start-2 lg:row-start-1" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>Card Preview</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>2 samples</span>
            </div>
            <div className="grid gap-4 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 360px))', justifyContent: 'center', alignItems: 'start' }}>
              {SAMPLE_CARDS.map(card => <SampleCard key={card.token} card={card} />)}
            </div>
          </section>

          <section className="rounded-xl overflow-hidden lg:col-start-2 lg:row-start-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>Active Cards</h3>
              <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                {visibleCards.length} active{hiddenCardCount ? `, ${hiddenCardCount} hidden` : ''}
              </span>
            </div>
            {visibleCards.length === 0 ? (
              <EmptyState label={hiddenCardCount ? 'Closed and deleted Privacy cards are hidden.' : 'No Privacy cards synced yet.'} />
            ) : (
              <div className="grid gap-3 p-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 360px))', alignItems: 'start' }}>
                {visibleCards.map((card, index) => (
                  <CardRow
                    key={card.token}
                    card={card}
                    categories={state.categories || []}
                    category={categoriesById.get(card.categoryId)}
                    busy={busy}
                    onAssign={assignCategory}
                    onState={setCardState}
                    featured={index === 0}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'activity' && (
        <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>Recent Privacy Activity</h3>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Last webhook: {prettyDate(state.summary?.latestAt)}</span>
          </div>
          {(state.transactions || []).length === 0 ? (
            <EmptyState label="No Privacy transactions received yet." />
          ) : (
            <div>
              {(state.transactions || []).slice(0, 40).map(tx => (
                <div key={tx.token} className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
                  <div className="min-w-0">
                    <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.merchant?.descriptor || 'Privacy transaction'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2 }}>{shortToken(tx.token)}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 650 }}>{fmtUSD(Math.abs(tx.amount || tx.authorizationAmount || 0))}</div>
                    <div style={{ color: /declined|bounced/i.test(`${tx.status} ${tx.result}`) ? 'var(--red)' : 'var(--green)', fontSize: 12.5, fontWeight: 650 }}>{tx.status || tx.result || 'received'}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{prettyDate(tx.created)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'categories' && (
        <section className="rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 14 }}>
          <div className="flex items-center gap-2 mb-3">
            <Tag size={17} style={{ color: 'var(--accent)' }} />
            <h3 style={{ color: 'var(--text)', fontSize: 14, fontWeight: 700, margin: 0 }}>Categories</h3>
          </div>
          <div className="flex gap-2 mb-4">
            <input style={inputStyle} value={categoryName} onChange={e => setCategoryName(e.target.value)} placeholder="New category" />
            <button
              onClick={createCategory}
              disabled={busy === 'create_category' || !categoryName.trim()}
              title="Create category"
              aria-label="Create category"
              className="rounded-lg"
              style={{ width: 42, height: 38, display: 'grid', placeItems: 'center', background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', flexShrink: 0, opacity: busy === 'create_category' ? 0.6 : 1 }}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
            {(state.categories || []).map(category => (
              <div key={category.id} className="rounded-lg px-3 py-2 flex items-center justify-between gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="min-w-0 flex items-center gap-2">
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: category.color || 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ color: 'var(--text)', fontSize: 13, fontWeight: 650, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{category.name}</span>
                </div>
                <button
                  onClick={() => deleteCategory(category)}
                  title={`Delete ${category.name}`}
                  aria-label={`Delete ${category.name}`}
                  className="rounded-md"
                  style={{ width: 30, height: 30, display: 'grid', placeItems: 'center', background: 'transparent', color: 'var(--red)', border: 'none' }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function FieldLabel({ children }) {
  return <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, marginBottom: 5 }}>{children}</div>
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', padding: 12 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 21, fontWeight: 750, marginTop: 5 }}>{value}</div>
    </div>
  )
}

function EmptyState({ label }) {
  return <div className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</div>
}

function CardFace({ card, badge, showStatus = true }) {
  const state = cardState(card)
  const label = badge || (showStatus ? state || 'UNKNOWN' : '')
  return (
    <div
      className="relative overflow-hidden"
      style={{
        width: '100%',
        maxWidth: 360,
        margin: '0 auto',
        aspectRatio: '1.58 / 1',
        borderRadius: 14,
        background: 'linear-gradient(135deg, #050607 0%, #11151b 58%, #050607 100%)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08)',
        padding: 18,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <img src="/brand/fd-card-logo.png" alt="Farrington Development" style={{ width: 'min(72%, 230px)', height: 'auto', objectFit: 'contain' }} />
        {label ? (
          <span className="rounded-full px-2 py-0.5" style={{ background: state === 'OPEN' || badge ? 'rgba(25, 195, 125, 0.16)' : 'rgba(255,255,255,0.08)', color: state === 'OPEN' || badge ? '#62d89d' : '#b8c0cc', fontSize: 10, fontWeight: 800, letterSpacing: 0 }}>
            {label}
          </span>
        ) : null}
      </div>
      <div style={{ position: 'absolute', left: 18, right: 18, bottom: 18 }}>
        <div style={{ color: 'rgba(255,255,255,0.92)', fontSize: 20, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', letterSpacing: 0 }}>
          {cardNumberDisplay(card)}
        </div>
        <div className="mt-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0 }}>Cardholder</div>
            <div style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 800, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', letterSpacing: 0, textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {card.cardholderName || 'Carl Farrington'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.54)', fontSize: 10, fontWeight: 700, letterSpacing: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              Farrington Development LLC
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.48)', fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0 }}>Exp</div>
            <div style={{ color: 'rgba(255,255,255,0.86)', fontSize: 12, fontWeight: 800, letterSpacing: 0 }}>{expDisplay(card)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function SampleCard({ card }) {
  return (
    <figure style={{ width: '100%', maxWidth: 360, margin: 0 }}>
      <CardFace card={card} showStatus={false} />
      <figcaption className="mt-2">
        <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 700 }}>{card.memo}</div>
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
          {card.lastFour ? `Card *${card.lastFour}` : shortToken(card.token)} - {card.type || 'card'} - {fmtUSD(card.spendLimit)} {String(card.spendLimitDuration || '').toLowerCase()}
        </div>
      </figcaption>
    </figure>
  )
}

function CardRow({ card, categories, category, busy, onAssign, onState }) {
  const state = cardState(card)
  const paused = state === 'PAUSED'
  const stateBusy = busy === `state:${card.token}`
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="p-4" style={{ background: '#050607' }}>
        <CardFace card={card} />
      </div>
      <div className="px-4 pb-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div style={{ color: 'var(--text)', fontSize: 13.5, fontWeight: 700 }}>{card.memo || 'Privacy card'}</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>
              {card.lastFour ? `Card *${card.lastFour}` : shortToken(card.token)} - {card.type || 'card'} - {fmtUSD(card.spendLimit)} {String(card.spendLimitDuration || '').toLowerCase()}
            </div>
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={() => onState(card, paused ? 'OPEN' : 'PAUSED')}
            disabled={stateBusy || state === 'CLOSED'}
            title={paused ? 'Resume card' : 'Pause card'}
            aria-label={paused ? 'Resume card' : 'Pause card'}
            className="rounded-lg"
            style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', background: 'var(--surface2)', color: paused ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)', opacity: stateBusy ? 0.6 : 1 }}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
          </div>
        </div>
        <div className="mt-3 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <label>
            <FieldLabel>Category</FieldLabel>
            <select style={inputStyle} value={card.categoryId || ''} onChange={e => onAssign(card.token, e.target.value)}>
              <option value="">Uncategorized</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <div>
            <FieldLabel>Funding</FieldLabel>
            <div className="rounded-lg px-3 flex items-center" style={{ minHeight: 38, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
              {card.funding?.nickname || card.funding?.accountName || (card.funding?.lastFour ? `*${card.funding.lastFour}` : 'Default')}
            </div>
          </div>
          <div>
            <FieldLabel>Assigned</FieldLabel>
            <div className="rounded-lg px-3 flex items-center gap-2" style={{ minHeight: 38, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: category?.color || 'var(--border)', flexShrink: 0 }} />
              {category?.name || 'Uncategorized'}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
