'use client'

import { useEffect, useMemo, useState } from 'react'
import { CircleDollarSign, MailPlus, PauseCircle, RefreshCw, Save } from 'lucide-react'
import PageHeader from '../../components/PageHeader'
import { FinanceCsvExportButton } from '../../finance/FinanceImportButton'
import { PlatformActionConfirmDialog } from '../../platforms/PlatformAdminWorkspace'

function money(value, currency = 'USD') {
  if (value === 'unknown') return 'unknown'
  if (currency === 'MIXED') return `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} mixed`
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: currency === 'MIXED' ? 'USD' : currency, maximumFractionDigits: 2 })
}

function Metric({ label, value, detail }) {
  return <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div className="text-xs uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{label}</div><div className="mt-1 text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>{detail && <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</div>}</div>
}

function parseOrcaEmail(result, fallbackSubject) {
  const text = String(result || '').trim()
  const subjectMatch = text.match(/^Subject:\s*(.+)$/im)
  return { subject: subjectMatch?.[1]?.trim() || fallbackSubject, html: text.replace(/^Subject:\s*.+\r?\n*/im, '').trim().replaceAll('\n', '<br/>') }
}

function handoffPayload(candidate, template) {
  const replace = value => String(value || '').replaceAll('{company}', candidate.clientName || 'your team').replaceAll('{contact}', candidate.clientName || 'there').replaceAll('{brand}', candidate.productName || 'Farrington Development')
  const subject = replace(template?.subject || 'Payment method update for {company}')
  const body = replace(template?.body || 'Hi {contact},\n\nPlease update the payment method for {company}.')
  return {
    action: 'start', fromAgentId: 'money-console', complexity: 'light', outputFormat: 'email subject and body', wait: 120,
    task: 'Draft only a concise, courteous failed-payment email from the supplied template. Never send it. Carl must approve it in Comms.',
    context: `Product: ${candidate.productName}\nCustomer: ${candidate.clientName}\nRecipient: ${candidate.email || 'Unknown'}\nPayment failed: ${candidate.failedAt}\nTemplate subject: ${subject}\nTemplate body:\n${body}`,
  }
}

export default function MoneyConsole() {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7))
  const [snapshot, setSnapshot] = useState(null)
  const [settings, setSettings] = useState({ dunningProposalDays: 7 })
  const [busy, setBusy] = useState(false)
  const [actionBusy, setActionBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pauseProposal, setPauseProposal] = useState(null)

  const load = async (refresh = false) => {
    setBusy(true); setError('')
    try {
      const response = await fetch(`/api/ops/money?period=${encodeURIComponent(period)}${refresh ? '&refresh=1' : ''}`, { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error || 'Money Console could not load.')
      setSnapshot(body.snapshot); setSettings(body.settings || { dunningProposalDays: 7 })
    } catch (loadError) { setError(loadError?.message || 'Money Console could not load.') }
    finally { setBusy(false) }
  }

  useEffect(() => { load() }, [period]) // eslint-disable-line react-hooks/exhaustive-deps

  const csv = useMemo(() => {
    if (!snapshot) return ''
    const header = 'period,product_id,product_name,currency,mrr,new_mrr,churned_mrr,failed_payments,trials_started,trials_converted,attributed_cost_usd,margin_usd'
    const cell = value => /[",\r\n]/.test(String(value ?? '')) ? `"${String(value ?? '').replaceAll('"', '""')}"` : String(value ?? '')
    return [header, ...(snapshot.products || []).map(product => { const unavailable = product.available === false ? 'unknown' : null; return [snapshot.periodKey, product.productId, product.name, product.currency, unavailable ?? product.mrr, unavailable ?? product.newMrr, unavailable ?? product.churnedMrr, unavailable ?? product.failedPayments, unavailable ?? (product.trials?.started || 0), unavailable ?? (product.trials?.converted || 0), product.attributedCostUsd, unavailable ?? product.marginUsd].map(cell).join(',') })].join('\n')
  }, [snapshot])

  const saveSettings = async () => {
    setActionBusy('settings'); setError('')
    try {
      const response = await fetch('/api/ops/money', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dunningProposalDays: Number(settings.dunningProposalDays) }) })
      const body = await response.json()
      if (!response.ok || !body.ok) throw new Error(body.error || 'Setting could not be saved.')
      setSettings(body.settings); setNotice('Dunning proposal setting saved.')
    } catch (saveError) { setError(saveError?.message || 'Setting could not be saved.') }
    finally { setActionBusy('') }
  }

  const draftDunning = async candidate => {
    setActionBusy(`${candidate.id}:draft`); setError(''); setNotice('')
    try {
      const templates = (await (await fetch('/api/email-templates', { cache: 'no-store' })).json()).templates || []
      const template = templates.find(row => /payment|dunning/i.test(`${row.name} ${row.subject}`)) || templates[0] || {}
      const handoffResponse = await fetch('/api/agent/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(handoffPayload(candidate, template)) })
      const handoff = await handoffResponse.json()
      const result = handoff.run?.result || handoff.result
      if (!handoffResponse.ok || !result) throw new Error(handoff.error || 'Orca did not return a draft.')
      const drafted = parseOrcaEmail(result, String(template.subject || 'Payment method update').replaceAll('{company}', candidate.clientName || 'Customer'))
      const localResponse = await fetch('/api/comms-local', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_draft', source: 'money-console', approvalRequired: true, candidateId: candidate.id, to: candidate.email, subject: drafted.subject, html: drafted.html }) })
      const local = await localResponse.json()
      if (!localResponse.ok || !local.draft) throw new Error(local.error || 'Draft could not be staged in Comms.')
      setNotice(`Draft staged in Comms for ${candidate.clientName}. Nothing was sent.`)
    } catch (draftError) { setError(draftError?.message || 'Dunning draft failed.') }
    finally { setActionBusy('') }
  }

  const portfolio = snapshot?.portfolio
  return <div className="command-workspace p-6">
    <PageHeader icon={<CircleDollarSign size={20} />} title="Money Console" subtitle="Portfolio subscriptions, trial movement, failed payments, and attributed margin" actions={<div className="flex gap-2"><FinanceCsvExportButton csv={csv} filename={`money-console-${period}.csv`} label="Export Money Console CSV for Finance" /><button type="button" onClick={() => load(true)} aria-label="Refresh Money Console" data-tooltip="Refresh" className="rounded-lg p-2 inline-flex items-center justify-center" style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}><RefreshCw size={16} className={busy ? 'animate-spin' : ''} /></button></div>} />
    <div className="mb-4 flex flex-wrap items-end gap-3">
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Period<input type="month" value={period} onChange={event => setPeriod(event.target.value)} className="mt-1 block rounded-lg px-3 py-2" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} /></label>
      <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Pause proposal after days<input aria-label="Pause proposal after days" type="number" min="1" max="90" value={settings.dunningProposalDays} onChange={event => setSettings(current => ({ ...current, dunningProposalDays: event.target.value }))} className="mt-1 block w-28 rounded-lg px-3 py-2" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }} /></label>
      <button type="button" disabled={actionBusy === 'settings'} onClick={saveSettings} aria-label="Save dunning proposal setting" className="rounded-lg p-2 inline-flex items-center justify-center disabled:opacity-50" style={{ width: 44, height: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}><Save size={16} /></button>
    </div>
    {error && <div role="alert" className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)' }}>{error}</div>}
    {notice && <div className="mb-4 rounded-lg p-3 text-sm" style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>{notice}</div>}
    {portfolio && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="Portfolio MRR" value={money(portfolio.mrr, portfolio.currency)} /><Metric label="New MRR" value={money(portfolio.newMrr, portfolio.currency)} /><Metric label="Churned MRR" value={money(portfolio.churnedMrr, portfolio.currency)} /><Metric label="Failed payments" value={portfolio.failedPayments} /><Metric label="Trial funnel" value={`${portfolio.trials.converted}/${portfolio.trials.started}`} detail="converted / started" /><Metric label="Margin" value={money(portfolio.marginUsd, portfolio.currency)} detail={portfolio.marginUnknown ? 'One or more model prices are unknown.' : `Cost ${money(portfolio.attributedCostUsd)}`} /></div>
      <div className="mt-6 overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}><table className="w-full text-sm"><thead style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}><tr>{['Product', 'MRR', 'New', 'Churned', 'Failed', 'Trials', 'Cost', 'Margin'].map(label => <th key={label} className="px-4 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{snapshot.products.map(product => { const unavailable = product.available === false; return <tr key={product.productId} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}><td className="px-4 py-3"><div className="font-semibold">{product.name}</div>{unavailable && <div className="text-xs" style={{ color: 'var(--amber)' }}>{product.error}</div>}</td><td className="px-4 py-3">{unavailable ? 'unknown' : money(product.mrr, product.currency)}</td><td className="px-4 py-3">{unavailable ? 'unknown' : money(product.newMrr, product.currency)}</td><td className="px-4 py-3">{unavailable ? 'unknown' : money(product.churnedMrr, product.currency)}</td><td className="px-4 py-3">{unavailable ? 'unknown' : product.failedPayments}</td><td className="px-4 py-3">{unavailable ? 'unknown' : `${product.trials.converted}/${product.trials.started}`}</td><td className="px-4 py-3">{money(product.attributedCostUsd)}</td><td className="px-4 py-3">{unavailable ? 'unknown' : money(product.marginUsd, product.currency)}</td></tr> })}</tbody></table></div>
      {snapshot.clients?.length > 0 && <div className="mt-6"><h2 className="mb-2 text-lg font-semibold" style={{ color: 'var(--text)' }}>Client attribution</h2><div className="overflow-x-auto rounded-xl" style={{ border: '1px solid var(--border)' }}><table className="w-full text-sm"><thead style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}><tr>{['Client', 'Known MRR', 'Attributed cost', 'Margin'].map(label => <th key={label} className="px-4 py-3 text-left font-medium">{label}</th>)}</tr></thead><tbody>{snapshot.clients.map(client => <tr key={client.clientId} style={{ borderTop: '1px solid var(--border)', color: 'var(--text)' }}><td className="px-4 py-3 font-semibold">{client.name || client.clientId}</td><td className="px-4 py-3">{money(client.revenueUsd)}</td><td className="px-4 py-3">{money(client.attributedCostUsd)}</td><td className="px-4 py-3">{money(client.marginUsd)}</td></tr>)}</tbody></table></div></div>}
      <section className="mt-6"><h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Failed-payment drafts</h2><p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Orca drafts from editable email templates. Drafts wait in Comms for Carl; this screen never sends.</p><div className="mt-3 grid gap-3">{snapshot.dunningCandidates?.length ? snapshot.dunningCandidates.map(candidate => <div key={candidate.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><div><div className="font-semibold" style={{ color: 'var(--text)' }}>{candidate.clientName}</div><div className="text-xs" style={{ color: 'var(--text-muted)' }}>{candidate.productName} · failed {new Date(candidate.failedAt).toLocaleDateString()} · {candidate.email || 'email unavailable'}</div></div><div className="flex gap-2"><button type="button" onClick={() => draftDunning(candidate)} disabled={!candidate.email || Boolean(actionBusy)} aria-label={`Draft failed-payment email for ${candidate.clientName}`} data-tooltip="Draft in Comms" className="rounded-lg p-2 inline-flex items-center justify-center disabled:opacity-50" style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}><MailPlus size={17} /></button>{candidate.pauseProposed && <button type="button" onClick={() => setPauseProposal(candidate)} aria-label={`Propose pause subscription for ${candidate.clientName}`} data-tooltip="Propose pause" className="rounded-lg p-2 inline-flex items-center justify-center" style={{ width: 40, height: 40, background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)' }}><PauseCircle size={17} /></button>}</div></div>) : <div className="rounded-xl p-4 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>No identified failed-payment records for this period.</div>}</div></section>
    </>}
    {pauseProposal && <PlatformActionConfirmDialog platformId={pauseProposal.platformId} action="pause_subscription" targetId={pauseProposal.targetId} targetLabel={pauseProposal.clientName} onDone={message => { setPauseProposal(null); setNotice(`${message} The audited action ran only after your confirmation.`) }} onClose={() => setPauseProposal(null)} />}
  </div>
}
