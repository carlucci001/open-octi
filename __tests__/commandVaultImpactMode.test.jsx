import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/dynamic', () => ({
  default: () => React.forwardRef(function MockForceGraph({ graphData, onNodeClick }, _ref) {
    return (
      <div data-testid="force-graph">
        {(graphData?.nodes || []).map(node => (
          <button key={node.id} onClick={() => onNodeClick?.(node)}>
            {node.name}
          </button>
        ))}
      </div>
    )
  }),
}))

import NotesManager from '@/app/notes/NotesManager'

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function response(body) {
  return Promise.resolve({ json: () => Promise.resolve(body) })
}

describe('Command Vault Impact mode', () => {
  beforeEach(() => {
    localStorage.clear()
    global.ResizeObserver = ResizeObserverMock
    global.fetch = vi.fn((input) => {
      const url = String(input)
      if (url.includes('action=vaults')) {
        return response({
          vaults: [{
            id: 'fixture',
            name: 'Fixture',
            path: 'C:/fixture',
            available: true,
          }],
        })
      }
      if (url.includes('action=list')) {
        return response({
          vault: 'C:/fixture',
          fp: 'fixture-list',
          tree: {
            name: 'Fixture',
            path: '',
            folders: [],
            files: [{
              name: 'Runbook',
              path: 'runbook.md',
              size: 100,
              modifiedAt: '2026-07-26T00:00:00.000Z',
            }],
          },
        })
      }
      if (url.includes('action=insights')) {
        return response({
          metrics: {},
          topLinked: [],
          orphans: [],
          nodes: [],
          edges: [],
        })
      }
      if (url.includes('action=graph') && url.includes('mode=impact')) {
        return response({
          mode: 'impact',
          nodes: [
            {
              id: 'fixture/@source/routes.js',
              name: 'routes.js',
              kind: 'source',
              state: 'changed',
              links: 1,
            },
            {
              id: 'runbook.md',
              name: 'Runbook',
              kind: 'document',
              state: 'contradicted',
              links: 1,
            },
          ],
          edges: [{
            source: 'fixture/@source/routes.js',
            target: 'runbook.md',
            state: 'contradicted',
          }],
          findings: [{
            id: 'finding-1',
            state: 'contradicted',
            documentId: 'runbook.md',
            sourceId: 'fixture/@source/routes.js',
            reason: 'route /api/retired is absent and is referenced by this document',
            confidence: 0.99,
            deterministic: true,
            evidence: [{ type: 'identifier', value: '/api/retired' }],
          }],
          summary: {
            changedFiles: 1,
            affectedDocuments: 1,
            counts: { contradicted: 1, review: 0, changed: 0 },
          },
          repositories: [{
            id: 'fixture',
            range: 'working',
            changedFiles: 1,
          }],
        })
      }
      if (url.includes('action=graph')) {
        return response({ nodes: [], edges: [] })
      }
      return response({})
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows evidence-backed Impact findings in the native graph surface', async () => {
    render(<NotesManager />)

    fireEvent.click(await screen.findByRole('button', { name: /Graph/ }))
    fireEvent.click(await screen.findByRole('button', { name: /Impact/ }))

    expect(await screen.findByText('Changed files')).toBeInTheDocument()
    expect(screen.getByText('Semantic matches nominate review only; they cannot create red alerts.')).toBeInTheDocument()

    fireEvent.click(await screen.findByRole('button', { name: 'Runbook' }))
    expect(await screen.findByText(/route \/api\/retired is absent/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Open affected note/ })).toBeInTheDocument()

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('mode=impact'),
        expect.any(Object),
      )
    })
  })
})
