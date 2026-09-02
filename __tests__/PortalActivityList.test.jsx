import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ActivityList from '../app/portal/activity/ActivityList'

const activity = {
  id: 'activity-1',
  type: 'email_sent',
  subject: 'Quarterly report delivered',
  body: 'The complete quarterly report was delivered to the client with the requested supporting files.',
  createdAt: '2026-07-18T12:30:00.000Z',
  archived: false,
  archivedAt: null,
}

describe('Portal ActivityList', () => {
  it('renders a compact row and opens full activity details', () => {
    render(<ActivityList activities={[activity]} />)

    const open = screen.getByRole('button', { name: 'Open activity: Quarterly report delivered' })
    expect(open).toBeInTheDocument()
    expect(screen.queryByText(activity.body)).not.toBeInTheDocument()
    fireEvent.click(open)

    const dialog = screen.getByRole('dialog', { name: 'Quarterly report delivered' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText(activity.body)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close activity details' })).toHaveFocus()
  })

  it('closes details with Escape and restores focus to the row', () => {
    render(<ActivityList activities={[activity]} />)

    const open = screen.getByRole('button', { name: 'Open activity: Quarterly report delivered' })
    fireEvent.click(open)
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    return new Promise(resolve => window.setTimeout(() => {
      expect(open).toHaveFocus()
      resolve()
    }, 0))
  })

  it('offers archive and restore actions without nesting them in the row button', () => {
    const onArchive = vi.fn()
    const { rerender } = render(<ActivityList activities={[activity]} onArchive={onArchive} />)

    fireEvent.click(screen.getByRole('button', { name: 'Archive Quarterly report delivered' }))
    expect(onArchive).toHaveBeenCalledWith(activity, true)

    const archived = { ...activity, archived: true, archivedAt: '2026-07-18T13:00:00.000Z' }
    rerender(<ActivityList activities={[archived]} onArchive={onArchive} />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore Quarterly report delivered' }))
    expect(onArchive).toHaveBeenLastCalledWith(archived, false)
  })
})
