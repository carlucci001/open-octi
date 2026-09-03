'use client'

import Link from 'next/link'
import { Download, FileSpreadsheet, RotateCcw, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import readXlsxFile from 'read-excel-file/browser'
import { mapTableRows, parseCsv, parseVCard } from '@/lib/import-table'

const buttonStyle = { minHeight: 44, borderRadius: 9, padding: '0 14px', fontWeight: 700 }

export default function OpenOctiImportCenter() {
  const [meta, setMeta] = useState(null); const [objectType, setObjectType] = useState('contacts')
  const [headers, setHeaders] = useState([]); const [rows, setRows] = useState([]); const [mapping, setMapping] = useState([])
  const [preview, setPreview] = useState(null); const [result, setResult] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const [presetName, setPresetName] = useState(''); const fileRef = useRef(null)

  useEffect(() => {
    fetch('/api/openocti/import', { cache: 'no-store' }).then(response => response.json()).then(setMeta).catch(reason => setError(reason.message))
    fetch('/api/openocti/setup', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'open-import' }) }).catch(() => {})
  }, [])

  const mappedRows = useMemo(() => mapTableRows(headers, rows, mapping), [headers, rows, mapping])
  const config = meta?.objects?.[objectType]

  const detect = async (nextHeaders = headers, nextType = objectType) => {
    const response = await fetch('/api/openocti/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'detect', headers: nextHeaders, objectType: nextType }) })
    const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || 'Could not detect columns'); setMapping(data.mapping)
  }
  const loadFile = async file => {
    if (!file) return
    setError(''); setPreview(null); setResult(null)
    try {
      let table
      if (/\.xlsx$/i.test(file.name)) table = await readXlsxFile(file)
      else if (/\.vcf$/i.test(file.name)) table = parseVCard(await file.text())
      else table = parseCsv(await file.text())
      if (table.length < 2) throw new Error('The file needs a header row and at least one data row')
      const nextHeaders = table[0].map(String); setHeaders(nextHeaders); setRows(table.slice(1)); await detect(nextHeaders, objectType)
    } catch (reason) { setError(reason.message) }
  }
  const request = async action => {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/openocti/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, objectType, rows: mappedRows, batchId: result?.batchId }) })
      const data = await response.json(); if (!response.ok || !data.ok) throw new Error(data.error || `${action} failed`)
      if (action === 'preview') setPreview(data)
      if (action === 'commit') setResult(data)
      if (action === 'undo') setResult({ ...result, undone: true, totalRemoved: data.totalRemoved })
    } catch (reason) { setError(reason.message) } finally { setBusy(false) }
  }
  const savePreset = async () => {
    if (!presetName.trim()) return
    const response = await fetch('/api/openocti/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'save-preset', preset: { name: presetName, objectType, mapping } }) })
    const data = await response.json(); if (data.ok) { setMeta(current => ({ ...current, savedPresets: data.presets })); setPresetName('') }
  }
  const applyPreset = value => {
    if (!value) return
    const saved = (meta?.savedPresets || []).find(item => item.name === value && item.objectType === objectType)
    if (saved) setMapping(saved.mapping)
    else detect().catch(reason => setError(reason.message))
  }
  const downloadTemplate = () => {
    const content = `${(config?.fields || []).join(',')}\r\n`; const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' })); const anchor = document.createElement('a')
    anchor.href = url; anchor.download = `openocti-${objectType}-template.csv`; anchor.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap gap-3 items-end">
          <label className="grid gap-1 text-sm font-semibold">Import type<select value={objectType} onChange={event => { setObjectType(event.target.value); setPreview(null); setResult(null); if (headers.length) detect(headers, event.target.value).catch(reason => setError(reason.message)) }} className="rounded-lg px-3" style={{ minHeight: 44, background: 'var(--surface2)', border: '1px solid var(--border)' }}>{Object.entries(meta?.objects || {}).map(([id, item]) => <option key={id} value={id}>{item.label}</option>)}</select></label>
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.vcf,text/csv,text/vcard" className="hidden" onChange={event => loadFile(event.target.files?.[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)' }} className="inline-flex items-center gap-2"><Upload size={17} /> Upload CSV, XLSX, or vCard</button>
          <button type="button" onClick={downloadTemplate} style={{ ...buttonStyle, border: '1px solid var(--border)' }} className="inline-flex items-center gap-2"><Download size={17} /> CSV template</button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>Auto-detects HubSpot, Pipedrive, Salesforce, Zoho, Google Contacts, Outlook/CSV, and vCard columns. Duplicate checks use email, phone, then name + company.</p>
      </section>

      {headers.length > 0 && <section className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <h2 className="font-semibold flex items-center gap-2"><FileSpreadsheet size={19} /> Map {rows.length} rows</h2>
        <div className="mt-3 overflow-auto"><table className="w-full text-sm"><thead><tr>{headers.map((header, index) => <th key={`${header}-${index}`} className="text-left p-2"><div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{header}</div><select value={mapping[index] || ''} onChange={event => setMapping(current => current.map((value, mapIndex) => mapIndex === index ? event.target.value : value))} className="rounded px-2" style={{ minHeight: 38, background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="">Skip</option>{(config?.fields || []).map(field => <option key={field} value={field}>{field}</option>)}</select></th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, rowIndex) => <tr key={rowIndex} style={{ borderTop: '1px solid var(--border)' }}>{headers.map((_, columnIndex) => <td key={columnIndex} className="p-2 max-w-48 truncate">{String(row[columnIndex] ?? '')}</td>)}</tr>)}</tbody></table></div>
        <div className="mt-4 flex flex-wrap gap-2 items-center"><select defaultValue="" onChange={event => applyPreset(event.target.value)} className="rounded-lg px-3" style={{ minHeight: 42, background: 'var(--surface2)', border: '1px solid var(--border)' }}><option value="">Apply preset…</option>{(meta?.builtInPresets || []).map(name => <option key={name} value={name}>{name}</option>)}{(meta?.savedPresets || []).filter(item => item.objectType === objectType).map(item => <option key={`saved-${item.name}`} value={item.name}>{item.name} (saved)</option>)}</select><input value={presetName} onChange={event => setPresetName(event.target.value)} placeholder="Preset name" className="rounded-lg px-3" style={{ minHeight: 42, background: 'var(--surface2)', border: '1px solid var(--border)' }} /><button type="button" onClick={savePreset} style={{ ...buttonStyle, border: '1px solid var(--border)' }}>Save mapping preset</button><button disabled={busy} type="button" onClick={() => request('preview')} style={{ ...buttonStyle, marginLeft: 'auto', background: 'var(--accent)', color: 'var(--accent-text)' }}>Preview &amp; validate</button></div>
      </section>}

      {preview && <section className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><h2 className="font-semibold">Ready to import</h2><p className="mt-2">{preview.valid} valid · {preview.duplicates} duplicates · {preview.invalid} invalid</p><div className="mt-3 overflow-auto"><table className="w-full text-sm"><tbody>{preview.rows.slice(0, 12).map(item => <tr key={item.index} style={{ borderTop: '1px solid var(--border)' }}><td className="p-2">Row {item.index + 2}</td><td className="p-2">{item.record.name || item.record.title || item.record.email}</td><td className="p-2">{!item.valid ? 'Invalid' : item.duplicate ? 'Duplicate — skip' : 'Ready'}</td></tr>)}</tbody></table></div><button disabled={busy} type="button" onClick={() => request('commit')} className="mt-4" style={{ ...buttonStyle, background: 'var(--accent)', color: 'var(--accent-text)' }}>Import valid rows</button></section>}

      {result && <section role="status" className="rounded-xl p-5" style={{ background: 'rgba(48,192,240,.1)', border: '1px solid rgba(48,192,240,.4)' }}><h2 className="font-semibold">{result.undone ? 'Import undone' : 'Import complete'}</h2><p className="mt-1">{result.undone ? `${result.totalRemoved} rows removed from this batch.` : `${result.added} added; ${result.skipped} skipped.`}</p>{!result.undone && <button type="button" disabled={busy} onClick={() => request('undo')} className="mt-3 inline-flex items-center gap-2" style={{ ...buttonStyle, border: '1px solid var(--border)' }}><RotateCcw size={17} /> Undo this batch</button>}</section>}
      {error && <div role="alert" className="rounded-lg p-3" style={{ color: 'var(--red)', background: 'var(--red-soft)' }}>{error}</div>}

      <section className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><h2 className="font-semibold">Export your data</h2><p className="text-sm mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>Owner-only CSV exports. Your records are never locked in.</p><div className="flex flex-wrap gap-2">{Object.entries(meta?.objects || {}).map(([id, item]) => <a key={id} href={`/api/openocti/import?export=${id}`} style={{ ...buttonStyle, border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center' }}><Download size={15} className="mr-2" />{item.label}</a>)}</div></section>
      <Link href="/" className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Back to dashboard</Link>
    </div>
  )
}
