import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { readData } from '@/lib/dataStore'
import {
  commitMigrationJob,
  commitOpenOctiImport,
  createMigrationJob,
  detectImportMapping,
  dryRunMigrationJob,
  exportOpenOctiCsv,
  getMigrationJob,
  IMPORT_OBJECTS,
  IMPORT_PRESETS,
  importPresets,
  listMigrationJobs,
  MIGRATION_SOURCES,
  migrationRows,
  previewOpenOctiImport,
  pullMigrationApi,
  rollbackMigrationJob,
  saveImportPreset,
  setMigrationDecisions,
  stageMigrationRows,
  undoOpenOctiImport,
  updateMigrationJobConfig,
} from '@/lib/openocti-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function migrationAdminOnly(user) {
  return ['owner', 'admin'].includes(user?.role) ? null : NextResponse.json({ ok: false, error: 'Owner or admin access required' }, { status: 403 })
}

function credentialPayload(credential = {}, sourceSystem) {
  const fields = Array.isArray(credential.fields) ? credential.fields : Object.entries(credential.fields || {}).map(([name, value]) => ({ name, value }))
  const find = pattern => fields.find(field => pattern.test(String(field.name || field.label || field.key || '')))?.value
  if (sourceSystem === 'bitrix24') return { webhookUrl: credential.webhookUrl || find(/webhook|url/i) || credential.value || '' }
  return { token: credential.token || credential.apiKey || find(/token|api.?key/i) || credential.value || '' }
}

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  const forbidden = migrationAdminOnly(user); if (forbidden) return forbidden
  const { searchParams } = new URL(request.url)
  const objectType = searchParams.get('export')
  if (objectType) {
    try {
      return new NextResponse(exportOpenOctiCsv(objectType), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="openocti-${objectType}.csv"` } })
    } catch (reason) { return NextResponse.json({ ok: false, error: reason.message }, { status: 400 }) }
  }
  const jobId = searchParams.get('job')
  if (jobId) {
    const job = getMigrationJob(jobId)
    if (!job) return NextResponse.json({ ok: false, error: 'Migration job not found' }, { status: 404 })
    return NextResponse.json({ ok: true, job, rows: migrationRows(jobId).slice(0, 500) })
  }
  return NextResponse.json({
    ok: true,
    objects: IMPORT_OBJECTS,
    builtInPresets: IMPORT_PRESETS,
    savedPresets: importPresets(),
    migrationSources: MIGRATION_SOURCES,
    migrationJobs: listMigrationJobs(),
  })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const forbidden = migrationAdminOnly(user); if (forbidden) return forbidden
  try {
    const body = await request.json()
    if (body.action === 'detect') return NextResponse.json({ ok: true, mapping: detectImportMapping(body.headers, body.objectType) })
    if (body.action === 'preview') return NextResponse.json({ ok: true, ...previewOpenOctiImport(body.objectType, body.rows) })
    if (body.action === 'commit') return NextResponse.json(commitOpenOctiImport(body.objectType, body.rows, { skipDuplicates: body.skipDuplicates !== false, destination: body.destination, leadListId: body.leadListId }))
    if (body.action === 'undo') return NextResponse.json(undoOpenOctiImport(body.batchId))
    if (body.action === 'save-preset') return NextResponse.json({ ok: true, presets: saveImportPreset(body.preset) })
    if (body.action === 'create-migration') return NextResponse.json(createMigrationJob({ sourceSystem: body.sourceSystem, mode: body.mode, createdBy: user.id || user.username || user.name, config: body.config }))
    if (body.action === 'configure-migration') return NextResponse.json({ ok: true, job: updateMigrationJobConfig(body.jobId, body.config) })
    if (body.action === 'stage-migration') {
      if (!Array.isArray(body.rows) || body.rows.length > 5000) throw new Error('Stage migration batches must contain 5,000 rows or fewer')
      return NextResponse.json(await stageMigrationRows(body.jobId, body.sourceObject, body.rows))
    }
    if (body.action === 'pull-migration-api') {
      const vault = readData('credentials.json') || { credentials: [] }
      const credential = (vault.credentials || []).find(item => item.id === body.credentialId)
      if (!credential) throw new Error('Choose a saved credential from the credentials vault')
      return NextResponse.json(await pullMigrationApi({ jobId: body.jobId, sourceSystem: body.sourceSystem, credential: credentialPayload(credential, body.sourceSystem) }))
    }
    if (body.action === 'dry-run-migration') return NextResponse.json({ ok: true, report: dryRunMigrationJob(body.jobId), job: getMigrationJob(body.jobId) })
    if (body.action === 'migration-decisions') return NextResponse.json(setMigrationDecisions(body.jobId, body.decisions))
    if (body.action === 'commit-migration') return NextResponse.json(commitMigrationJob(body.jobId))
    if (body.action === 'rollback-migration') return NextResponse.json(rollbackMigrationJob(body.jobId))
    return NextResponse.json({ ok: false, error: 'Unsupported import action' }, { status: 400 })
  } catch (reason) { return NextResponse.json({ ok: false, error: reason.message }, { status: 400 }) }
}
