import { NextResponse } from 'next/server'
import { create } from '@/lib/entityStore'
import { loadDocumentData, saveDocumentData } from '@/lib/documentSignatures'
import { analyzeMeetingTranscript } from '@/lib/meetingIntelligence'
import { requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanText(value, max = 50000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function asList(value, max = 12) {
  return Array.isArray(value)
    ? value.map(v => cleanText(v, 500)).filter(Boolean).slice(0, max)
    : []
}

function genDocId() {
  return `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function intelligenceLines(label, items) {
  if (!Array.isArray(items) || !items.length) return ''
  return `## ${label}\n${items.map(item => `- ${typeof item === 'string' ? item : item.task || item.name || item.text || ''}`).filter(Boolean).join('\n')}`
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json()
  const transcript = cleanText(body.transcript)
  if (!transcript) return NextResponse.json({ error: 'transcript required' }, { status: 400 })

  const now = new Date().toISOString()
  const title = cleanText(body.title, 160) || `Maggie transcription ${new Date().toLocaleString()}`
  const durationSeconds = Math.max(0, Math.round(Number(body.durationSeconds) || 0))
  const operator = { id: 'carl-farrington', name: 'Carl Farrington', role: 'owner-operator' }
  const captureAgent = cleanText(body.captureAgent, 80) || 'Maggie'
  const clientId = cleanText(body.clientId, 120)
  const clientName = cleanText(body.clientName, 180)
  const speakerConfig = {
    mode: cleanText(body.speakerMode, 80) || 'owner-first-two-speaker',
    primarySpeakerName: cleanText(body.primarySpeakerName, 80) || operator.name,
    secondarySpeakerName: cleanText(body.secondarySpeakerName, 120) || clientName || 'Other speaker',
    ownerFirst: body.ownerFirst !== false,
    linkedRecordType: cleanText(body.linkedRecordType, 80) || (clientId ? 'account' : 'global'),
  }
  const intelligence = await analyzeMeetingTranscript({ transcript, title, clientName, speakerConfig })
  const summary = cleanText(intelligence.summary || body.summary, 5000)
  const decisions = asList(intelligence.decisions?.length ? intelligence.decisions : body.decisions)
  const actionItems = (Array.isArray(intelligence.actionItems) ? intelligence.actionItems : [])
    .map(item => ({
      task: cleanText(item.task || item.title || item.action || item, 300),
      owner: cleanText(item.owner, 80),
      dueDate: cleanText(item.dueDate, 40),
      priority: cleanText(item.priority || 'medium', 20).toLowerCase(),
    }))
    .filter(item => item.task)
    .slice(0, 10)
  const linkedTo = {
    operatorId: operator.id,
    ...(clientId ? { accountId: clientId } : {}),
  }
  const documentId = genDocId()
  const bodyText = [
    `# ${title}`,
    `Meeting intelligence: ${intelligence.source === 'ai' ? 'AI generated' : 'fallback analysis'}`,
    summary ? `## Summary\n${summary}` : '',
    intelligence.participants?.length ? `## Participants\n${intelligence.participants.map(p => `- ${p.name}${p.role ? ` - ${p.role}` : ''}${p.confidence ? ` (${p.confidence})` : ''}`).join('\n')}` : '',
    decisions.length ? `## Decisions\n${decisions.map(x => `- ${x}`).join('\n')}` : '',
    actionItems.length ? `## Action Items\n${actionItems.map(x => `- ${x.task}${x.owner ? ` - owner: ${x.owner}` : ''}${x.dueDate ? ` - due: ${x.dueDate}` : ''}`).join('\n')}` : '',
    intelligenceLines('Follow Ups', intelligence.followUps),
    intelligenceLines('Promises', intelligence.promises),
    intelligenceLines('Open Questions', intelligence.openQuestions),
    intelligenceLines('CRM Updates', intelligence.crmUpdates),
    intelligence.speakerSegments?.length ? `## Speaker Notes\n${intelligence.speakerSegments.slice(0, 40).map(s => `- ${s.speaker}: ${s.text}`).join('\n')}` : '',
    `## Transcript\n${transcript.split('\n').filter(Boolean).map(x => `- ${x}`).join('\n')}`,
  ].filter(Boolean).join('\n\n')

  const document = {
    id: documentId,
    title,
    name: title,
    templateId: 'call-transcript',
    templateName: 'Call Transcript',
    clientId,
    clientName,
    type: 'transcript',
    docType: 'call-transcript',
    status: 'complete',
    source: 'maggie-live-transcription',
    operator,
    captureAgent,
    visibility: 'internal',
    body: bodyText,
    content: bodyText,
    transcript,
    summary,
    decisions,
    actionItems,
    intelligence,
    speakerConfig,
    durationSeconds,
    linkedTo,
    requiresSignature: false,
    signature: null,
    portalVisible: false,
    createdAt: now,
    updatedAt: now,
  }

  const documentData = loadDocumentData()
  documentData.documents = Array.isArray(documentData.documents) ? documentData.documents : []
  documentData.documents.push(document)
  saveDocumentData(documentData)

  const tasks = actionItems.slice(0, 5).map(item => create('tasks', {
    title: item.task,
    description: [
      `Created from ${title}.`,
      item.owner ? `Owner mentioned: ${item.owner}` : '',
      summary ? `Meeting summary: ${summary}` : '',
    ].filter(Boolean).join('\n\n'),
    status: 'todo',
    priority: ['low', 'medium', 'high', 'urgent'].includes(item.priority) ? item.priority : 'medium',
    dueDate: item.dueDate || null,
    linkedTo: { ...linkedTo, documentId },
    clientId: clientId || undefined,
    tags: ['meeting-capture', 'maggie'],
    source: 'maggie-live-transcription',
    meta: { documentId, captureAgent, meetingIntelligence: intelligence.source },
  }))

  const activity = create('activities', {
    type: 'transcript',
    subject: `Maggie transcription saved: ${title}`,
    body: [
      'Transcript saved as a linked document.',
      summary ? `Summary: ${summary}` : '',
      decisions.length ? `Decisions: ${decisions.slice(0, 3).join('; ')}` : '',
      actionItems.length ? `Action items: ${actionItems.slice(0, 4).map(x => x.task).join('; ')}` : '',
      tasks.length ? `Tasks created: ${tasks.map(t => t.title).join('; ')}` : '',
      `Open the linked transcript document for the full record.`,
    ].filter(Boolean).join('\n\n'),
    source: 'maggie-live-transcription',
    operator,
    captureAgent,
    linkedTo: { ...linkedTo, documentId: document.id },
    meta: { documentId: document.id, taskIds: tasks.map(t => t.id), durationSeconds, commandFlow: true, clientId: clientId || undefined, intelligenceSource: intelligence.source },
    at: now,
    createdAt: now,
    updatedAt: now,
  })

  return NextResponse.json({ ok: true, document, activity, tasks })
}
