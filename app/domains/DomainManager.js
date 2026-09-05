'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import { useActiveRecord } from '@/lib/active-record'
import IntegrationGate from '../components/IntegrationGate'

const SC = { active: { bg: 'rgba(166,227,161,0.15)', c: 'var(--green)' }, parked: { bg: 'rgba(249,226,175,0.15)', c: 'var(--amber)' }, unknown: { bg: 'rgba(127,132,156,0.15)', c: 'var(--text-muted)' }, expired: { bg: 'rgba(243,139,168,0.15)', c: 'var(--red)' } }
const HC = { Vercel: 'var(--accent)', Lovable: 'var(--purple)', GoDaddy: 'var(--peach)', InMotion: 'var(--amber)', Netlify: 'var(--teal)', unknown: 'var(--text-muted)' }

function api(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }

function DomainCard({ d, onEdit, isSelected, onToggleSelect, clientName }) {
  const [h, setH] = useState(false); const sc = SC[d.status] || SC.unknown; const hc = HC[d.hosting] || HC.unknown
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={() => onEdit(d)}
      className="rounded-xl p-5 cursor-pointer transition-all relative" style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${h || isSelected ? 'var(--accent)' : 'var(--border)'}` }}>
      <input type="checkbox" aria-label={`Select ${d.domain}`} checked={isSelected} onClick={e => e.stopPropagation()} onChange={e => onToggleSelect(d.id, e)} style={{ width: 18, height: 18, position: 'absolute', top: 12, left: 12 }} />
      <div className="flex justify-between items-start">
        <div><div className="text-sm font-semibold font-mono" style={{ color: 'var(--text)' }}>{d.domain}</div><div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.registrar} • {d.dnsProvider||'DNS ?'}</div></div>
        <span className="text-xs px-2 py-0.5 rounded-full flex items-center gap-1" style={{ background: sc.bg, color: sc.c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.c }}/>{d.status}</span>
      </div>
      <div className="text-[11px] mt-1 pl-7" style={{ color: 'var(--text-muted)' }}>{clientName || 'Unassigned'}</div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div><div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Hosting</div><span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: `${hc}18`, color: hc, border: `1px solid ${hc}30` }}>{d.hosting}</span></div>
        <div><div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Type</div><span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{d.hostingType||'—'}</span></div>
        <div><div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>SSL</div><span className="text-xs" style={{ color: 'var(--text)' }}>{d.sslStatus==='active'?'🔒':'❓'} {d.sslStatus}</span></div>
        <div><div className="text-[10px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Expires</div><span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{d.expirationDate||'unknown'}</span></div>
      </div>
      {(d.aRecords?.length>0||d.cnameRecords?.length>0) && <div className="mt-3 pt-3 flex flex-wrap gap-1" style={{ borderTop: '1px solid #2a2d42' }}>
        {d.aRecords?.map((r,i) => <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--teal)' }}>A: {r}</span>)}
        {d.cnameRecords?.map((r,i) => <span key={i} className="text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--purple)' }}>CNAME: {r}</span>)}
      </div>}
      {d.notes && <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>{d.notes}</p>}
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid #1a1d30' }}><span className="text-xs" style={{ color: d.autoRenew ? 'var(--green)' : 'var(--red)' }}>{d.autoRenew ? '↻ Auto-renew ON' : '⚠ Auto-renew OFF'}</span></div>
    </div>
  )
}

export default function DomainManager() {
  return <IntegrationGate capability={['godaddy', 'cloudflare']} mode="any" title="a domain provider"><DomainManagerContent /></IntegrationGate>
}

function DomainManagerContent() {
  const [domains, setDomains] = useState([]); const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState(''); const [statusF, setStatusF] = useState('all'); const [hostF, setHostF] = useState('all'); const [clientF, setClientF] = useState('all')
  const [editDom, setEditDom] = useState(null); const [showImport, setShowImport] = useState(false); const [importRaw, setImportRaw] = useState('')
  useActiveRecord('domain', editDom?.id ? { id: editDom.id, domain: editDom.domain, registrar: editDom.registrar, hosting: editDom.hosting, dnsProvider: editDom.dnsProvider, status: editDom.status, expirationDate: editDom.expirationDate, autoRenew: editDom.autoRenew, sslStatus: editDom.sslStatus, notes: editDom.notes } : null, [editDom?.id])

  // Voice-driven record selection
  useEffect(() => {
    const handler = (e) => {
      const r = e.detail
      if (r?.type !== 'domain') return
      const d = domains.find(x => x.id === r.id)
      if (d) setEditDom(d)
    }
    window.addEventListener('fcc:select-record', handler)
    return () => window.removeEventListener('fcc:select-record', handler)
  }, [domains])
  const [syncing, setSyncing] = useState(false)
  const [view, setView] = useState('list')
  const [clients, setClients] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const syncGoDaddy = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/domains/sync', { method: 'POST' }).then(r => r.json())
      if (res.error) alert('Sync failed: ' + res.error)
      else alert(`Synced ${res.fetched} from GoDaddy.\nAdded: ${res.added}  Updated: ${res.updated}  Removed (inactive): ${res.removed||0}  Skipped (non-active): ${res.skipped||0}  Total active: ${res.total}`)
      await refresh()
    } finally { setSyncing(false) }
  }
  const syncCloudflare = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/domains/sync-cloudflare', { method: 'POST' }).then(r => r.json())
      if (res.error) alert('Sync failed: ' + res.error)
      else if (res.fetched === 0) alert(res.error || 'Cloudflare returned no zones.')
      else alert(`Synced ${res.fetched} from Cloudflare.\nAdded: ${res.added}  Updated: ${res.updated}  Removed (inactive): ${res.removed||0}  Skipped: ${res.skipped||0}  Registrar-managed: ${res.registrarManaged||0}  Total: ${res.total}`)
      await refresh()
    } finally { setSyncing(false) }
  }

  useEffect(() => { fetch('/api/domains').then(r=>r.json()).then(d => { setDomains(d.domains||[]); setLoading(false) }) }, [])
  useEffect(() => { fetch('/api/accounts?type=client').then(r=>r.json()).then(d => setClients(d.accounts||[])).catch(() => setClients([])) }, [])

  const refresh = async () => { const d = await fetch('/api/domains').then(r=>r.json()); setDomains(d.domains||[]) }

  const saveDomain = async (form) => { const action = form.id && domains.find(d=>d.id===form.id) ? 'update' : 'add'; await api('/api/domains', { action, domain: form }); await refresh(); setEditDom(null) }
  const deleteDomain = async (id) => { if(!confirm('Delete?')) return; await api('/api/domains', { action: 'delete', id }); await refresh(); setEditDom(null) }
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !confirm(`Delete ${ids.length} selected domain${ids.length === 1 ? '' : 's'}?`)) return
    setBulkDeleting(true)
    try {
      await api('/api/domains', { action: 'bulk_delete', ids })
      setSelectedIds(new Set())
      await refresh()
    } finally { setBulkDeleting(false) }
  }
  const importDomains = async () => {
    try { const p = JSON.parse(importRaw); const ds = Array.isArray(p)?p:p.domains||[p]
      const mapped = ds.map(d => ({ domain: d.domain||d.domainId||d.name||'', expirationDate: d.expires||d.expirationDate||'', autoRenew: d.renewAuto!==undefined?d.renewAuto:true, status: d.status==='ACTIVE'?'active':(d.status||'active').toLowerCase() }))
      await api('/api/domains', { action: 'import', domains: mapped }); await refresh(); setShowImport(false); setImportRaw('')
    } catch { alert('Could not parse JSON') }
  }

  const filtered = useMemo(() => domains.filter(d => {
    const clientName = clients.find(client => client.id === d.clientId)?.name || ''
    const s = !search || d.domain.toLowerCase().includes(search.toLowerCase()) || d.notes?.toLowerCase().includes(search.toLowerCase()) || clientName.toLowerCase().includes(search.toLowerCase())
    return s && (statusF==='all'||d.status===statusF) && (hostF==='all'||d.hosting===hostF) && (clientF==='all'||(d.clientId || '')===clientF)
  }), [domains, clients, search, statusF, hostF, clientF])

  const hostOpts = ['all', ...new Set(domains.map(d=>d.hosting).filter(Boolean))]
  const filteredIds = useMemo(() => filtered.map(d => d.id).filter(Boolean), [filtered])
  useEffect(() => { setSelectedIds(new Set()) }, [search, statusF, hostF, clientF, view])
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
  const stats = { total: domains.length, active: domains.filter(d=>d.status==='active').length, ssl: domains.filter(d=>d.sslStatus==='active').length, audit: domains.filter(d=>d.hosting==='unknown').length }
  const is = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none' }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon="🌐"
        title="Domain Inventory"
        subtitle={`${stats.total} domains • ${stats.active} active • ${stats.audit} need audit`}
        viewToggle={<ViewModeToggle value={view} onChange={setView} modes={['grid','list']} />}
        actions={<>
          <button disabled={syncing} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', opacity: syncing ? 0.6 : 1 }} onClick={syncGoDaddy}>{syncing ? '⟳ Syncing...' : '⟳ Sync GoDaddy'}</button>
          <button disabled={syncing} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--orange)', border: '1px solid var(--border)', opacity: syncing ? 0.6 : 1 }} onClick={syncCloudflare}>{syncing ? '⟳ Syncing...' : '⟳ Sync Cloudflare'}</button>
          <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--peach)', border: '1px solid var(--border)' }} onClick={() => setShowImport(true)}>⬆ Import</button>
          <button className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => setEditDom({ domain:'',registrar:'GoDaddy',hosting:'unknown',hostingType:'unknown',dnsProvider:'GoDaddy',sslStatus:'unknown',expirationDate:'',autoRenew:true,status:'active',clientId:'',notes:'' })}>+ Add Domain</button>
        </>}
      />

      <div className="command-stat-grid grid grid-cols-4 gap-3 mb-6">
        {[{l:'Total',v:stats.total,c:'var(--accent)'},{l:'Active',v:stats.active,c:'var(--green)'},{l:'SSL',v:stats.ssl,c:'var(--teal)'},{l:'Need Audit',v:stats.audit,c:'var(--amber)'}].map(s=>(
          <div key={s.l} className="command-stat-card rounded-lg p-4" style={{ color:s.c }}><div className="text-2xl font-bold font-mono">{s.v}</div><div className="text-xs mt-1">{s.l}</div></div>
        ))}
      </div>

      <div className="command-toolbar flex gap-3 mb-5 items-center">
        <input className="flex-1" style={{ ...is, width: '100%' }} placeholder="Search domains..." value={search} onChange={e=>setSearch(e.target.value)} />
        <ThemedSelect style={{ ...is, minWidth: 150 }} value={clientF} onChange={e=>setClientF(e.target.value)}><option value="all">All Clients</option><option value="">Unassigned</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</ThemedSelect>
        <ThemedSelect style={{ ...is, minWidth: 120 }} value={statusF} onChange={e=>setStatusF(e.target.value)}><option value="all">All Status</option>{Object.keys(SC).map(s=><option key={s}>{s}</option>)}</ThemedSelect>
        <ThemedSelect style={{ ...is, minWidth: 120 }} value={hostF} onChange={e=>setHostF(e.target.value)}>{hostOpts.map(h=><option key={h} value={h}>{h==='all'?'All Hosting':h}</option>)}</ThemedSelect>
      </div>
      {selectedIds.size > 0 && (
        <div className="rounded-lg px-3 py-2 mb-3 flex items-center gap-2" style={{ background:'var(--surface2)', border:'1px solid var(--border)' }}>
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
        filtered.length===0 ? <div className="text-center py-16"><div className="text-4xl mb-3">🌐</div><p style={{color:'var(--text-muted)'}}>{domains.length===0?'No domains. Import from GoDaddy or add manually.':'No matches.'}</p></div> :
        view === 'list' ? (
        <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
                <th className="text-left px-4 py-3 w-[44px]"><input type="checkbox" aria-label="Select all visible domains" checked={selectedIds.size === filteredIds.length && filteredIds.length > 0} onChange={toggleAll} style={{ width: 18, height: 18 }} /></th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Domain</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Client</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Registrar</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Hosting</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>DNS</th>
                <th className="text-center px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Status</th>
                <th className="text-center px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>SSL</th>
                <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Expires</th>
                <th className="text-center px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Renew</th>
                <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => {
                const sc = SC[d.status] || SC.unknown
                const hc = HC[d.hosting] || HC.unknown
                const isSelected = selectedIds.has(d.id)
                return (
                  <tr key={d.id} className="transition-colors cursor-pointer" onClick={() => setEditDom(d)} style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'var(--accent-soft)' : '' }}
                    onMouseEnter={e => e.currentTarget.style.background = isSelected ? 'var(--accent-soft)' : 'var(--surface2)'} onMouseLeave={e => e.currentTarget.style.background = isSelected ? 'var(--accent-soft)' : ''}>
                    <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${d.domain}`} checked={isSelected} onClick={e => e.stopPropagation()} onChange={e => toggleSelected(d.id, e)} style={{ width: 18, height: 18 }} /></td>
                    <td className="px-4 py-3">
                      <span className="font-semibold font-mono text-sm" style={{ color: 'var(--text)' }}>{d.domain}</span>
                      {d.notes && <div className="text-[10px] italic mt-0.5" style={{ color: 'var(--text-muted)' }}>{d.notes}</div>}
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{clientName(d.clientId) || 'Unassigned'}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text)' }}>{d.registrar}</td>
                    <td className="px-4 py-3"><span className="text-xs font-mono px-2 py-0.5 rounded" style={{ background: `${hc}18`, color: hc, border: `1px solid ${hc}30` }}>{d.hosting}</span></td>
                    <td className="px-4 py-3 text-xs" style={{ color: 'var(--text)' }}>{d.dnsProvider || '—'}</td>
                    <td className="px-4 py-3 text-center"><span className="text-[10px] px-2 py-0.5 rounded-full inline-flex items-center gap-1" style={{ background: sc.bg, color: sc.c }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: sc.c }} />{d.status}</span></td>
                    <td className="px-4 py-3 text-center text-xs">{d.sslStatus === 'active' ? <span style={{ color: 'var(--green)' }}>🔒</span> : <span style={{ color: 'var(--text-muted)' }}>❓</span>}</td>
                    <td className="px-4 py-3 text-xs font-mono" style={{ color: 'var(--text)' }}>{d.expirationDate || '—'}</td>
                    <td className="px-4 py-3 text-center text-xs" style={{ color: d.autoRenew ? 'var(--green)' : 'var(--red)' }}>{d.autoRenew ? '↻ ON' : '⚠ OFF'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={e => { e.stopPropagation(); setEditDom(d) }} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }}>Edit</button>
                        <button onClick={e => { e.stopPropagation(); deleteDomain(d.id) }} className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }}>Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">{filtered.map(d=><DomainCard key={d.id} d={d} onEdit={setEditDom} isSelected={selectedIds.has(d.id)} onToggleSelect={toggleSelected} clientName={clientName(d.clientId)}/>)}</div>
        )}

      {editDom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)' }} onClick={()=>setEditDom(null)}>
          <div className="w-full max-w-lg rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto" style={{ background:'var(--surface)',border:'1px solid #2a2d42' }} onClick={e=>e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4" style={{color:'var(--text)'}}>{editDom.id?'Edit Domain':'Add Domain'}</h2>
            {['domain','registrar','hosting','hostingType','dnsProvider','expirationDate','notes'].map(k=>(
              <div key={k} className="mb-3"><label className="block text-xs mb-1 font-medium" style={{color:'var(--text-muted)'}}>{k}</label>
              <input style={{ ...is, width:'100%' }} value={editDom[k]||''} onChange={e=>setEditDom(p=>({...p,[k]:e.target.value}))} /></div>
            ))}
            <div className="mb-3"><label className="block text-xs mb-1" style={{color:'var(--text-muted)'}}>Client</label>
              <ThemedSelect style={{ ...is, width:'100%' }} value={editDom.clientId || ''} onChange={e=>setEditDom(p=>({...p,clientId:e.target.value}))}><option value="">Unassigned</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</ThemedSelect></div>
            <div className="mb-3"><label className="block text-xs mb-1" style={{color:'var(--text-muted)'}}>Status</label>
              <ThemedSelect style={{ ...is, width:'100%' }} value={editDom.status} onChange={e=>setEditDom(p=>({...p,status:e.target.value}))}>{Object.keys(SC).map(s=><option key={s}>{s}</option>)}</ThemedSelect></div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{background:'var(--accent)',color:'var(--accent-text)'}} onClick={()=>saveDomain(editDom)}>Save</button>
              {editDom.id && <button className="px-4 py-2 rounded-lg text-sm" style={{background:'rgba(243,139,168,0.15)',color:'var(--red)'}} onClick={()=>deleteDomain(editDom.id)}>Delete</button>}
              <button className="px-4 py-2 rounded-lg text-sm" style={{background:'var(--surface2)',color:'var(--text-muted)'}} onClick={()=>setEditDom(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)' }} onClick={()=>setShowImport(false)}>
          <div className="w-full max-w-2xl rounded-xl p-6 animate-fade-in" style={{ background:'var(--surface)',border:'1px solid #2a2d42' }} onClick={e=>e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-2" style={{color:'var(--text)'}}>Import from GoDaddy CLI</h2>
            <p className="text-xs mb-4" style={{color:'var(--text-muted)'}}>Run <code className="font-mono px-1 py-0.5 rounded" style={{background:'var(--surface2)'}}>gddy domain list --json</code> and paste below</p>
            <textarea className="w-full h-64 rounded-lg text-sm font-mono resize-none" style={{ ...is, width:'100%' }} value={importRaw} onChange={e=>setImportRaw(e.target.value)} placeholder="Paste JSON..." />
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{background:'var(--green)',color:'var(--accent-text)'}} onClick={importDomains}>Import</button>
              <button className="px-4 py-2 rounded-lg text-sm" style={{background:'var(--surface2)',color:'var(--text-muted)'}} onClick={()=>setShowImport(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
