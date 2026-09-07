import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import OpenOctiAskButton from '@/app/components/OpenOctiAskButton'

vi.mock('@/app/components/OpenOctiGuidePanel', () => ({ default: ({ initialPrompt }) => <div>Guide ready {initialPrompt}<button>Start voice with Octi</button></div> }))

beforeEach(() => {
  window.history.replaceState({}, '', '/')
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
  global.fetch = vi.fn(async () => ({ json: async () => ({ capabilities: [{ id: 'openai', status: 'configured' }] }) }))
})

it('opens the guide immediately when the checklist requests it after initial load', async () => {
  render(<OpenOctiAskButton />)
  await act(async () => {})
  expect(screen.queryByRole('dialog')).toBeNull()
  act(() => window.dispatchEvent(new CustomEvent('openocti:ask', { detail: { prompt: 'Introduce the agents' } })))
  expect(screen.getByRole('dialog')).toHaveAttribute('open')
  expect(screen.getByText('Guide ready Introduce the agents')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Start voice with Octi' })).toBeInTheDocument()
})

it('opens an incoming Meet your agents link without a timer or navigation race', async () => {
  window.history.replaceState({}, '', '/?tab=agents&ask=octi')
  render(<OpenOctiAskButton />)
  await act(async () => {})
  expect(screen.getByRole('dialog')).toHaveAttribute('open')
})

it('closes and unmounts the guide so active voice cleanup can run', async () => {
  render(<OpenOctiAskButton />)
  await act(async () => {})
  fireEvent.click(screen.getByRole('button', { name: 'Ask Octi' }))
  fireEvent.click(screen.getByRole('button', { name: 'Close Octi guide' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
