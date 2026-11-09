'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useRef } from 'react'
import UsageDashboard from './UsageDashboard'
import PageHeader, { ViewToggle } from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import { useActiveRecord } from '@/lib/active-record'
import { isOpenOcti } from '@/lib/edition'
import Link from 'next/link'

const CATS = ['All','AI Providers','Payment Processing','Hosting & Domains','Database','Cloud','Other']
const CC = {'AI Providers':'var(--accent)','Payment Processing':'var(--green)','Hosting & Domains':'var(--peach)',Database:'var(--purple)',Cloud:'var(--teal)',Other:'var(--text-muted)'}
const KEY_PAGES = [
  { test: /^kie(?:[.\s_-]?ai)?(?:\b|$)/i, label: 'Kie.AI API keys', url: 'https://kie.ai/api-key' },
  { test: /anthropic|claude/i, label: 'Anthropic keys', url: 'https://console.anthropic.com/settings/keys' },
  { test: /open\s*ai|openai/i, label: 'OpenAI keys', url: 'https://platform.openai.com/api-keys' },
  { test: /eleven\s*labs|elevenlabs/i, label: 'ElevenLabs keys', url: 'https://elevenlabs.io/app/settings/api-keys' },
  { test: /perplexity/i, label: 'Perplexity keys', url: 'https://www.perplexity.ai/settings/api' },
  { test: /orca\s*router|orcarouter/i, label: 'OrcaRouter console', url: 'https://www.orcarouter.ai/console' },
  { test: /open\s*router|openrouter/i, label: 'OpenRouter keys', url: 'https://openrouter.ai/settings/keys' },
  { test: /gemini|google|jules/i, label: 'Google AI Studio keys', url: 'https://aistudio.google.com/app/apikey' },
  { test: /deep\s*seek|deepseek|deep\s*seats/i, label: 'DeepSeek keys', url: 'https://platform.deepseek.com/api_keys' },
  { test: /stripe/i, label: 'Stripe API keys', url: 'https://dashboard.stripe.com/apikeys' },
  { test: /privacy/i, label: 'Privacy API keys', url: 'https://app.privacy.com/account' },
  { test: /godaddy|go\s*daddy/i, label: 'GoDaddy API keys', url: 'https://developer.godaddy.com/keys' },
  { test: /vercel/i, label: 'Vercel tokens', url: 'https://vercel.com/account/settings/tokens' },
  { test: /open\s*weather|openweathermap/i, label: 'OpenWeather keys', url: 'https://home.openweathermap.org/api_keys' },
  { test: /pexels/i, label: 'Pexels API key', url: 'https://www.pexels.com/api/new/' },
  { test: /nvidia|nim|ngc/i, label: 'NVIDIA API keys', url: 'https://build.nvidia.com/' },
  { test: /open\s*claw|openclaw/i, label: 'OpenClaw setup', url: 'https://docs.openclaw.ai/getting-started' },
  { test: /fal\.?ai|fal/i, label: 'Fal.ai keys', url: 'https://fal.ai/dashboard/keys' },
  { test: /21st/i, label: '21st.dev keys', url: 'https://21st.dev/mcp' },
  { test: /apify/i, label: 'Apify tokens', url: 'https://console.apify.com/settings/integrations' },
]

function keyPageForCredential(cred) {
  const searchable = `${cred?.name || ''} ${cred?.description || ''} ${cred?.category || ''}`
  const found = KEY_PAGES.find(page => page.test.test(searchable))
  if (found) return found
  const query = encodeURIComponent(`${cred?.name || cred?.category || 'API'} API key dashboard`)
  return { label: 'Find key page', url: `https://www.google.com/search?q=${query}` }
}

async function api(url, body, options = {}) {
  const response = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), ...options })
  const result = await response.json()
  if (!response.ok) throw new Error('The credential request failed. Please try again.')
  return result
}
async function revealField(id, label, fieldIndex, signal) {
  const result = await api('/api/credentials/reveal', { id, label, fieldIndex }, { cache: 'no-store', signal })
  if (typeof result.value !== 'string') throw new Error('The credential value could not be loaded.')
  return result.value
}
function audit(action, payload = {}) {
  return fetch('/api/audit-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, area: 'credentials', ...payload }),
  }).catch(() => {})
}

const INPUT_STYLE = { background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:8,fontSize:13,outline:'none' }
function BusySpinner() {
  return <span aria-hidden="true" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
}

function CredentialField({ credential, field, fieldIndex, onCopied }) {
  const [value, setValue] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  const act = async action => {
    if (request.current) return
    if (action === 'reveal' && value !== null) { setValue(null); return }
    const controller = new AbortController()
    request.current = controller
    setBusy(action)
    setError('')
    try {
      const revealed = await revealField(credential.id, field.label, fieldIndex, controller.signal)
      if (controller.signal.aborted) return
      if (action === 'copy') {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard access is unavailable.')
        await navigator.clipboard.writeText(revealed)
        if (controller.signal.aborted) return
        audit('credential_field_copied', { severity: 'warn', targetId: credential.id, targetName: credential.name, meta: { fieldLabel: field.label, sensitive: !!field.sensitive } })
        onCopied()
      } else setValue(revealed)
    } catch (err) {
      if (!controller.signal.aborted) setError(err.message || 'The credential value could not be loaded.')
    } finally {
      if (request.current === controller) {
        request.current = null
        if (!controller.signal.aborted) setBusy('')
      }
    }
  }
  return (
    <div className="mb-2"><div className="text-[10px] uppercase mb-1 font-medium" style={{color:'var(--text-muted)'}}>{field.label}</div>
      <div className="flex gap-1">
        <div className="flex-1 px-2 py-1.5 rounded text-xs font-mono truncate" style={{background:'var(--surface2)',color:value !== null?'var(--text)':'var(--text-muted)'}}>{value ?? field.value}</div>
        <button type="button" aria-label={`${value !== null ? 'Hide' : 'Reveal'} ${field.label}`} title={`${value !== null ? 'Hide' : 'Reveal'} ${field.label}`} disabled={!!busy} aria-busy={busy === 'reveal'} className="px-2 py-1.5 rounded text-xs" style={{background:'var(--surface2)',color:'var(--text-muted)'}} onClick={e=>{e.stopPropagation(); act('reveal')}}>{busy === 'reveal' ? <BusySpinner /> : value !== null ? '🙈' : '👁'}</button>
        <button type="button" aria-label={`Copy ${field.label}`} title={`Copy ${field.label}`} disabled={!!busy} aria-busy={busy === 'copy'} className="px-2 py-1.5 rounded text-xs" style={{background:'var(--surface2)',color:'var(--text-muted)'}} onClick={e=>{e.stopPropagation(); act('copy')}}>{busy === 'copy' ? <BusySpinner /> : '📋'}</button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs" style={{color:'var(--red)'}}>{error}</p>}
    </div>
  )
}

function CredForm({ cred, clients, onClose, onSave }) {
  const [f, setF] = useState(() => cred ? { ...cred, fields: (cred.fields || []).map((field, index) => ({ label: field.label, sensitive: field.sensitive, originalLabel: field.label, originalIndex: index, maskedValue: field.value, present: field.present, localKey: index })) } : { name:'',description:'',category:'Other',clientId:'',fields:[{label:'',value:'',sensitive:true,localKey:0}] })
  const nextFieldKey = useRef(f.fields.length)
  const requests = useRef(new Map())
  const mounted = useRef(true)
  const savingRef = useRef(false)
  const [pending, setPending] = useState({})
  const [errors, setErrors] = useState({})
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; requests.current.forEach(controller => controller.abort()); requests.current.clear() }
  }, [])
  const updateField = (key, changes) => setF(prev => ({ ...prev, fields: prev.fields.map(field => field.localKey === key ? { ...field, ...changes } : field) }))
  const editField = async field => {
    const key = field.localKey
    if (savingRef.current || field.value !== undefined || requests.current.has(key)) return
    if (!field.present) { updateField(key, { value: '' }); return }
    const controller = new AbortController()
    requests.current.set(key, controller)
    setPending(prev => ({ ...prev, [key]: true }))
    setErrors(prev => ({ ...prev, [key]: '' }))
    try {
      const value = await revealField(cred.id, field.originalLabel, field.originalIndex, controller.signal)
      if (mounted.current && !controller.signal.aborted) updateField(key, { value })
    } catch (err) {
      if (mounted.current && !controller.signal.aborted) setErrors(prev => ({ ...prev, [key]: err.message || 'The credential value could not be loaded.' }))
    } finally {
      requests.current.delete(key)
      if (mounted.current) setPending(prev => ({ ...prev, [key]: false }))
    }
  }
  const removeField = key => {
    requests.current.get(key)?.abort()
    requests.current.delete(key)
    setF(prev => ({ ...prev, fields: prev.fields.filter(field => field.localKey !== key) }))
    setPending(prev => ({ ...prev, [key]: false }))
  }
  const save = async () => {
    if (savingRef.current || requests.current.size) return
    savingRef.current = true
    setSaving(true)
    setSaveError('')
    const fields = f.fields.map(field => ({ label: field.label, sensitive: field.sensitive, ...(field.originalLabel !== undefined ? { originalLabel: field.originalLabel, originalIndex: field.originalIndex } : {}), ...(field.originalLabel === undefined || field.dirty ? { value: field.value } : {}) }))
    try { await onSave({ ...f, fields }) }
    catch (err) { if (mounted.current) setSaveError(err.message || 'The credential could not be saved.') }
    finally { savingRef.current = false; if (mounted.current) setSaving(false) }
  }
  const is = INPUT_STYLE
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)'}} onClick={() => { if (!saving) onClose() }}>
      <div role="dialog" aria-modal="true" aria-label={`${cred?'Edit':'Add'} Credential`} className="w-full max-w-lg rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto" style={{background:'var(--surface)',border:'1px solid #2a2d42'}} onClick={e=>e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-4" style={{color:'var(--text)'}}>{cred?'Edit':'Add'} Credential</h2>
        <div className="mb-3"><label className="block text-xs mb-1" style={{color:'var(--text-muted)'}}>Name</label><input aria-label="Name" disabled={saving} style={{...is,width:'100%'}} value={f.name} onChange={e=>setF(p=>({...p,name:e.target.value}))}/></div>
        <div className="mb-3"><label className="block text-xs mb-1" style={{color:'var(--text-muted)'}}>Description</label><input aria-label="Description" disabled={saving} style={{...is,width:'100%'}} value={f.description} onChange={e=>setF(p=>({...p,description:e.target.value}))}/></div>
        <div className="mb-3"><label className="block text-xs mb-1" style={{color:'var(--text-muted)'}}>Category</label>
          <ThemedSelect style={{...is,width:'100%'}} value={f.category} disabled={saving} onChange={e=>setF(p=>({...p,category:e.target.value}))}>{CATS.filter(c=>c!=='All').map(c=><option key={c}>{c}</option>)}</ThemedSelect></div>
        <div className="mb-3"><label className="block text-xs mb-1" style={{color:'var(--text-muted)'}}>Client</label>
          <ThemedSelect style={{...is,width:'100%'}} value={f.clientId || ''} disabled={saving} onChange={e=>setF(p=>({...p,clientId:e.target.value}))}><option value="">Unassigned</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</ThemedSelect></div>
        <div className="mb-3"><div className="flex justify-between mb-2"><label className="text-xs" style={{color:'var(--text-muted)'}}>Fields</label><button type="button" disabled={saving} className="text-xs px-2 py-1 rounded" style={{background:'var(--surface2)',color:'var(--accent)'}} onClick={() => { const localKey = nextFieldKey.current++; setF(p=>({...p,fields:[...p.fields,{label:'',value:'',sensitive:true,localKey}]})) }}>+ Field</button></div>
          {f.fields.map((field,i)=>(
            <div key={field.localKey} className="mb-2">
              <div className="flex gap-2 items-start">
                <input aria-label={`Field ${i+1} label`} disabled={saving} className="w-28" style={{...is,padding:'5px 8px',fontSize:12}} placeholder="Label" value={field.label} onChange={e=>updateField(field.localKey,{label:e.target.value})}/>
                <input aria-label={`${field.label || `Field ${i+1}`} value`} aria-busy={!!pending[field.localKey]} disabled={saving} readOnly={field.value === undefined} className="flex-1" style={{...is,padding:'5px 8px',fontSize:12,fontFamily:'monospace'}} placeholder="Value" title={field.value === undefined ? 'Focus to load this field for editing' : undefined} value={field.value ?? field.maskedValue ?? ''} onFocus={()=>editField(field)} onChange={e=>{if(field.value !== undefined) updateField(field.localKey,{value:e.target.value,dirty:true})}}/>
                {pending[field.localKey] && <span role="status" aria-label={`Loading ${field.label}`}><BusySpinner /></span>}
                <label className="flex items-center gap-1 text-xs pt-1" style={{color:'var(--text-muted)'}}><input type="checkbox" aria-label={`${field.label || `Field ${i+1}`} sensitive`} disabled={saving} checked={!!field.sensitive} onChange={e=>updateField(field.localKey,{sensitive:e.target.checked})}/>🔒</label>
                {f.fields.length>1 && <button type="button" aria-label={`Remove ${field.label || `Field ${i+1}`}`} disabled={saving} className="text-xs pt-1" style={{color:'var(--red)'}} onClick={()=>removeField(field.localKey)}>✕</button>}
              </div>
              {errors[field.localKey] && <div role="alert" className="mt-1 text-xs" style={{color:'var(--red)'}}>{errors[field.localKey]} <button type="button" onClick={()=>editField(field)}>Retry</button></div>}
            </div>
          ))}
        </div>
        {saveError && <p role="alert" className="text-xs" style={{color:'var(--red)'}}>{saveError}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" disabled={saving || Object.values(pending).some(Boolean)} aria-busy={saving} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{background:'var(--accent)',color:'var(--accent-text)'}} onClick={save}>{saving ? <><BusySpinner /> Saving...</> : 'Save'}</button>
          <button type="button" disabled={saving} className="px-4 py-2 rounded-lg text-sm" style={{background:'var(--surface2)',color:'var(--text-muted)'}} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

export default function CredentialsVault({ returnTarget = null, onReturn = null }) {
  const [creds, setCreds] = useState([]); const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(''); const [catF, setCatF] = useState('All')
  const [edit, setEdit] = useState(null); const [showAdd, setShowAdd] = useState(false)
  useActiveRecord('credential', edit ? { id: edit.id, name: edit.name, description: edit.description, category: edit.category, fieldLabels: (edit.fields || []).map(f => f.label), lastTest: edit.lastTest } : null, [edit?.id])
  const [toast, setToast] = useState('')
  const [tab, setTab] = useState('vault')
  const [view, setView] = useState('list')
  const [clients, setClients] = useState([])
  const [clientF, setClientF] = useState('all')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [testing, setTesting] = useState({})
  const testCred = async (id) => {
    setTesting(t => ({ ...t, [id]: true }))
    try {
      const r = await fetch('/api/credentials/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) }).then(r => r.json())
      await refresh()
      flash(r.ok === true ? `✓ ${r.message}` : r.ok === false ? `✗ ${r.message}` : r.message)
    } finally { setTesting(t => ({ ...t, [id]: false })) }
  }
  const testAll = async () => {
    for (const c of filtered) await testCred(c.id)
  }

  useEffect(() => { fetch('/api/credentials').then(r=>r.json()).then(d => { setCreds(d.credentials||[]); setLoading(false) }) }, [])
  useEffect(() => { fetch('/api/accounts?type=client').then(r=>r.json()).then(d => setClients(d.accounts||[])).catch(() => setClients([])) }, [])
  const refresh = async () => { const d = await fetch('/api/credentials').then(r=>r.json()); setCreds(d.credentials||[]) }

  const flash = m => { setToast(m); setTimeout(()=>setToast(''),1500) }
  const filtered = useMemo(() => creds.filter(c => {
    const clientName = clients.find(client => client.id === c.clientId)?.name || ''
    const s = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.description?.toLowerCase().includes(search.toLowerCase()) || clientName.toLowerCase().includes(search.toLowerCase())
    return s && (catF==='All'||c.category===catF) && (clientF==='all'||(c.clientId || '')===clientF)
  }), [creds, clients, search, catF, clientF])

  const catCounts = useMemo(() => { const c = {}; creds.forEach(cr => { c[cr.category]=(c[cr.category]||0)+1 }); return c }, [creds])
  const filteredIds = useMemo(() => filtered.map(c => c.id).filter(Boolean), [filtered])
  useEffect(() => { setSelectedIds(new Set()) }, [search, catF, clientF, view])
  const clientName = id => clients.find(c => c.id === id)?.name || ''
  const toggleSelected = (id, event) => {
    event?.stopPropagation?.()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => setSelectedIds(prev => prev.size === filteredIds.length ? new Set() : new Set(filteredIds))

  const saveCred = async form => {
    const action = form.id ? 'update' : 'add'
    await api('/api/credentials', { action, credential: form }); await refresh()
    setEdit(null); setShowAdd(false)
  }
  const deleteCred = async id => { if(!confirm('Delete?')) return; await api('/api/credentials',{action:'delete',id}); await refresh() }
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !confirm(`Delete ${ids.length} selected credential${ids.length === 1 ? '' : 's'}?`)) return
    setBulkDeleting(true)
    try {
      await api('/api/credentials', { action: 'bulk_delete', ids })
      setSelectedIds(new Set())
      await refresh()
    } finally { setBulkDeleting(false) }
  }

  const is = { background:'var(--surface)',border:'1px solid var(--border)',color:'var(--text)',padding:'8px 12px',borderRadius:8,fontSize:13,outline:'none' }
  const returnLabel = returnTarget?.label || (returnTarget?.tab === 'nvidia-labs' ? 'AI Lab' : returnTarget?.tab ? String(returnTarget.tab).replace(/-/g, ' ') : '')
  const returnAction = returnTarget?.tab && onReturn ? (
    <button
      type="button"
      className="px-4 py-2 rounded-lg text-sm font-medium"
      style={{ background:'var(--surface2)', color:'var(--accent)', border:'1px solid var(--border)' }}
      onClick={onReturn}
    >
      Back to {returnLabel}
    </button>
  ) : null

  return (
    <div className="command-workspace p-6">
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in" style={{background:'var(--green)',color:'var(--accent-text)'}}>{toast}</div>}

      <PageHeader
        icon="🔐"
        title="Credentials"
        subtitle={isOpenOcti() ? `${creds.length} credentials stored · App-wide AI keys are in Models & Keys` : `${creds.length} credentials stored`}
        viewToggle={
          <ViewToggle view={tab} setView={setTab} options={[{ id: 'vault', label: 'Vault' }, { id: 'usage', label: 'Usage & Billing' }]} />
        }
        controls={tab === 'vault' ? <ViewModeToggle value={view} onChange={setView} modes={['list','card']} /> : null}
        actions={<>
          {returnAction}
          {isOpenOcti() && <Link href="/settings/models" className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>Models &amp; Keys</Link>}
          {tab === 'vault' && <>
          <button className="px-4 py-2 rounded-lg text-sm" style={{background:'var(--surface2)',color:'var(--accent)',border:'1px solid var(--border)'}} onClick={testAll}>✓ Test Visible</button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{background:'var(--accent)',color:'var(--accent-text)'}} onClick={()=>setShowAdd(true)}>+ Add Credential</button>
          </>}
        </>}
      />

      {tab === 'usage' && <UsageDashboard creds={creds} onAdd={()=>setShowAdd(true)} onEdit={setEdit} onDelete={deleteCred} onTest={testCred} testing={testing} onRefresh={refresh} />}
      {tab === 'vault' && <>
      <div className="command-toolbar flex gap-3 mb-5 items-center">
        <input className="flex-1" style={{...is,width:'100%'}} placeholder="Search credentials..." value={search} onChange={e=>setSearch(e.target.value)} />
        <ThemedSelect style={{...is,minWidth:160}} value={clientF} onChange={e=>setClientF(e.target.value)}><option value="all">All Clients</option><option value="">Unassigned</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</ThemedSelect>
        <div className="flex gap-1">{CATS.map(c=>(
          <button key={c} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{background:catF===c?'var(--surface2)':'transparent',color:catF===c?'var(--text)':'var(--text-muted)',border:catF===c?'1px solid #89b4fa':'1px solid transparent'}} onClick={()=>setCatF(c)}>
            {c}{c!=='All'&&catCounts[c]?` (${catCounts[c]})`:''}
          </button>
        ))}</div>
      </div>
      {selectedIds.size > 0 && (
        <div className="rounded-lg px-3 py-2 mb-3 flex items-center gap-2" style={{background:'var(--surface2)',border:'1px solid var(--border)'}}>
          <BulkActionsMenu
            selectedCount={selectedIds.size}
            totalCount={filteredIds.length}
            onSelectPage={() => setSelectedIds(new Set(filteredIds))}
            onClearSelection={() => setSelectedIds(new Set())}
            onDeleteSelected={bulkDelete}
            disabled={bulkDeleting}
          />
        </div>
      )}

      {loading ? <div className="text-center py-16" style={{color:'var(--text-muted)'}}>Loading...</div> :
        filtered.length===0 ? <div className="text-center py-16"><div className="text-4xl mb-3">🔐</div><p style={{color:'var(--text-muted)'}}>{creds.length===0?'No credentials yet.':'No matches.'}</p></div> :
        view === 'list' ? (
        <div className="rounded-xl overflow-hidden" style={{background:'var(--surface)',border:'1px solid var(--border)'}}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{background:'var(--surface2)',borderBottom:'1px solid var(--border)'}}>
                <th className="text-left px-4 py-2 w-[44px]"><input type="checkbox" aria-label="Select all visible credentials" checked={selectedIds.size === filteredIds.length && filteredIds.length > 0} onChange={toggleAll} style={{width:18,height:18}} /></th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase" style={{color:'var(--text-muted)'}}>Credential</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase" style={{color:'var(--text-muted)'}}>Client</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase" style={{color:'var(--text-muted)'}}>Category</th>
                <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase" style={{color:'var(--text-muted)'}}>Fields</th>
                <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase" style={{color:'var(--text-muted)'}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c=>{
                const cc = CC[c.category]||CC.Other
                const keyPage = keyPageForCredential(c)
                const isSelected = selectedIds.has(c.id)
                return (
                  <tr key={c.id} className="cursor-pointer" onClick={()=>setEdit(c)} style={{borderBottom:'1px solid var(--border)',background:isSelected?'var(--accent-soft)':''}}
                    onMouseEnter={e=>{e.currentTarget.style.background=isSelected?'var(--accent-soft)':'var(--surface2)'}} onMouseLeave={e=>{e.currentTarget.style.background=isSelected?'var(--accent-soft)':''}}>
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${c.name}`} checked={isSelected} onClick={e=>e.stopPropagation()} onChange={e=>toggleSelected(c.id,e)} style={{width:18,height:18}} /></td>
                    <td className="px-4 py-3"><div className="font-semibold" style={{color:'var(--text)'}}>{c.name}</div>{c.description&&<div className="text-xs" style={{color:'var(--text-muted)'}}>{c.description}</div>}</td>
                    <td className="px-4 py-3 text-xs" style={{color:'var(--text-muted)'}}>{clientName(c.clientId) || 'Unassigned'}</td>
                    <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full" style={{background:`${cc}18`,color:cc}}>{c.category || 'Other'}</span></td>
                    <td className="px-4 py-3 text-xs" style={{color:'var(--text-muted)'}}>{(c.fields||[]).map(f=>f.label).filter(Boolean).join(', ') || 'No fields'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <a href={keyPage.url} target="_blank" rel="noopener noreferrer" className="text-[10px] px-2 py-1 rounded" style={{background:'var(--surface2)',color:'var(--accent)'}} onClick={e=>{e.stopPropagation(); audit('credential_key_page_opened',{targetId:c.id,targetName:c.name,meta:{keyPage:keyPage.label}})}}>Get keys</a>
                        <button className="text-[10px] px-2 py-1 rounded" style={{background:'var(--surface2)',color:'var(--red)'}} onClick={e=>{e.stopPropagation(); deleteCred(c.id)}}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        ) :
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map(c=>{
          const cc = CC[c.category]||CC.Other
          const keyPage = keyPageForCredential(c)
          const isSelected = selectedIds.has(c.id)
          return (
            <div key={c.id} className="rounded-xl p-5 group transition-all cursor-pointer relative" onClick={()=>setEdit(c)} style={{background:isSelected?'var(--accent-soft)':'var(--surface)',border:`1px solid ${isSelected?'var(--accent)':'#2a2d42'}`}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=cc}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)'}}>
              <input type="checkbox" aria-label={`Select ${c.name}`} checked={isSelected} onClick={e=>e.stopPropagation()} onChange={e=>toggleSelected(c.id,e)} style={{width:18,height:18,position:'absolute',top:12,left:12}} />
              <div className="flex justify-between gap-3 mb-3">
                <div className="min-w-0 pl-7">
                  <div className="text-sm font-semibold truncate" style={{color:'var(--text)'}}>{c.name}</div>
                  {c.description&&<div className="text-xs" style={{color:'var(--text-muted)'}}>{c.description}</div>}
                  <div className="text-[11px] mt-1" style={{color:'var(--text-muted)'}}>{clientName(c.clientId) || 'Unassigned'}</div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <span className="text-[10px] px-2 py-0.5 rounded-full h-fit" style={{background:`${cc}18`,color:cc}}>{c.category || 'Other'}</span>
                  <a
                    href={keyPage.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] px-2 py-1 rounded-md font-medium"
                    style={{background:'var(--surface2)',color:'var(--accent)',border:'1px solid var(--border)'}}
                    title={`Open ${keyPage.label}`}
                    onClick={(e) => { e.stopPropagation(); audit('credential_key_page_opened', { targetId: c.id, targetName: c.name, meta: { keyPage: keyPage.label } }) }}
                  >
                    Get keys
                  </a>
                </div>
              </div>
              {c.fields?.map((field,i)=><CredentialField key={`${c.id}:${i}:${field.label}:${field.fingerprint}`} credential={c} field={field} fieldIndex={i} onCopied={()=>flash('Copied!')} />)}
              {c.lastTest && (
                <div className="mt-3 pt-2 text-xs" style={{borderTop:'1px solid #1a1d30',color: c.lastTest.ok===true?'var(--green)':c.lastTest.ok===false?'var(--red)':'var(--text-muted)'}}>
                  <span className="font-semibold">{c.lastTest.ok===true?'✓':c.lastTest.ok===false?'✗':'•'}</span> <span className="font-mono">{c.lastTest.message}</span>
                  <div className="text-[10px] mt-0.5" style={{color:'var(--text-muted)'}}>{new Date(c.lastTest.at).toLocaleString()}{c.lastTest.latencyMs?` • ${c.lastTest.latencyMs}ms`:''}</div>
                </div>
              )}
              <div className="flex gap-2 mt-3 pt-2" style={{borderTop:'1px solid #1a1d30'}}>
                <button disabled={testing[c.id]} className="text-xs px-2 py-1 rounded" style={{background:'var(--surface2)',color:'var(--green)',opacity:testing[c.id]?0.5:1}} onClick={e=>{e.stopPropagation(); testCred(c.id)}}>{testing[c.id]?'Testing...':'Test'}</button>
                <button className="text-xs px-2 py-1 rounded" style={{background:'var(--surface2)',color:'var(--accent)'}} onClick={e=>{e.stopPropagation(); setEdit(c)}}>Edit</button>
                <button className="text-xs px-2 py-1 rounded ml-auto" style={{background:'var(--surface2)',color:'var(--red)'}} onClick={e=>{e.stopPropagation(); deleteCred(c.id)}}>Delete</button>
              </div>
            </div>
          )
        })}</div>}

      </>}

      {edit && <CredForm key={edit.id} cred={edit} clients={clients} onSave={saveCred} onClose={()=>setEdit(null)} />}
      {showAdd && <CredForm cred={null} clients={clients} onSave={saveCred} onClose={()=>setShowAdd(false)} />}
    </div>
  )
}
