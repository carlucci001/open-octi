import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BenchRegistry from '../app/nvidia-labs/BenchRegistry'

const entries = [
  { id: 'openai/gpt-test', modelId: 'openai/gpt-test', name: 'GPT Test', displayName: 'GPT Test', providerLabel: 'OpenAI', tier: 'standard', bestFor: 'Daily work', benchNotes: 'Daily work', configured: true, enabled: true, custom: false },
  { id: 'bench_quality', modelId: 'deepseek/test', name: 'DeepSeek Test', displayName: 'Quality profile', providerLabel: 'DeepSeek', tier: 'fast', bestFor: 'Fast tasks', benchNotes: 'Quality check', configured: true, enabled: true, custom: true },
]

function setup() {
  const props = {
    entries,
    catalogModels: entries.map(entry => ({ ...entry, id: entry.modelId })),
    selectedModels: [],
    onToggleModel: vi.fn(),
    onSelectReadyPair: vi.fn(),
    onSelectReadySlate: vi.fn(),
    onClear: vi.fn(),
    onCreate: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onDelete: vi.fn(async () => {}),
  }
  render(<BenchRegistry {...props} />)
  return props
}

describe('BenchRegistry', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.stubGlobal('confirm', vi.fn(() => true))
  })

  it('defaults to list view and remembers the card toggle', () => {
    setup()
    expect(screen.getByTestId('bench-list-view')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Card view' }))
    expect(screen.getByTestId('bench-card-view')).toBeInTheDocument()
    expect(localStorage.getItem('fcc:ai-lab-bench-view')).toBe('card')
  })

  it('fires selection and update through labeled controls and the kebab menu', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use GPT Test in comparison' }))
    expect(props.onToggleModel).toHaveBeenCalledWith('openai/gpt-test')

    fireEvent.click(screen.getByRole('button', { name: 'GPT Test actions' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map(item => item.textContent)).toEqual([
      'Add to comparison',
      'Edit Bench details',
      'Hide from Bench',
    ])
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Edit Bench details' }))
    fireEvent.change(screen.getByLabelText('Bench name'), { target: { value: 'GPT Test edited' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Bench profile' }))
    await waitFor(() => expect(props.onUpdate).toHaveBeenCalledWith(expect.objectContaining({
      id: 'openai/gpt-test',
      displayName: 'GPT Test edited',
    })))
  })

  it('creates and deletes real local Bench profiles', async () => {
    const props = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Add profile' }))
    fireEvent.change(screen.getByLabelText('Bench name'), { target: { value: 'New route profile' } })
    fireEvent.change(screen.getByLabelText('Bench notes'), { target: { value: 'Local evaluation notes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Bench profile' }))
    await waitFor(() => expect(props.onCreate).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'New route profile',
      notes: 'Local evaluation notes',
    })))

    fireEvent.click(screen.getByRole('button', { name: 'Quality profile actions' }))
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Delete Bench profile' }))
    expect(confirm).toHaveBeenCalled()
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: 'bench_quality' })))
  })
})
