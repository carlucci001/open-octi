'use client'
import { useState, useRef } from 'react'
import { guessContactField, parseCsv } from '@/lib/import-table'

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

const FIELDS = [
  { id: 'name', label: 'Name' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'title', label: 'Title' },
  { id: 'company', label: 'Company / Account' },
  { id: 'notes', label: 'Notes' },
  { id: '', label: '(skip)' },
]

export default function ImportCsvModal({ accounts, onClose, onDone }) {
  const [step, setStep] = useState('pick') // pick | map | done
  const [headers, setHeaders] = useState([])
  const [mapping, setMapping] = useState([])
  const [rows, setRows] = useState([])
  const [firstIsHeader, setFirstIsHeader] = useState(true)
  const [dupReport, setDupReport] = useState(null)
  const [skipDups, setSkipDups] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const fileRef = useRef(null)

  const accountIdFor = (companyName) => {
    const n = (companyName || '').trim().toLowerCase()
    if (!n) return null
    return accounts.find(a => (a.name || '').trim().toLowerCase() === n)?.id || null
  }

  const mappedContacts = () => {
    const dataRows = firstIsHeader ? rows.slice(1) : rows
    return dataRows.map(r => {
      const c = {}
      mapping.forEach((f, i) => {
        if (!f) return
        const v = (r[i] || '').trim()
        if (f === 'company') { c.company = v; c.accountId = accountIdFor(v) }
        else if (v) c[f] = v
      })
      // First name + Last name style files: join leftover columns mapped to name twice
      return c
    }).filter(c => c.name || c.email || c.phone)
  }

  const onFile = async (file) => {
    setErr('')
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseCsv(text)
      if (!parsed.length) throw new Error('File appears to be empty')
      setRows(parsed)
      setHeaders(parsed[0])
      setMapping(parsed[0].map(h => guessContactField(h)))
      setStep('map')
    } catch (e) { setErr(e.message || 'Could not read file') }
  }

  const runDryCheck = async () => {
    setBusy(true); setErr('')
    try {
      const contacts = mappedContacts()
      if (!contacts.length) throw new Error('No usable rows — map at least a Name, Email, or Phone column')
      const r = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_add', contacts, dryRun: true }) }).then(x => x.json())
      if (r.error) throw new Error(r.error)
      setDupReport(r.rows || [])
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const runImport = async () => {
    setBusy(true); setErr('')
    try {
      const contacts = mappedContacts()
      const r = await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bulk_add', contacts, skipDuplicates: skipDups }) }).then(x => x.json())
      if (r.error) throw new Error(r.error)
      setResult(r); setStep('done')
    } catch (e) { setErr(e.message) }
    setBusy(false)
  }

  const dataRows = firstIsHeader ? rows.slice(1) : rows
  const dupCount = (dupReport || []).filter(r => r.duplicate || r.inFileDuplicate).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="relative w-full max-w-3xl rounded-xl p-6 animate-fade-in max-h-[88vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>X</button>
        <h2 className="text-lg font-semibold mb-1 pr-10" style={{ color: 'var(--text)' }}>Import contacts from CSV</h2>
        {err && <div className="my-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{err}</div>}

        {step === 'pick' && (
          <div className="py-6 text-center">
            <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>Pick a .csv file. First row can be headers — Name, Email, Phone, Title, Company all auto-map.</p>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={e => onFile(e.target.files?.[0])} />
            <button onClick={() => fileRef.current?.click()} className="px-5 py-2.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Choose CSV file</button>
          </div>
        )}

        {step === 'map' && (
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={firstIsHeader} onChange={e => { setFirstIsHeader(e.target.checked); setDupReport(null) }} style={{ width: 16, height: 16 }} />
                First row is headers
              </label>
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{dataRows.length} row{dataRows.length === 1 ? '' : 's'} detected</span>
              {dupReport && <span className="text-xs font-semibold" style={{ color: dupCount ? 'var(--amber)' : 'var(--green)' }}>{dupCount ? `${dupCount} possible duplicate${dupCount === 1 ? '' : 's'}` : 'No duplicates found'}</span>}
            </div>

            <div className="rounded-lg overflow-auto mb-3" style={{ border: '1px solid var(--border)', maxHeight: '42vh' }}>
              <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <th className="p-2 text-left" style={{ color: 'var(--text-muted)', minWidth: 34 }}></th>
                    {headers.map((h, i) => (
                      <th key={i} className="p-2 text-left" style={{ minWidth: 130 }}>
                        <div className="text-[10px] mb-1 truncate" style={{ color: 'var(--text-muted)' }}>{firstIsHeader ? (h || `Column ${i + 1}`) : `Column ${i + 1}`}</div>
                        <select style={{ ...inp, padding: '4px 8px', fontSize: 11, width: '100%' }} value={mapping[i] || ''} onChange={e => { setMapping(m => m.map((x, j) => j === i ? e.target.value : x)); setDupReport(null) }}>
                          {FIELDS.map(f => <option key={f.id || 'skip'} value={f.id}>{f.label}</option>)}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dataRows.slice(0, 40).map((r, ri) => {
                    const flag = dupReport?.[ri]
                    const isDup = flag && (flag.duplicate || flag.inFileDuplicate)
                    return (
                      <tr key={ri} style={{ borderTop: '1px solid var(--border)', background: isDup ? 'var(--amber-soft)' : 'transparent' }}>
                        <td className="p-2 text-center" title={flag?.duplicate ? `Matches existing: ${flag.duplicate.name}` : flag?.inFileDuplicate ? 'Duplicate within this file' : ''}>{isDup ? '\u26a0' : ''}</td>
                        {headers.map((_, ci) => <td key={ci} className="p-2 truncate" style={{ color: 'var(--text)', maxWidth: 180 }}>{r[ci] || ''}</td>)}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {dataRows.length > 40 && <div className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>Showing first 40 of {dataRows.length} rows — all rows will be imported.</div>}

            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={runDryCheck} disabled={busy} className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>{busy && !dupReport ? 'Checking\u2026' : 'Check for duplicates'}</button>
              <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text)' }}>
                <input type="checkbox" checked={skipDups} onChange={e => setSkipDups(e.target.checked)} style={{ width: 16, height: 16 }} />
                Skip duplicates on import
              </label>
              <button onClick={runImport} disabled={busy} className="ml-auto px-5 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Importing\u2026' : `Import ${dataRows.length} row${dataRows.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        )}

        {step === 'done' && result && (
          <div className="py-6 text-center">
            <div className="text-3xl mb-2">{'\u2705'}</div>
            <p className="text-sm mb-1" style={{ color: 'var(--text)' }}><strong>{result.added}</strong> contact{result.added === 1 ? '' : 's'} imported{result.skipped ? <> {'\u00b7'} <strong>{result.skipped}</strong> duplicate{result.skipped === 1 ? '' : 's'} skipped</> : null}.</p>
            <button onClick={onDone} className="mt-4 px-5 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Done</button>
          </div>
        )}
      </div>
    </div>
  )
}
