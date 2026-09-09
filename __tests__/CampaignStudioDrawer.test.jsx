import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CampaignStudio from '../app/campaign-studio/CampaignStudio'

vi.mock('../app/components/PageHeader', () => ({
  default: ({ title, actions, viewToggle }) => <header><h1>{title}</h1>{actions}{viewToggle}</header>,
}))
vi.mock('../app/components/ComponentSettings', () => ({
  default: () => null,
  useComponentSettings: () => ({ loaded: false }),
}))
vi.mock('../app/components/ThemedSelect', () => ({
  default: props => <select {...props} />,
}))
vi.mock('../app/components/ViewModeToggle', () => ({
  default: ({ value, onChange, modes = ['list', 'card'] }) => (
    <div>{modes.map(mode => <button key={mode} aria-pressed={value === mode} onClick={() => onChange(mode)}>{mode} view</button>)}</div>
  ),
}))
vi.mock('../app/components/BulkActionsMenu', () => ({ default: () => null }))
vi.mock('../app/components/MediaPickerModal', () => ({ default: () => null }))
vi.mock('../app/campaign-studio/SocialOperatorPanel', () => ({ default: () => null }))
vi.mock('../app/social/SocialPublishing', () => ({ default: () => null }))

const campaigns = ['First campaign', 'Second campaign', 'Third campaign'].map((name, index) => ({
  id: `campaign-${index + 1}`,
  name,
  audience: 'Local businesses',
  market: 'United States',
  platforms: ['Facebook'],
  posts: [],
  summary: { total: 0 },
}))

beforeEach(() => {
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async url => ({
    ok: true,
    json: async () => url === '/api/campaign-studio' ? { campaigns } : { accounts: [] },
  })))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

function expectDrawerAfter(name, nextName) {
  const trigger = screen.getByRole('button', { name, exact: true })
  const drawer = screen.getByRole('region', { name: `${name} details` })
  expect(trigger).toHaveAttribute('aria-expanded', 'true')
  expect(trigger).toHaveAttribute('aria-controls', drawer.id)
  // This is the reported regression: no other campaign or paginator may
  // appear between a selected campaign and its details.
  expect(trigger.nextElementSibling).toBe(drawer)
  if (nextName) expect(drawer.nextElementSibling).toBe(screen.getByRole('button', { name: nextName, exact: true }))
  expect(drawer.style.maxHeight).toBe('')
  expect(drawer.style.overflowY).toBe('')
  expect(screen.getAllByRole('region', { name: /campaign details$/ })).toHaveLength(1)
  return drawer
}

describe('Campaigns downward drawers', () => {
  it.each(['list', 'card'])('opens first and middle campaigns in place in %s view', async view => {
    render(<CampaignStudio />)
    await screen.findByRole('button', { name: 'First campaign', exact: true })
    fireEvent.click(screen.getByRole('button', { name: `${view} view`, exact: true }))
    fireEvent.click(screen.getByRole('button', { name: 'First campaign', exact: true }))
    const firstDrawer = expectDrawerAfter('First campaign', 'Second campaign')
    expect(firstDrawer.style.gridColumn).toBe('1 / -1')
    fireEvent.click(screen.getByRole('button', { name: 'Second campaign', exact: true }))
    expectDrawerAfter('Second campaign', 'Third campaign')
    expect(screen.queryByRole('region', { name: 'First campaign details' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Second campaign', exact: true }))
    expect(screen.queryByRole('region', { name: /campaign details$/ })).not.toBeInTheDocument()
  })

  it('supports keyboard expansion, child controls, close, and Escape', async () => {
    render(<CampaignStudio />)
    const first = await screen.findByRole('button', { name: 'First campaign', exact: true })
    fireEvent.keyDown(first, { key: 'Enter' })
    const drawer = expectDrawerAfter('First campaign', 'Second campaign')
    fireEvent.keyDown(within(first).getByRole('checkbox'), { key: ' ' })
    expectDrawerAfter('First campaign', 'Second campaign')
    fireEvent.click(within(drawer).getByRole('button', { name: 'Close Preview' }))
    expect(first).toHaveAttribute('aria-expanded', 'false')
    fireEvent.keyDown(first, { key: ' ' })
    expectDrawerAfter('First campaign', 'Second campaign')
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(first).toHaveAttribute('aria-expanded', 'false')
  })

  it('keeps restored selection attached to its campaign and hides it when filtered out', async () => {
    localStorage.setItem('fcc:campaigns-workspace-state', JSON.stringify({ activeId: campaigns[0].id }))
    render(<CampaignStudio />)
    await screen.findByRole('region', { name: 'First campaign details' })
    expectDrawerAfter('First campaign', 'Second campaign')
    fireEvent.change(screen.getByPlaceholderText('Search name, target, post text'), { target: { value: 'Third campaign' } })
    expect(screen.queryByRole('region', { name: /campaign details$/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Third campaign', exact: true }))
    expectDrawerAfter('Third campaign')
  })

  it('reveals a campaign selected from the dropdown even when search hides its row', async () => {
    render(<CampaignStudio />)
    await screen.findByRole('button', { name: 'First campaign', exact: true })
    fireEvent.change(screen.getByPlaceholderText('Search name, target, post text'), { target: { value: 'Third campaign' } })
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: campaigns[0].id } })
    expectDrawerAfter('First campaign', 'Second campaign')
    expect(screen.getByPlaceholderText('Search name, target, post text')).toHaveValue('')
  })
})
