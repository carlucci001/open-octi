
import { readData, writeData } from '@/lib/dataStore'
import { runDeepResearchDossier } from '@/lib/deep-research'
import { latestUnfiledDossier, fileDossierToAccount } from '@/lib/research-dossiers'

// Background deep-research jobs started by voice. A voice turn must answer in
// seconds and research takes minutes, so a job is recorded, run without being
// awaited, and read back later. Shared by the Chirp conversation sandbox and the
// GPT-Live research tools (/api/voice/research-jobs).

export const RESEARCH_JOBS_FILE = 'voice-research-jobs.json'
export const RESEARCH_JOBS_KEEP = 20

export function cleanText(value, max = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

export function readResearchJobs() {
  const data = readData(RESEARCH_JOBS_FILE)
  return Array.isArray(data?.jobs) ? data.jobs : []
}

export function saveResearchJob(job) {
  try {
    const jobs = readResearchJobs().filter(j => j.id !== job.id)
    jobs.push(job)
    writeData(RESEARCH_JOBS_FILE, { jobs: jobs.slice(-RESEARCH_JOBS_KEEP), lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.warn('[voice-research] job save failed', e?.message || e)
  }
}

export function spokenDossierSummary(result, target) {
  const d = result?.dossier || {}
  const positives = (Array.isArray(d.positiveSignals) && d.positiveSignals.length) ? d.positiveSignals
    : (Array.isArray(d.reputationSignals) ? d.reputationSignals : [])
  const nextSteps = (Array.isArray(d.recommendedNextSteps) && d.recommendedNextSteps.length) ? d.recommendedNextSteps
    : (Array.isArray(d.nextSteps) ? d.nextSteps : [])
  return cleanText([
    d.executiveSummary || d.summary || `Deep research completed for ${target}.`,
    d.riskLevel ? `Risk level: ${d.riskLevel}.` : '',
    d.confidence ? `Confidence: ${d.confidence}.` : '',
    Array.isArray(d.redFlags) && d.redFlags.length ? `Main red flags: ${d.redFlags.slice(0, 3).join('; ')}.` : '',
    positives.length ? `Positive signals: ${positives.slice(0, 3).join('; ')}.` : '',
    nextSteps.length ? `Next steps: ${nextSteps.slice(0, 3).join('; ')}.` : '',
  ].filter(Boolean).join(' '), 1800)
}

// Records the job and starts the dossier without awaiting it. The default
// context line matches the sandbox's original wording; `via` and `context` let
// other callers describe themselves.
export function startBackgroundResearch({
  target, label, role, fileToPhrase = '', agentId = 'deep-research-analyst', clientId = '', accountId = '', requestId = '',
  subjectType = 'person_or_company', context = '', via = 'the Chirp voice interface',
}) {
  const job = {
    id: `vrj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    target,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    spokenSummary: '',
    error: '',
    fileToPhrase,
    filedNote: '',
    agentId,
  }
  saveResearchJob(job)
  runDeepResearchDossier({
    target,
    context: [`Requested by Carl through ${via} as ${label} (${role}).`, cleanText(context, 1000)].filter(Boolean).join(' '),
    subjectType,
    usePerplexity: true,
    source: 'voice',
    agentId,
    clientId,
    accountId: accountId || clientId,
    productId: 'research',
    requestId,
  }).then(result => {
    const current = readResearchJobs().find(j => j.id === job.id)
    if (current?.status === 'cancelled') return
    let filedNote = ''
    if (fileToPhrase) {
      try {
        const pending = latestUnfiledDossier()
        if (pending && pending.target === target) {
          const res = fileDossierToAccount({ dossierId: pending.id, accountPhrase: fileToPhrase })
          filedNote = res.ok
            ? `Already filed to ${res.account.name}'s documents.`
            : `I couldn't match an account named "${fileToPhrase}" — the dossier is on the Research page, unfiled.`
        }
      } catch (e) {
        filedNote = `Auto-filing failed (${cleanText(e?.message || String(e), 120)}) — the dossier is on the Research page, unfiled.`
      }
    }
    saveResearchJob({ ...job, status: 'done', finishedAt: new Date().toISOString(), spokenSummary: spokenDossierSummary(result, target), filedNote })
  }).catch(e => {
    const current = readResearchJobs().find(j => j.id === job.id)
    if (current?.status === 'cancelled') return
    saveResearchJob({ ...job, status: 'failed', finishedAt: new Date().toISOString(), error: cleanText(e?.message || String(e), 300) })
  })
  return job
}

// Newest first. `agentId` narrows to one agent's jobs (jobs saved before the
// agentId field existed never match a specific agent).
export function listResearchJobs({ agentId = '', includeCancelled = false } = {}) {
  return readResearchJobs().slice().reverse()
    .filter(job => (includeCancelled || job.status !== 'cancelled') && (!agentId || job.agentId === agentId))
}

export function findResearchJob(jobId) {
  const id = cleanText(jobId, 80)
  return id ? readResearchJobs().find(job => job.id === id) || null : null
}

// Marks a running job cancelled. With no jobId the newest running job (for the
// agent, when given) is cancelled. Returns the cancelled job or null.
export function cancelResearchJob({ jobId = '', agentId = '' } = {}) {
  const running = jobId
    ? [findResearchJob(jobId)].filter(job => job?.status === 'running')[0]
    : listResearchJobs({ agentId }).find(job => job.status === 'running')
  if (!running) return null
  const cancelled = { ...running, status: 'cancelled', finishedAt: new Date().toISOString() }
  saveResearchJob(cancelled)
  return cancelled
}

// What the agent can say about a job. No pricing, no internal ids.
export function describeResearchJob(job) {
  if (!job) return 'No research is running right now. Give me a target and I will start a deep dive.'
  if (job.status === 'running') {
    const mins = Math.max(1, Math.round((Date.now() - new Date(job.startedAt).getTime()) / 60000))
    return `Still working on ${job.target}, about ${mins} minute${mins === 1 ? '' : 's'} in. Ask again in a bit.`
  }
  if (job.status === 'failed') return `The deep dive on ${job.target} failed: ${job.error || 'unknown error'}. Say the request again and I will retry.`
  if (job.status === 'cancelled') return `The deep dive on ${job.target} was cancelled.`
  return `Done. Here is what I found on ${job.target}. ${job.spokenSummary || ''} ${job.filedNote || ''}`.replace(/\s+/g, ' ').trim()
}

// Only the fields the browser and the model need.
export function publicResearchJob(job) {
  if (!job) return null
  return {
    id: job.id, target: job.target, status: job.status, startedAt: job.startedAt, finishedAt: job.finishedAt || '',
    spokenSummary: job.status === 'done' ? job.spokenSummary || '' : '', error: job.status === 'failed' ? job.error || '' : '',
    filedNote: job.filedNote || '',
  }
}
