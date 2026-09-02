'use client'
import { useState, useEffect } from 'react'
import PaymentTerminal from '../payments/PaymentTerminal'
import InvoicesManager from '../billing/InvoicesManager'
import OverheadManager from '../overhead/OverheadManager'
import FinanceOverview from './FinanceOverview'
import FinanceImportButton from './FinanceImportButton'
import PrivacyFinancePanel from './PrivacyFinancePanel'
import ApiSpendMonitor from './ApiSpendMonitor'
import PageHeader from '../components/PageHeader'
import { DollarSign } from 'lucide-react'

const SUB_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'overhead', label: 'Overhead' },
  { id: 'payments', label: 'Payments' },
  { id: 'invoices', label: 'Invoices' },
  { id: 'privacy', label: 'Privacy' },
  { id: 'api-spend', label: 'API Spend' },
]

export default function FinanceManager({ showApiSpend = true }) {
  const [sub, setSub] = useState('overview')
  const [importResult, setImportResult] = useState(null)

  useEffect(() => {
    const saved = localStorage.getItem('fcc-finance-sub')
    if (saved && SUB_TABS.some(t => t.id === saved)) setSub(saved)
  }, [])

  useEffect(() => {
    const handler = (e) => {
      const id = typeof e.detail === 'string' ? e.detail : e.detail?.sub
      if (id && SUB_TABS.some(t => t.id === id)) {
        setSub(id)
        try { localStorage.setItem('fcc-finance-sub', id) } catch {}
      }
    }
    window.addEventListener('fcc:finance-sub', handler)
    return () => window.removeEventListener('fcc:finance-sub', handler)
  }, [])

  const change = (id, options = {}) => {
    setSub(id)
    try { localStorage.setItem('fcc-finance-sub', id) } catch {}
    if (!options.silentHistory) {
      window.dispatchEvent(new CustomEvent('fcc:navigate', {
        detail: { tab: 'finance', subtab: id, replace: options.replace === true, silentAudit: true },
      }))
    }
  }

  const handleImported = (result) => {
    setImportResult(result)
    if (result?.ok) change('overhead')
  }

  const importMessage = () => {
    if (!importResult?.ok) return `CSV import failed: ${importResult?.error || 'Unknown error'}`
    if (importResult.mode === 'reconcile') {
      return `Reconciliation preview: ${importResult.suggested_create || 0} new suggestions, ${importResult.suggested_update || 0} adjustment suggestions, ${importResult.unchanged || 0} unchanged, ${importResult.needs_review || 0} need review, ${importResult.skipped || 0} skipped.`
    }
    return `CSV import complete: ${importResult.created || 0} new, ${importResult.updated || 0} updated, ${importResult.skipped || 0} skipped.`
  }

  const reviewItems = importResult?.mode === 'reconcile'
    ? (importResult.items || []).filter(item => item.action === 'needs_review').slice(0, 3)
    : []
  const suggestionItems = importResult?.mode === 'reconcile'
    ? (importResult.items || []).filter(item => item.action === 'suggested_create' || item.action === 'suggested_update').slice(0, 4)
    : []

  return (
    <>
      <div className="command-workspace px-4 sm:px-5 pt-4 sm:pt-5 pb-0">
        <PageHeader
          icon={<DollarSign size={22} />}
          title="Finance"
          subtitle="Overview, overhead, payments, invoices, and financing paths."
          actions={<FinanceImportButton onImported={handleImported} />}
        />
        {importResult && (
          <div className="rounded-xl mb-3 px-4 py-3" style={{ background: importResult.ok ? 'var(--surface)' : 'var(--red-soft, rgba(220,38,38,0.12))', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div style={{ color: 'var(--text)', fontSize: 14 }}>
                {importMessage()}
              </div>
              <button
                onClick={() => setImportResult(null)}
                className="text-xs px-2 py-1 rounded"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Dismiss
              </button>
            </div>
            {reviewItems.length > 0 && (
              <div className="mt-2 grid gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {reviewItems.map(item => (
                  <div key={`${item.row}-${item.vendor}`}>
                    Row {item.row}: {item.vendor}{item.productOrPlan ? ` / ${item.productOrPlan}` : ''} needs review because {item.reason}.
                  </div>
                ))}
              </div>
            )}
            {suggestionItems.length > 0 && (
              <div className="mt-2 grid gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                {suggestionItems.map(item => (
                  <div key={`${item.action}-${item.row}-${item.vendor}`}>
                    Row {item.row}: {item.action === 'suggested_create' ? 'suggest new' : 'suggest update'} for {item.vendor}{item.productOrPlan ? ` / ${item.productOrPlan}` : ''} ({item.reason}).
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div
          className="command-segmented-control grid gap-1 p-1 rounded-lg mb-2"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', width: '100%', gridTemplateColumns: `repeat(${showApiSpend ? 6 : 5}, minmax(0, 1fr))` }}
        >
          {SUB_TABS.filter(t => showApiSpend || t.id !== 'api-spend').map(t => (
            <button
              key={t.id}
              onClick={() => change(t.id)}
              className="rounded-md transition"
              style={{
                padding: '7px 10px',
                minHeight: 34,
                fontSize: 13,
                fontWeight: 650,
                background: sub === t.id ? 'var(--accent)' : 'transparent',
                color: sub === t.id ? 'var(--accent-text)' : 'var(--text-muted)',
                border: 'none',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                width: '100%',
                textAlign: 'center',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {sub === 'overview' && <FinanceOverview onJump={change} />}
      {sub === 'overhead' && <OverheadManager />}
      {sub === 'payments' && <PaymentTerminal />}
      {sub === 'privacy' && <PrivacyFinancePanel />}
      {sub === 'api-spend' && showApiSpend && <ApiSpendMonitor mode="panel" />}
      {sub === 'invoices' && (
        <div className="p-4 sm:p-5">
          <InvoicesManager />
        </div>
      )}
    </>
  )
}
