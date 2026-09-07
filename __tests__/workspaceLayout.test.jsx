import React from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it } from 'vitest'
import WorkspaceLayoutSettings from '../app/components/WorkspaceLayoutSettings'
import { normalizeWorkspaceLayout, useWorkspaceLayout } from '../lib/use-workspace-layout'

function ObservedLayout() {
  const { layout } = useWorkspaceLayout()
  return <output data-testid="layout">{JSON.stringify(layout)}</output>
}
beforeEach(() => localStorage.clear())
afterEach(() => { cleanup(); localStorage.clear() })

it('starts both optional controls off even when old visibility preferences would show them', async () => {
  localStorage.setItem('fcc-right-rail-collapsed', '0')
  localStorage.setItem('fcc-operator-prompt-hidden', '0')
  render(<><WorkspaceLayoutSettings /><ObservedLayout /></>)
  expect(screen.getByRole('switch', { name: 'Right assistant sidebar' }).checked).toBe(false)
  expect(screen.getByRole('switch', { name: 'Bottom command bar' }).checked).toBe(false)
  expect(JSON.parse(screen.getByTestId('layout').textContent)).toEqual({ rightSidebar: false, bottomBar: false })
})
it('updates independently, notifies the workspace, and preserves explicit choices after remount', async () => {
  const view = render(<><WorkspaceLayoutSettings /><ObservedLayout /></>)
  fireEvent.click(screen.getByRole('switch', { name: 'Right assistant sidebar' }))
  await waitFor(() => expect(JSON.parse(screen.getByTestId('layout').textContent)).toEqual({ rightSidebar: true, bottomBar: false }))
  fireEvent.click(screen.getByRole('switch', { name: 'Bottom command bar' }))
  fireEvent.click(screen.getByRole('switch', { name: 'Right assistant sidebar' }))
  expect(JSON.parse(localStorage.getItem('openocti.workspace-layout.v1'))).toEqual({ rightSidebar: false, bottomBar: true })
  view.unmount()
  render(<WorkspaceLayoutSettings />)
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Bottom command bar' }).checked).toBe(true))
  expect(screen.getByRole('switch', { name: 'Right assistant sidebar' }).checked).toBe(false)
})
it('synchronizes another browser tab and ignores malformed preference values', async () => {
  localStorage.setItem('openocti.workspace-layout.v1', '{broken')
  render(<WorkspaceLayoutSettings />)
  expect(screen.getByRole('switch', { name: 'Bottom command bar' }).checked).toBe(false)
  localStorage.setItem('openocti.workspace-layout.v1', JSON.stringify({ rightSidebar: true, bottomBar: false }))
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'openocti.workspace-layout.v1' })))
  await waitFor(() => expect(screen.getByRole('switch', { name: 'Right assistant sidebar' }).checked).toBe(true))
  expect(normalizeWorkspaceLayout({ rightSidebar: 'false', bottomBar: 1 })).toEqual({ rightSidebar: false, bottomBar: false })
})
