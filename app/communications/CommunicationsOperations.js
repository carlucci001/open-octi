'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, ExternalLink, Phone, RefreshCw, Sparkles, X } from 'lucide-react'

const dollars = (value, currency = 'USD') => value == null ? 'Not reported' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)

export default function CommunicationsOperations({ onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = async () => { setLoading(true); try { const response = await fetch('/api/communications/operations', { cache: 'no-store' }); setData(await response.json()) } finally { setLoading(false) } }
  useEffect(() => { load() }, [])
  const twilio = data?.twilio || { lines: [] }
  const eleven = data?.elevenlabs || {}
  const unassigned = (twilio.lines || []).filter(line => !line.assigned).length

  return <section className="mb-4 rounded-xl p-3 sm:p-5" aria-label="Communications costs and lines" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>Costs & Lines</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Provider-reported billing and CRM ownership, refreshed {data?.fetchedAt ? new Date(data.fetchedAt).toLocaleString() : 'on demand'}.</p></div>
      <div className="flex gap-1"><button type="button" onClick={load} aria-label="Refresh provider data" title="Refresh" className="flex size-11 items-center justify-center rounded-lg" style={{ border: '1px solid var(--border)' }}><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button><button type="button" onClick={onClose} aria-label="Close costs and lines" title="Close" className="flex size-11 items-center justify-center rounded-lg" style={{ border: '1px solid var(--border)' }}><X size={18} /></button></div>
    </div>
    <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Twilio month to date" value={twilio.ok ? dollars(twilio.monthToDate, twilio.currency) : 'Unavailable'} note="Provider reported · account total" />
      <Metric label="Twilio lines" value={(twilio.lines || []).length} note={`${unassigned} unassigned internally`} alert={unassigned > 0} />
      <Metric label="ElevenLabs next invoice" value={eleven.ok ? dollars(eleven.nextInvoice, eleven.currency) : 'Unavailable'} note="Provider reported when available" />
      <Metric label="ElevenLabs quota" value={eleven.percentUsed == null ? 'Not reported' : `${eleven.percentUsed}%`} note={`${(eleven.charactersUsed || 0).toLocaleString()} of ${(eleven.characterLimit || 0).toLocaleString()} characters`} alert={eleven.percentUsed >= 75} />
    </div>
    <div className="grid gap-4 xl:grid-cols-2">
      <Provider title="Twilio lines" Icon={Phone} href="https://console.twilio.com/us1/develop/phone-numbers/manage/incoming">
        {twilio.warning && <Warning text={twilio.warning} />}
        <div className="space-y-2">{(twilio.lines || []).map(line => <div key={line.sid} className="grid gap-1 rounded-lg p-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div><div className="font-semibold" style={{ color: 'var(--text)' }}>{line.phoneNumber}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{line.friendlyName || 'Twilio line'}</div></div>
          <div className="text-sm"><div style={{ color: line.assigned ? 'var(--text)' : 'var(--amber)' }}>{line.company || 'Unassigned line'}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{line.agent || 'No CRM agent'}</div></div>
          <span className="w-fit rounded-full px-2 py-1 text-xs font-semibold" style={{ background: line.assigned ? 'var(--green-soft)' : 'var(--amber-soft)', color: line.assigned ? 'var(--green)' : 'var(--amber)' }}>{line.assigned ? 'Assigned' : 'Review'}</span>
        </div>)}</div>
        {!loading && twilio.ok && !(twilio.lines || []).length && <p className="py-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No Twilio lines found.</p>}
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>Line-level dollar attribution is not supplied by this summary. The account total is exact; line allocation remains unallocated until detailed call and message records are reconciled.</p>
      </Provider>
      <Provider title="ElevenLabs usage" Icon={Sparkles} href="https://elevenlabs.io/app/subscription">
        {eleven.warning && <Warning text={eleven.warning} />}
        <div className="space-y-2 text-sm">
          <Row label="Plan" value={eleven.plan || 'Not reported'} />
          <Row label="Characters" value={`${(eleven.charactersUsed || 0).toLocaleString()} / ${(eleven.characterLimit || 0).toLocaleString()}`} />
          <Row label="Current overage" value={dollars(eleven.currentOverage, eleven.currency)} />
          <Row label="Open invoices" value={eleven.openInvoices ?? 'Not reported'} />
          <Row label="Next reset" value={eleven.nextReset ? new Date(eleven.nextReset).toLocaleDateString() : 'Not reported'} />
        </div>
        <p className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>Only amounts returned by ElevenLabs are shown as billing. CRM conversation counts and minutes are operational estimates, not invoice totals.</p>
      </Provider>
    </div>
  </section>
}

function Metric({ label, value, note, alert }) { return <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: `1px solid ${alert ? 'var(--amber)' : 'var(--border)'}` }}><div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</div><div className="mt-1 text-xl font-bold" style={{ color: 'var(--text)' }}>{value}</div><div className="mt-1 text-xs" style={{ color: alert ? 'var(--amber)' : 'var(--text-muted)' }}>{note}</div></div> }
function Provider({ title, Icon, href, children }) { return <section className="rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="mb-3 flex items-center gap-2"><Icon size={18} style={{ color: 'var(--accent)' }} /><h3 className="font-bold" style={{ color: 'var(--text)' }}>{title}</h3><a href={href} target="_blank" rel="noreferrer" className="ml-auto flex min-h-11 items-center gap-1 px-2 text-xs font-semibold" style={{ color: 'var(--accent)' }}>Provider <ExternalLink size={13} /></a></div>{children}</section> }
function Warning({ text }) { return <div className="mb-3 flex gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}><AlertTriangle size={17} className="shrink-0" />{text}</div> }
function Row({ label, value }) { return <div className="flex items-center justify-between gap-3 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><span style={{ color: 'var(--text-muted)' }}>{label}</span><strong className="text-right" style={{ color: 'var(--text)' }}>{value}</strong></div> }
