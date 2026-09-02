'use client'
import { useRef, useState } from 'react'
import { Download, GitCompareArrows, Upload } from 'lucide-react'

export function FinanceCsvExportButton({ csv = '', filename = 'finance-export.csv', label = 'Export CSV' }) {
  const download = () => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const href = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = href
    link.download = filename
    link.click()
    URL.revokeObjectURL(href)
  }

  return (
    <button type="button" onClick={download} disabled={!csv} aria-label={label} data-tooltip={label} className="rounded-lg p-2 font-semibold inline-flex items-center justify-center disabled:opacity-50" style={{ width: 40, height: 40, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
      <Download size={16} />
    </button>
  )
}

export default function FinanceImportButton({ onImported }) {
  const inputRef = useRef(null)
  const reconcileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [reconciling, setReconciling] = useState(false)

  const uploadFile = async (file, { endpoint, mode, setBusy, eventName }) => {
    if (!file) return
    setBusy(true)
    const form = new FormData()
    form.append('file', file)
    try {
      const result = await fetch(endpoint, {
        method: 'POST',
        body: form,
      }).then(r => r.json())
      onImported?.({ ...result, mode })
      if (result?.ok) {
        window.dispatchEvent(new CustomEvent(eventName, { detail: result }))
        window.dispatchEvent(new CustomEvent('fcc:finance-alerts-changed'))
      }
    } catch (e) {
      onImported?.({ ok: false, mode, error: e.message || 'Import failed' })
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
      if (reconcileInputRef.current) reconcileInputRef.current.value = ''
    }
  }

  return (
    <div className="inline-flex items-center gap-2 flex-wrap justify-end">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={e => uploadFile(e.target.files?.[0], {
          endpoint: '/api/subscriptions/import',
          mode: 'import',
          setBusy: setImporting,
          eventName: 'fcc:subscriptions-imported',
        })}
      />
      <input
        ref={reconcileInputRef}
        type="file"
        accept=".csv,.tsv,text/csv,text/tab-separated-values"
        className="hidden"
        onChange={e => uploadFile(e.target.files?.[0], {
          endpoint: '/api/subscriptions/reconcile',
          mode: 'reconcile',
          setBusy: setReconciling,
          eventName: 'fcc:subscriptions-reconciled',
        })}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={importing || reconciling}
        className="px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
        style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 40, border: '1px solid var(--border)' }}
        title="Import CSV into finance"
      >
        <Upload size={15} /> {importing ? 'Importing...' : 'Import CSV'}
      </button>
      <button
        onClick={() => reconcileInputRef.current?.click()}
        disabled={importing || reconciling}
        className="px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40, border: 'none' }}
        title="Reconcile email receipt and invoice CSV against finance"
      >
        <GitCompareArrows size={15} /> {reconciling ? 'Reconciling...' : 'Reconcile CSV'}
      </button>
    </div>
  )
}
