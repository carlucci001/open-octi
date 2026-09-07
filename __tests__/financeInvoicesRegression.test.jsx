import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import FinanceManager from '@/app/finance/FinanceManager'

vi.mock('@/app/payments/PaymentTerminal', () => ({ default: () => null }))
vi.mock('@/app/overhead/OverheadManager', () => ({ default: () => null }))
vi.mock('@/app/finance/FinanceOverview', () => ({ default: () => null }))
vi.mock('@/app/finance/FinanceImportButton', () => ({ default: () => null }))
vi.mock('@/app/finance/PrivacyFinancePanel', () => ({ default: () => null }))
vi.mock('@/app/finance/ApiSpendMonitor', () => ({ default: () => null }))
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

it('opens the real public invoice component when Finance restores the invoices tab', async () => {
  localStorage.setItem('fcc-finance-sub', 'invoices')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ invoices: [{ id: 'test-invoice', number: 'INV-101', clientName: 'Example client', amount: 125, status: 'draft', items: [] }] }) }))
  render(<FinanceManager />)
  expect(await screen.findByText('INV-101')).toBeVisible()
  expect(screen.getByText('Example client')).toBeVisible()
  expect(screen.getByRole('button', { name: 'New invoice' })).toBeVisible()
})

it('shows an invoice loading failure without crashing Finance', async () => {
  localStorage.setItem('fcc-finance-sub', 'invoices')
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: 'Invoices unavailable' }) }))
  render(<FinanceManager />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Invoices unavailable')
})
