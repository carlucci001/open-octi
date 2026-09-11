'use client'

import { useState } from 'react'
import { Copy } from 'lucide-react'

const fieldStyle = { width: '100%', minHeight: 44, padding: '8px 10px', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }
const storefrontOptions = [['farrington-development', 'Your organization'], ['octi-cc', 'Octi CC']]
export function StorefrontFields({ value = [], onChange }) {
  return <fieldset className="grid gap-2 text-xs" style={{ color: 'var(--text)' }}>
    <legend className="font-semibold">Storefronts</legend>
    <div className="flex flex-wrap gap-4">{storefrontOptions.map(([id, name]) => <label key={id} className="flex gap-2 items-center min-h-11">
      <input type="checkbox" checked={value.includes(id)} onChange={event => onChange(event.target.checked ? [...value, id] : value.filter(v => v !== id))} />{name}
    </label>)}</div>
    <span style={{ color: 'var(--text-muted)' }}>No storefront selected = Your organization only. Items with no selection inherit the product storefronts.</span>
  </fieldset>
}
function Field({ label, value, onChange, type = 'text' }) {
  return <label className="grid gap-1 text-xs" style={{ color: 'var(--text)' }}>{label}<input type={type} min={type === 'number' ? 0 : undefined} step={type === 'number' ? 'any' : undefined} value={value ?? ''} onChange={event => onChange(event.target.value)} style={fieldStyle} /></label>
}
function Select({ label, value, onChange, options }) {
  return <label className="grid gap-1 text-xs" style={{ color: 'var(--text)' }}>{label}<select value={value || ''} onChange={event => onChange(event.target.value)} style={fieldStyle}>{options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
}
export function CopyItemControl({ products, onCopy }) {
  const [target, setTarget] = useState('')
  return <div className="flex items-end gap-2"><div className="flex-1"><Select label="Copy to other product" value={target} onChange={setTarget} options={[[ '', 'Choose a product'], ...products.map(p => [p.id, p.name])]} /></div><button type="button" title="Copy to other product" aria-label="Copy to other product" disabled={!target} onClick={() => onCopy(target)} style={{ ...fieldStyle, width: 44, opacity: target ? 1 : 0.4, display: 'grid', placeItems: 'center' }}><Copy size={16} /></button></div>
}
export function PackageCommerceFields({ pkg, addOns, onChange }) {
  return <div className="grid gap-3">
    <StorefrontFields value={pkg.storefronts} onChange={v => onChange('storefronts', v)} />
    <fieldset className="flex flex-wrap gap-4 text-xs"><legend>Deployment options</legend>{['self-install', 'hosted'].map(id => <label key={id} className="flex items-center gap-2 min-h-11"><input type="checkbox" checked={(pkg.deploymentOptions || []).includes(id)} onChange={e => onChange('deploymentOptions', e.target.checked ? [...(pkg.deploymentOptions || []), id] : pkg.deploymentOptions.filter(v => v !== id))} />{id}</label>)}</fieldset>
    <div className="grid sm:grid-cols-2 gap-2"><Select label="Hosting add-on" value={pkg.hostingAddOnId} onChange={v => onChange('hostingAddOnId', v)} options={[[ '', 'None'], ...addOns.filter(a => a.category === 'hosting').map(a => [a.id, `${a.name} (${a.id})`])]} /><Field label="Updates included (months)" type="number" value={pkg.updatesIncludedMonths || 0} onChange={v => onChange('updatesIncludedMonths', v)} /></div>
  </div>
}
export function ModuleCommerceFields({ mod, onChange }) {
  return <div className="grid gap-3"><StorefrontFields value={mod.storefronts} onChange={v => onChange('storefronts', v)} /><div className="grid sm:grid-cols-2 gap-2"><Field label="Standalone price" type="number" value={mod.price || 0} onChange={v => onChange('price', v)} /><Field label="Starting at (optional)" type="number" value={mod.startingAt} onChange={v => onChange('startingAt', v === '' ? null : v)} /></div><label className="flex gap-2 items-center text-xs min-h-11"><input type="checkbox" checked={Boolean(mod.quote)} onChange={e => onChange('quote', e.target.checked)} />Quote required for standalone purchase</label><Field label="Stripe price ID" value={mod.stripePriceId} onChange={v => onChange('stripePriceId', v)} /></div>
}
export function AddOnCommerceFields({ addOn, packages, onChange }) {
  return <div className="grid gap-3"><StorefrontFields value={addOn.storefronts} onChange={v => onChange('storefronts', v)} /><div className="grid sm:grid-cols-2 gap-2"><Select label="Category" value={addOn.category || 'service'} onChange={v => onChange('category', v)} options={['hosting', 'service', 'module'].map(v => [v, v])} /><Select label="Billing interval" value={addOn.billingInterval} onChange={v => onChange('billingInterval', v || null)} options={[[ '', 'One-time'], ['month', 'Monthly'], ['year', 'Annual'], ['week', 'Weekly'], ['day', 'Daily']]} /></div><fieldset className="grid gap-1 text-xs"><legend>Applies to packages (none means all)</legend>{packages.map(pkg => <label key={pkg.id} className="flex gap-2 items-center min-h-11"><input type="checkbox" checked={(addOn.appliesToPackages || []).includes(pkg.id)} onChange={e => onChange('appliesToPackages', e.target.checked ? [...(addOn.appliesToPackages || []), pkg.id] : addOn.appliesToPackages.filter(v => v !== pkg.id))} />{pkg.name}</label>)}</fieldset><Field label="Stripe price ID" value={addOn.stripePriceId} onChange={v => onChange('stripePriceId', v)} /></div>
}
export function SalesPolicyFields({ policy = {}, onChange }) {
  const update = (key, value) => onChange({ ...policy, [key]: value })
  return <div className="grid gap-3"><Select label="Refunds" value={policy.refunds || 'none'} onChange={v => update('refunds', v)} options={[[ 'none', 'No refunds'], ['window', 'Refund window']]} /><Field label="Refund window (days)" type="number" value={policy.refundWindowDays} onChange={v => update('refundWindowDays', v === '' ? null : v)} /><label className="grid gap-1 text-xs">Sales policy statement<textarea rows={3} value={policy.statement || ''} onChange={e => update('statement', e.target.value)} style={fieldStyle} /></label><Field label="Free edition / trial URL" value={policy.trialUrl} onChange={v => update('trialUrl', v)} /><label className="flex gap-2 items-center text-xs min-h-11"><input type="checkbox" checked={Boolean(policy.digitalConsentRequired)} onChange={e => update('digitalConsentRequired', e.target.checked)} />Require digital delivery consent</label></div>
}
