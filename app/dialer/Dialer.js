'use client'
import { useState, useEffect, useMemo, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import { formatPhone } from '@/lib/google-voice'

const RECENTS_KEY = 'fcc-recent-calls'

function loadRecents() {
  try { return JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]') } catch { return [] }
}
function saveRecents(list) {
  try { localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, 20))) } catch {}
}

function initials(name = '') {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
}

const KEY_ROWS = [
  [{ d: '1', s: '' }, { d: '2', s: 'ABC' }, { d: '3', s: 'DEF' }],
  [{ d: '4', s: 'GHI' }, { d: '5', s: 'JKL' }, { d: '6', s: 'MNO' }],
  [{ d: '7', s: 'PQRS' }, { d: '8', s: 'TUV' }, { d: '9', s: 'WXYZ' }],
  [{ d: '*', s: '' }, { d: '0', s: '+' }, { d: '#', s: '' }],
]

function KeypadButton({ digit, sub, onPress }) {
  const isSpecial = digit === '*' || digit === '#'
  return (
    <button onClick={() => onPress(digit)}
      className="flex h-14 flex-col items-center justify-center rounded-full transition-all active:scale-95 sm:h-16"
      style={{
        width: '100%',
        minWidth: 0,
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent-soft)'; e.currentTarget.style.borderColor = 'var(--accent)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)' }}>
      <div className="text-2xl font-bold" style={{ lineHeight: 1, fontFamily: "'Outfit', sans-serif", color: isSpecial ? 'var(--accent)' : 'var(--text)' }}>{digit}</div>
      {sub && <div className="text-[9px] font-semibold tracking-widest mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </button>
  )
}

export default function Dialer({ compact = false } = {}) {
  const [digits, setDigits] = useState('')
  const [clients, setClients] = useState([])
  const [leads, setLeads] = useState([])
  const [sponsors, setSponsors] = useState([])
  const [search, setSearch] = useState('')
  const [recents, setRecents] = useState([])
  const [callState, setCallState] = useState('idle') // idle | connecting | ringing | in-call | held | error
  const [callError, setCallError] = useState('')
  const [outboundLines, setOutboundLines] = useState([])
  const [fromNumber, setFromNumber] = useState('')
  const [activeCallName, setActiveCallName] = useState('')
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const confRef = useRef(null)

  useEffect(() => {
    setRecents(loadRecents())
    const refresh = () => Promise.all([
      fetch('/api/contacts').then(r => r.json()).catch(() => ({ contacts: [] })),
      fetch('/api/accounts').then(r => r.json()).catch(() => ({ accounts: [] })),
      fetch('/api/leads').then(r => r.json()).catch(() => ({ leads: [] })),
    ]).then(([c, a, l]) => {
      // Build a contact-style list from accounts+contacts: each contact shows its account in meta
      const accountsById = new Map((a.accounts || []).map(x => [x.id, x]))
      const contactList = (c.contacts || []).map(ct => ({
        ...ct,
        accountName: ct.accountId ? accountsById.get(ct.accountId)?.name : null,
      }))
      setClients(contactList)         // reuse the existing "clients" state for contacts
      setLeads(l.leads || [])
      setSponsors([])                  // unified — all leads live in leads now
    })
    refresh()
    const id = setInterval(refresh, 30000)
    fetch('/api/twilio/lines').then(r => r.json()).then(data => {
      const lines = data.lines || []
      setOutboundLines(lines)
      setFromNumber(current => current || data.defaultNumber || lines[0]?.phoneNumber || '')
    }).catch(() => {})
    return () => clearInterval(id)
  }, [])

  // Keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.target?.tagName === 'INPUT') return
      if (/^[0-9*#]$/.test(e.key)) setDigits(d => d + e.key)
      else if (e.key === '+' && digits === '') setDigits('+')
      else if (e.key === 'Backspace') setDigits(d => d.slice(0, -1))
      else if (e.key === 'Enter' && digits) call(digits)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [digits])

  const press = (k) => setDigits(d => d + k)
  const backspace = () => setDigits(d => d.slice(0, -1))
  const clearAll = () => setDigits('')

  const call = async (numberToCall, nameToCall = '') => {
    if (!numberToCall) return
    // Save to recents
    const now = Date.now()
    const entry = { number: numberToCall, name: nameToCall, at: now }
    const filtered = recents.filter(r => r.number.replace(/\D/g, '') !== numberToCall.replace(/\D/g, ''))
    const next = [entry, ...filtered].slice(0, 20)
    setRecents(next)
    saveRecents(next)

    // In-browser call via Twilio Voice SDK (audio through computer mic/speakers)
    setCallState('connecting')
    setCallError('')
    try {
      const { Device } = await import('@twilio/voice-sdk')
      const tokenRes = await fetch('/api/twilio/token').then(r => r.json())
      if (tokenRes.error) throw new Error(tokenRes.error)
      const device = new Device(tokenRes.token, { codecPreferences: ['opus', 'pcmu'] })
      deviceRef.current = device
      const confName = 'ff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      confRef.current = confName
      const connection = await device.connect({ params: { To: numberToCall, Conf: confName, FromNumber: fromNumber } })
      callRef.current = connection
      setActiveCallName(nameToCall || numberToCall)
      setCallState('ringing')
      connection.on('accept', () => setCallState('in-call'))
      connection.on('disconnect', () => { setCallState('idle'); callRef.current = null; confRef.current = null; try { device.destroy() } catch {} })
      connection.on('cancel', () => { setCallState('idle'); callRef.current = null; confRef.current = null })
      connection.on('reject', () => { setCallState('error'); setCallError('Rejected'); callRef.current = null; confRef.current = null })
      connection.on('error', (err) => { setCallState('error'); setCallError(err?.message || 'call error'); callRef.current = null; confRef.current = null })
    } catch (e) {
      setCallState('error')
      setCallError(e?.message || 'Failed to start call')
      setTimeout(() => { setCallState('idle'); setCallError('') }, 5000)
    }
  }

  const hangup = () => {
    try { callRef.current?.disconnect() } catch {}
    if (confRef.current) {
      const conf = confRef.current
      fetch('/api/twilio/hangup-conf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf }),
      }).catch(() => {})
    }
    callRef.current = null
    confRef.current = null
    setCallState('idle')
  }

  const toggleHold = async () => {
    if (!confRef.current) return
    const holdNow = callState !== 'held'
    try {
      const r = await fetch('/api/twilio/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conf: confRef.current, hold: holdNow }),
      }).then(res => res.json())
      if (r.ok) setCallState(holdNow ? 'held' : 'in-call')
      else { setCallError(r.error || 'Hold failed'); setTimeout(() => setCallError(''), 4000) }
    } catch (e) {
      setCallError(e.message); setTimeout(() => setCallError(''), 4000)
    }
  }

  // Build unified contact list
  const contacts = useMemo(() => {
    const out = []
    // "clients" state now holds Contacts (from /api/contacts) — each with accountName in meta
    for (const c of clients) if (c.phone) out.push({ id: 'c_' + c.id, name: c.name, phone: c.phone, kind: 'contact', label: 'Contact', meta: c.accountName || c.email })
    for (const l of leads) {
      if (!l.phone) continue
      const label = (l.suggestedPipelineId || '').replace(/_/g, ' ') || 'Lead'
      out.push({
        id: 'l_' + l.id,
        name: l.businessName || l.name || 'Lead',
        phone: l.phone,
        kind: 'lead',
        label: label.charAt(0).toUpperCase() + label.slice(1),
        meta: l.name && l.businessName ? l.name : undefined,
      })
    }
    return out.sort((a, b) => a.name.localeCompare(b.name))
  }, [clients, leads, sponsors])

  const filteredContacts = useMemo(() => {
    if (!search.trim()) return contacts.slice(0, 30)
    const q = search.toLowerCase()
    return contacts.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.meta || '').toLowerCase().includes(q)
    ).slice(0, 30)
  }, [contacts, search])

  const displayNumber = formatPhone(digits) || digits
  const cleanDigits = digits.replace(/\D/g, '')
  const canCall = cleanDigits.length >= 7

  return (
    <div className={compact ? "" : "p-6"}>
      {!compact && <PageHeader
        icon="📞"
        title="Dialer"
        subtitle="Place browser-assisted calls with your connected provider"
      />}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Contact / recents sidebar */}
        <div className="order-2 lg:order-1 lg:col-span-2 rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxHeight: 520 }}>
          <div className="p-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search clients, leads, sponsors..."
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} />
          </div>

          <div className="flex-1 overflow-auto">
            {recents.length > 0 && !search && (
              <>
                <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest flex items-center justify-between" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>
                  <span>Recent</span>
                  <button className="text-[10px] opacity-60 hover:opacity-100" onClick={() => { setRecents([]); saveRecents([]) }}>Clear</button>
                </div>
                {recents.slice(0, 5).map((r, i) => (
                  <button key={i} onClick={() => call(r.number, r.name)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left"
                    style={{ borderBottom: '1px solid var(--border)' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px]"
                      style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                      {r.name ? initials(r.name) : '📞'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{r.name || formatPhone(r.number)}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{formatPhone(r.number)}</div>
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(r.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  </button>
                ))}
              </>
            )}

            <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>
              Contacts {search ? `(${filteredContacts.length} match${filteredContacts.length !== 1 ? 'es' : ''})` : `(${contacts.length})`}
            </div>

            {filteredContacts.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                {search ? 'No contacts match.' : 'No contacts with phone numbers yet.'}
              </div>
            ) : (
              filteredContacts.map(c => (
                <button key={c.id} onClick={() => call(c.phone, c.name)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left group"
                  style={{ borderBottom: '1px solid var(--border)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px]"
                    style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                    {initials(c.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                    <div className="text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                      {formatPhone(c.phone)} · {c.label}{c.meta ? ` · ${c.meta}` : ''}
                    </div>
                  </div>
                  <span className="text-[10px] opacity-0 group-hover:opacity-100 px-2 py-1 rounded-full font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)' }}>Call</span>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Dialpad */}
        <div className="order-1 lg:order-2 lg:col-span-3 rounded-xl p-3 sm:p-6 flex flex-col items-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="mb-3 w-full max-w-sm">
            <label htmlFor="outbound-line" className="mb-1 block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Call from</label>
            <select id="outbound-line" value={fromNumber} onChange={event => setFromNumber(event.target.value)} disabled={callState !== 'idle' || outboundLines.length === 0} className="min-h-11 w-full rounded-lg px-3 text-sm font-semibold outline-none" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {outboundLines.length === 0 && <option value="">Default Twilio line</option>}
              {outboundLines.map(line => <option key={line.sid} value={line.phoneNumber}>{formatPhone(line.phoneNumber)} · {line.company || line.friendlyName || 'Twilio line'}{line.agent ? ` · ${line.agent}` : ''}</option>)}
            </select>
          </div>
          {/* Number display */}
          <div className="w-full max-w-sm mb-3 sm:mb-5">
            <div className="rounded-lg px-4 py-2 flex items-center justify-center min-h-14 sm:min-h-[72px] text-center"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="font-mono font-bold tracking-wider" style={{
                color: digits ? 'var(--text)' : 'var(--text-muted)',
                fontSize: digits.length > 12 ? 20 : digits.length > 8 ? 26 : 30,
                letterSpacing: '0.02em',
              }}>
                {digits ? displayNumber : 'Enter number'}
              </div>
            </div>
            {digits.length > 0 && digits.length < 7 && (
              <div className="text-center text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
                {7 - digits.length} more digit{7 - digits.length !== 1 ? 's' : ''} to enable call
              </div>
            )}
          </div>

          {/* Keypad — responsive 3x4 grid, square keys, centered */}
          <div className="grid gap-2 mb-4 sm:gap-2.5 sm:mb-6 mx-auto w-full" style={{ maxWidth: 220, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
            {KEY_ROWS.map(row => (
              row.map(k => <KeypadButton key={k.d} digit={k.d} sub={k.s} onPress={press} />)
            ))}
          </div>

          {/* Action bar */}
          <div className="flex items-center gap-3 w-full max-w-sm">
            <button onClick={backspace} disabled={!digits}
              className="px-4 py-3 rounded-xl text-sm font-medium disabled:opacity-30"
              data-tooltip="Backspace"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minWidth: 60 }}>
              ⌫
            </button>
            {callState === 'idle' || callState === 'error' ? (
              <button onClick={() => call(digits)} disabled={!canCall}
                className="flex-1 py-3 rounded-xl text-sm font-bold disabled:opacity-30 flex items-center justify-center gap-2"
                style={{ background: canCall ? 'var(--green)' : 'var(--surface2)', color: canCall ? 'var(--accent-text)' : 'var(--text-muted)', border: canCall ? 'none' : '1px solid var(--border)' }}>
                {callState === 'error' ? `⚠ ${callError}` : `📞 Call ${digits ? displayNumber : ''}`}
              </button>
            ) : (
              <>
                <button onClick={hangup}
                  className="flex-1 py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
                  style={{ background: callState === 'held' ? 'var(--amber)' : 'var(--red)', color: 'var(--accent-text)', border: 'none' }}>
                  {callState === 'connecting' && '📞 Connecting...'}
                  {callState === 'ringing' && `📞 Ringing ${activeCallName}... · Hang up`}
                  {callState === 'in-call' && `📞 On call with ${activeCallName} · Hang up`}
                  {callState === 'held' && `⏸ On HOLD · ${activeCallName} · Hang up`}
                </button>
                {(callState === 'in-call' || callState === 'held') && (
                  <button onClick={toggleHold}
                    className="px-4 py-3 rounded-xl text-sm font-medium"
                    style={{ background: callState === 'held' ? 'var(--amber)' : 'var(--surface2)', color: callState === 'held' ? 'var(--accent-text)' : 'var(--text)', border: '1px solid var(--border)', minWidth: 80 }}>
                    {callState === 'held' ? '▶ Resume' : '⏸ Hold'}
                  </button>
                )}
              </>
            )}
            {digits && (
              <button onClick={clearAll}
                className="px-4 py-3 rounded-xl text-sm font-medium"
                data-tooltip="Clear"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minWidth: 60 }}>
                ✕
              </button>
            )}
          </div>

          <div className="mt-5 text-[11px] text-center max-w-sm" style={{ color: 'var(--text-muted)' }}>
            Tip: type digits on your keyboard (numbers, <kbd style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>*</kbd>, <kbd style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>#</kbd>). Press <kbd style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>Enter</kbd> to call, <kbd style={{ background: 'var(--surface2)', padding: '1px 5px', borderRadius: 3, border: '1px solid var(--border)' }}>Backspace</kbd> to delete.
          </div>
        </div>
      </div>
    </div>
  )
}
