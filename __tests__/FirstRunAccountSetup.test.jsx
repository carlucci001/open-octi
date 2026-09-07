import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
const router = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
import FirstRunAccountSetup from '@/app/login/FirstRunAccountSetup'
beforeEach(() => { vi.clearAllMocks(); global.fetch = vi.fn() })
function fill(password, confirmPassword = password) {
  fireEvent.change(screen.getByLabelText('Username'), { target: { value: 'demo-owner' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } })
  fireEvent.change(screen.getByLabelText('Confirm password'), { target: { value: confirmPassword } })
}
it('explains the first launch and keeps account creation visible', () => {
  render(<FirstRunAccountSetup local />)
  expect(screen.getByRole('heading', { name: 'Create your admin account' })).toBeInTheDocument()
  expect(screen.getByText(/First launch may take a minute/)).toBeInTheDocument()
})
it('does not submit mismatched passwords', () => {
  render(<FirstRunAccountSetup local />)
  fill('first-demo-password', 'second-demo-password')
  fireEvent.submit(screen.getByRole('button', { name: 'Create account and get started' }).closest('form'))
  expect(screen.getByRole('alert')).toHaveTextContent('passwords do not match')
  expect(fetch).not.toHaveBeenCalled()
})
it('shows a first-load status after account creation while opening the workspace', async () => {
  fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  render(<FirstRunAccountSetup local />)
  fill('test-demo-password')
  fireEvent.submit(screen.getByRole('button', { name: 'Create account and get started' }).closest('form'))
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'))
  expect(screen.getByRole('status')).toHaveTextContent('first load may take a minute')
})
