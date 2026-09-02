import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: { dossiers: [] },
  documents: { documents: [] },
  writeData: vi.fn(),
  saveDocumentData: vi.fn(),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(() => ({ dossiers: mocks.store.dossiers })),
  writeData: mocks.writeData,
}))

vi.mock('../lib/documentSignatures', () => ({
  loadDocumentData: vi.fn(() => mocks.documents),
  saveDocumentData: mocks.saveDocumentData,
}))

vi.mock('../lib/entityStore', () => ({
  loadAll: vi.fn(() => []),
  logActivity: vi.fn(),
}))

import {
  createDossierRecord,
  deleteDossierRecord,
  saveDossierRecord,
  updateDossierRecord,
} from '../lib/research-dossiers'

describe('research dossier store CRUD', () => {
  beforeEach(() => {
    mocks.store.dossiers = []
    mocks.documents = { documents: [] }
    mocks.writeData.mockReset()
    mocks.saveDocumentData.mockReset()
    mocks.writeData.mockImplementation((_file, data) => {
      mocks.store.dossiers = data.dossiers
    })
  })

  it('creates, updates, and deletes a persisted dossier', () => {
    const created = createDossierRecord({
      target: 'Acme',
      riskLevel: 'low',
      confidence: 'High',
      dossier: { executiveSummary: 'Initial', agentOnlyField: 'preserve me' },
    })
    expect(mocks.store.dossiers).toHaveLength(1)
    expect(created.status).toBe('unfiled')

    const updated = updateDossierRecord(created.id, {
      target: 'Acme Industries',
      dossier: { executiveSummary: 'Updated' },
    })
    expect(updated.target).toBe('Acme Industries')
    expect(updated.dossier.executiveSummary).toBe('Updated')
    expect(updated.dossier.agentOnlyField).toBe('preserve me')

    const deleted = deleteDossierRecord(created.id)
    expect(deleted.record.id).toBe(created.id)
    expect(deleted.filedDocumentRetained).toBe(false)
    expect(mocks.store.dossiers).toHaveLength(0)
  })

  it('synchronizes edits to a filed document and retains it on delete', () => {
    const created = createDossierRecord({ target: 'Filed target', dossier: { executiveSummary: 'Initial' } })
    saveDossierRecord({ ...created, filedDocumentId: 'doc_1', status: 'filed' })
    mocks.documents.documents = [{ id: 'doc_1', title: 'Old title', body: 'Old body' }]

    updateDossierRecord(created.id, { target: 'Updated target', dossier: { executiveSummary: 'New summary' } })
    expect(mocks.saveDocumentData).toHaveBeenCalledOnce()
    expect(mocks.documents.documents[0].title).toContain('Updated target')
    expect(mocks.documents.documents[0].body).toContain('New summary')

    const deleted = deleteDossierRecord(created.id)
    expect(deleted.filedDocumentRetained).toBe(true)
    expect(mocks.documents.documents).toHaveLength(1)
  })
})
