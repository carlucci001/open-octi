import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PortalListToolbar from '../app/portal/components/PortalListToolbar'
import PortalPaginator from '../app/portal/components/PortalPaginator'

afterEach(() => cleanup())

const sortOptions = [
  { value: 'createdAt', label: 'Date' },
  { value: 'subject', label: 'Subject' },
]

describe('PortalListToolbar', () => {
  it('exposes accessible toolbar, search, sort, and sort-order labels', () => {
    render(
      <PortalListToolbar
        label="Activity controls"
        search=""
        onSearch={() => {}}
        searchPlaceholder="Search activity"
        sortBy="createdAt"
        sortOptions={sortOptions}
        onSortBy={() => {}}
        sortOrder="asc"
        onSortOrder={() => {}}
      />,
    )

    expect(screen.getByRole('region', { name: 'Activity controls' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveAttribute('placeholder', 'Search activity')
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toHaveValue('createdAt')
    expect(screen.getByRole('button', { name: 'Sort descending' })).toBeInTheDocument()
  })

  it('clears an active search through the search callback', () => {
    const onSearch = vi.fn()
    render(
      <PortalListToolbar
        label="Activity controls"
        search="invoice"
        onSearch={onSearch}
        sortBy="createdAt"
        sortOptions={sortOptions}
        onSortBy={() => {}}
        sortOrder="desc"
        onSortOrder={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))

    expect(onSearch).toHaveBeenCalledOnce()
    expect(onSearch).toHaveBeenCalledWith('')
  })

  it('requests the opposite sort order', () => {
    const onSortOrder = vi.fn()
    render(
      <PortalListToolbar
        label="Document controls"
        search=""
        onSearch={() => {}}
        sortBy="subject"
        sortOptions={sortOptions}
        onSortBy={() => {}}
        sortOrder="desc"
        onSortOrder={onSortOrder}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Sort ascending' }))

    expect(onSortOrder).toHaveBeenCalledOnce()
    expect(onSortOrder).toHaveBeenCalledWith('asc')
  })
})

describe('PortalPaginator', () => {
  it('disables backward buttons on the first page and enables forward navigation callbacks', () => {
    const onPage = vi.fn()
    render(
      <PortalPaginator
        totalItems={42}
        totalPages={5}
        page={1}
        pageSize={10}
        onPage={onPage}
        onPageSize={() => {}}
        label="activities"
      />,
    )

    expect(screen.getByRole('navigation', { name: 'activities pagination' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'First page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }))

    expect(onPage.mock.calls).toEqual([[2], [5]])
  })

  it('enables backward navigation and disables forward buttons on the last page', () => {
    const onPage = vi.fn()
    render(
      <PortalPaginator
        totalItems={42}
        totalPages={5}
        page={5}
        pageSize={10}
        onPage={onPage}
        onPageSize={() => {}}
        label="activities"
      />,
    )

    expect(screen.getByRole('button', { name: 'First page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Last page' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: 'First page' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous page' }))

    expect(onPage.mock.calls).toEqual([[1], [4]])
  })

  it('reports page-size changes as numbers', () => {
    const onPageSize = vi.fn()
    render(
      <PortalPaginator
        totalItems={42}
        totalPages={5}
        page={1}
        pageSize={10}
        onPage={() => {}}
        onPageSize={onPageSize}
        label="documents"
      />,
    )

    fireEvent.change(screen.getByRole('combobox', { name: 'Per page' }), { target: { value: '50' } })

    expect(onPageSize).toHaveBeenCalledOnce()
    expect(onPageSize).toHaveBeenCalledWith(50)
  })

  it('shows a zero-item range and disables every page button', () => {
    render(
      <PortalPaginator
        totalItems={0}
        totalPages={0}
        page={1}
        pageSize={10}
        onPage={() => {}}
        onPageSize={() => {}}
        label="documents"
      />,
    )

    expect(screen.getByText('0–0')).toBeInTheDocument()
    expect(screen.getByText(/of 0 documents/)).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    for (const name of ['First page', 'Previous page', 'Next page', 'Last page']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })
})
