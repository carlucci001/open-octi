'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import ThemedSelect from '../components/ThemedSelect'

const SAMPLE = `Carl: Hey Maggie, I am going to be on a call for about ten minutes. Stand by for transcription.
Maggie: Standing by. I will not save anything until Carl says begin transcribing.
Carl: Begin transcribing. We are talking about a Command Center transcription flow.
Speaker 2: The system should capture the conversation, summarize it, and save the result in activity.
Carl: Correct. Complete transcribe. Produce summary and save in my activity.`

function sentenceSplit(text) {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

function buildSummary(text) {
  const sentences = sentenceSplit(text)
  const actionWords = /\b(need to|make sure|follow up|create|add|send|call|price out|check|verify|build|save|wire|finish)\b/i
  const decisionWords = /\b(agreed|decided|correct|source of truth|should be|will be|we will|let's|the system should)\b/i
  const topicWords = /\b(command center|maggie|transcription|transcript|activity|document|summary|operator|project|crm|recording)\b/ig
  return {
    summary: sentences.slice(0, 3).join(' ') || 'No transcript captured yet.',
    decisions: sentences.filter(s => decisionWords.test(s)).slice(0, 6),
    actionItems: sentences.filter(s => actionWords.test(s)).slice(0, 8),
    topics: [...new Set((text.match(topicWords) || []).map(s => s.toLowerCase()))].slice(0, 10),
  }
}

function heard(text, phrase) {
  return text.toLowerCase().includes(phrase)
}

function microphoneErrorMessage(err) {
  const name = err?.name || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'Microphone blocked: allow microphone access for this browser/PWA, then press Request microphone access.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone was found on this device.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'The microphone is already in use by another app or browser tab.'
  }
  return err?.message || 'Could not access microphone.'
}

export default function MeetingCaptureDemo() {
  const [status, setStatus] = useState('idle')
  const [transcript, setTranscript] = useState('')
  const [events, setEvents] = useState([])
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(null)
  const [clients, setClients] = useState([])
  const [selectedClientId, setSelectedClientId] = useState('')
  const [secondarySpeakerName, setSecondarySpeakerName] = useState('')
  const [authState, setAuthState] = useState({ status: 'checking', message: 'Checking CRM save permissions...' })
  const [micState, setMicState] = useState({ status: 'checking', message: 'Checking microphone permission...' })
  const [pendingBeginPrompt, setPendingBeginPrompt] = useState(false)
  const recognitionRef = useRef(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const startedAtRef = useRef(null)
  const transcriptRef = useRef('')
  const statusRef = useRef('idle')
  const summary = useMemo(() => buildSummary(transcript), [transcript])
  const selectedClient = useMemo(() => clients.find(c => c.id === selectedClientId) || null, [clients, selectedClientId])
  const otherSpeakerName = (secondarySpeakerName || selectedClient?.name || 'Other speaker').trim()
  const savedIntelligence = saved?.document?.intelligence || null
  const intelligenceSummary = savedIntelligence?.summary || summary.summary
  const intelligenceDecisions = savedIntelligence?.decisions || summary.decisions
  const intelligenceActions = savedIntelligence?.actionItems?.map(item => {
    const owner = item.owner ? ` - ${item.owner}` : ''
    const due = item.dueDate ? ` - due ${item.dueDate}` : ''
    return `${item.task}${owner}${due}`
  }) || summary.actionItems
  const intelligenceParticipants = savedIntelligence?.participants?.map(p => `${p.name}${p.role ? ` - ${p.role}` : ''}${p.confidence ? ` (${p.confidence})` : ''}`) || []
  const intelligenceSpeakers = savedIntelligence?.speakerSegments?.slice(0, 8).map(s => `${s.speaker}: ${s.text}`) || []
  const listening = status === 'armed' || status === 'recording'

  useEffect(() => {
    if (selectedClient?.name && !secondarySpeakerName.trim()) setSecondarySpeakerName(selectedClient.name)
  }, [selectedClient, secondarySpeakerName])

  useEffect(() => {
    let cancelled = false
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicState({ status: 'unavailable', message: 'This browser does not expose microphone capture.' })
      return
    }
    if (!navigator.permissions?.query) {
      setMicState({ status: 'unknown', message: 'Microphone permission has not been requested yet.' })
      return
    }
    navigator.permissions.query({ name: 'microphone' })
      .then(permission => {
        const apply = () => {
          if (cancelled) return
          if (permission.state === 'granted') setMicState({ status: 'ok', message: 'Microphone access is allowed.' })
          else if (permission.state === 'denied') setMicState({ status: 'blocked', message: 'Microphone is blocked for this browser/PWA.' })
          else setMicState({ status: 'unknown', message: 'Microphone permission has not been requested yet.' })
        }
        apply()
        permission.onchange = apply
      })
      .catch(() => {
        if (!cancelled) setMicState({ status: 'unknown', message: 'Microphone permission has not been requested yet.' })
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/auth/me', { cache: 'no-store' })
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!r.ok || data?.ok === false) throw new Error('Sign in to save transcripts to Documents and Activity.')
        if (!cancelled) setAuthState({ status: 'ok', message: `Saving as ${data.user?.name || data.user?.username || 'current user'}.` })
        return fetch('/api/clients', { cache: 'no-store' })
      })
      .then(async r => {
        if (!r) return
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Client/account list is not available for this session.')
        if (!cancelled) setClients(Array.isArray(data.clients) ? data.clients : [])
      })
      .catch(err => {
        if (!cancelled) setClients([])
        if (!cancelled) setAuthState({ status: 'blocked', message: err.message || 'CRM save permissions are not available.' })
      })
    return () => { cancelled = true }
  }, [])

  const setFlowStatus = value => {
    statusRef.current = value
    setStatus(value)
  }

  const addEvent = message => setEvents(prev => [{ at: new Date().toLocaleTimeString(), message }, ...prev].slice(0, 8))

  const appendTranscript = text => {
    transcriptRef.current = `${transcriptRef.current}${text}\n`
    setTranscript(transcriptRef.current)
  }

  const openMicrophoneStream = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = 'This browser does not expose microphone capture.'
      setMicState({ status: 'unavailable', message })
      throw new Error(message)
    }
    setMicState({ status: 'requesting', message: 'Requesting microphone access...' })
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      setMicState({ status: 'ok', message: 'Microphone access is allowed.' })
      return stream
    } catch (err) {
      const message = microphoneErrorMessage(err)
      setMicState({ status: 'blocked', message })
      throw new Error(message)
    }
  }

  const requestMicrophoneAccess = async () => {
    setError('')
    try {
      const stream = await openMicrophoneStream()
      stream.getTracks?.().forEach(track => track.stop())
      addEvent('Microphone permission granted.')
      return true
    } catch (err) {
      setError(err.message)
      return false
    }
  }

  const prepareRecorder = async () => {
    const stream = await openMicrophoneStream()
    streamRef.current = stream
    if (!window.MediaRecorder) return
    chunksRef.current = []
    const recorder = new MediaRecorder(stream)
    recorder.ondataavailable = event => {
      if (event.data?.size) chunksRef.current.push(event.data)
    }
    recorderRef.current = recorder
  }

  const startRecognition = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('This browser does not expose live speech recognition. Use Chrome, or paste a transcript and save it.')
      return false
    }
    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = event => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (!event.results[i].isFinal) continue
        const text = event.results[i][0].transcript.trim()
        const lower = text.toLowerCase()
        if (heard(lower, 'begin transcribing')) {
          beginTranscribing()
          continue
        }
        if (heard(lower, 'complete transcribe') || heard(lower, 'complete transcription') || heard(lower, 'stop transcribing')) {
          completeAndSave()
          continue
        }
        if (statusRef.current === 'recording') appendTranscript(text)
      }
    }
    recognition.onerror = event => setError(event.error || 'Speech recognition failed.')
    recognition.onend = () => {
      if (statusRef.current === 'armed' || statusRef.current === 'recording') {
        try { recognition.start() } catch {}
      }
    }
    recognitionRef.current = recognition
    recognition.start()
    return true
  }

  const arm = async () => {
    setError('')
    setSaved(null)
    try {
      await prepareRecorder()
      if (!startRecognition()) return false
      setFlowStatus('armed')
      addEvent('Maggie armed. Say begin transcribing when the call starts.')
      return true
    } catch (err) {
      setError(err.message || 'Could not access microphone.')
      return false
    }
  }

  const beginConfirmedSession = async () => {
    setPendingBeginPrompt(false)
    if (statusRef.current === 'recording') return
    if (statusRef.current !== 'armed') {
      const armed = await arm()
      if (!armed) return
    }
    beginTranscribing()
  }

  useEffect(() => {
    const handler = async event => {
      const detail = event.detail || {}
      if (detail.clientId) setSelectedClientId(String(detail.clientId))
      const speakerName = detail.secondarySpeakerName || detail.clientName || detail.target || ''
      if (speakerName) setSecondarySpeakerName(String(speakerName))
      if (detail.action === 'open-and-confirm') {
        setPendingBeginPrompt(true)
        addEvent('Maggie is waiting for begin confirmation.')
      } else if (detail.action === 'start' || detail.action === 'open-and-start') {
        await beginConfirmedSession()
      } else if (detail.action === 'arm' || detail.action === 'open-and-arm') {
        setPendingBeginPrompt(false)
        if (!listening && statusRef.current !== 'saving') setTimeout(() => arm(), 120)
      }
      addEvent('Maggie opened transcription capture.')
    }
    window.addEventListener('fcc:meeting-capture-command', handler)
    return () => window.removeEventListener('fcc:meeting-capture-command', handler)
  }, [arm, listening])

  const beginTranscribing = () => {
    if (statusRef.current === 'recording') return
    startedAtRef.current = Date.now()
    try {
      if (recorderRef.current?.state === 'inactive') recorderRef.current.start()
    } catch {}
    setFlowStatus('recording')
    addEvent('Transcription started.')
  }

  const stopCapture = () => {
    setFlowStatus('processing')
    try { recognitionRef.current?.stop() } catch {}
    try {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
    } catch {}
    streamRef.current?.getTracks?.().forEach(track => track.stop())
  }

  const completeAndSave = async () => {
    if (statusRef.current === 'processing' || statusRef.current === 'saving') return
    if (authState.status !== 'ok') {
      setError(authState.message || 'Sign in with CRM write access before saving.')
      return
    }
    stopCapture()
    setFlowStatus('saving')
    addEvent('Capture stopped. Saving transcript and activity.')
    const current = transcriptRef.current.trim()
    if (!current) {
      setError('No transcript was captured. Say begin transcribing first, or paste transcript text.')
      setFlowStatus('idle')
      return
    }
    const durationSeconds = startedAtRef.current ? Math.round((Date.now() - startedAtRef.current) / 1000) : 0
    const res = await fetch('/api/meeting-capture', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Maggie transcription ${new Date().toLocaleString()}`,
        transcript: current,
        durationSeconds,
        captureAgent: 'Maggie',
        clientId: selectedClient?.id || '',
        clientName: selectedClient?.name || '',
        speakerMode: 'owner-first-two-speaker',
        primarySpeakerName: 'Carl Farrington',
        secondarySpeakerName: otherSpeakerName,
        ownerFirst: true,
        linkedRecordType: selectedClient ? 'account' : 'prospect',
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      setError(body.error === 'permission denied'
        ? 'Permission denied: this session cannot write CRM Documents/Activity. Sign in with an owner/admin CRM account.'
        : body.error || 'Save failed.')
      setFlowStatus('idle')
      return
    }
    setSaved(body)
    setFlowStatus('complete')
    addEvent('Saved to Documents and Activity.')
  }

  useEffect(() => {
    const handler = event => {
      const action = event.detail?.action
      if (action === 'save' || action === 'stop-and-save' || action === 'finish') {
        void completeAndSave()
      }
    }
    window.addEventListener('fcc:meeting-capture-command', handler)
    return () => window.removeEventListener('fcc:meeting-capture-command', handler)
  }, [completeAndSave])

  const loadSample = () => {
    transcriptRef.current = SAMPLE
    setTranscript(SAMPLE)
    setSaved(null)
    addEvent('Sample loaded.')
  }

  const clear = () => {
    transcriptRef.current = ''
    setTranscript('')
    setEvents([])
    setSaved(null)
    setError('')
    setPendingBeginPrompt(false)
    setFlowStatus('idle')
  }

  const returnToSource = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:return-back', { detail: { source: 'meeting-capture' } }))
  }

  return (
    <div className="command-workspace p-6 max-w-6xl mx-auto">
      <PageHeader
        icon="M"
        title="Maggie Transcription Flow"
        subtitle="Pick a client/account when relevant, capture the conversation, then save the transcript to Documents and Activity."
        actions={
          <button
            type="button"
            onClick={returnToSource}
            aria-label="Back to previous screen"
            className="px-3 py-2 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
            style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40 }}
          >
            <span aria-hidden="true">&larr;</span>
            Back
          </button>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="rounded-lg p-3 mb-3 text-sm" style={{
            background: authState.status === 'ok' ? 'var(--green-soft)' : authState.status === 'checking' ? 'var(--surface2)' : 'var(--red-soft)',
            color: authState.status === 'ok' ? 'var(--green)' : authState.status === 'checking' ? 'var(--text-muted)' : 'var(--red)',
          }}>
            Save permission: {authState.message}
            {authState.status === 'blocked' && (
              <a href="/login?next=/?tab=meeting-capture" style={{ marginLeft: 10, color: 'inherit', textDecoration: 'underline', fontWeight: 700 }}>Sign in</a>
            )}
          </div>

          <div className="rounded-lg p-3 mb-3 text-sm flex items-center gap-2 flex-wrap" style={{
            background: micState.status === 'ok' ? 'var(--green-soft)' : micState.status === 'blocked' || micState.status === 'unavailable' ? 'var(--red-soft)' : 'var(--surface2)',
            color: micState.status === 'ok' ? 'var(--green)' : micState.status === 'blocked' || micState.status === 'unavailable' ? 'var(--red)' : 'var(--text-muted)',
          }}>
            <span className="flex-1">Mic permission: {micState.message}</span>
            {micState.status !== 'ok' && micState.status !== 'unavailable' && (
              <button
                type="button"
                onClick={requestMicrophoneAccess}
                disabled={micState.status === 'requesting'}
                className="px-3 rounded-md text-xs font-semibold disabled:opacity-60"
                style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', minHeight: 32 }}
              >
                {micState.status === 'requesting' ? 'Requesting...' : 'Request microphone access'}
              </button>
            )}
          </div>

          <div className="mb-3">
            <label className="block text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Link to client / account</label>
            <ThemedSelect
              value={selectedClientId}
              onChange={e => setSelectedClientId(e.target.value)}
              className="w-full rounded-lg p-3 text-sm"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              disabled={listening || status === 'saving'}
            >
              <option value="">No client selected - save globally only</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </ThemedSelect>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {selectedClient ? `Will appear in ${selectedClient.name}'s Activity tab and Documents.` : 'Global saves appear in Feed and Documents.'}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 mb-3">
            <label className="block">
              <span className="block text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Speaker 1</span>
              <input
                value="Carl Farrington"
                readOnly
                className="w-full rounded-lg p-3 text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', outline: 'none' }}
              />
            </label>
            <label className="block">
              <span className="block text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Speaker 2</span>
              <input
                value={secondarySpeakerName}
                onChange={e => setSecondarySpeakerName(e.target.value)}
                placeholder={selectedClient?.name || 'Prospect, lead, or account holder'}
                disabled={listening || status === 'saving'}
                className="w-full rounded-lg p-3 text-sm"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              />
            </label>
          </div>

          <div className="flex gap-2 flex-wrap mb-3">
            <button className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} disabled={listening || status === 'saving'} onClick={arm}>Arm Maggie</button>
            <button className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--green)', color: '#fff' }} disabled={status !== 'armed'} onClick={beginTranscribing}>Begin Transcribing</button>
            <button className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--red)', color: '#fff' }} disabled={status !== 'recording' || authState.status !== 'ok'} onClick={completeAndSave}>Complete Transcribe & Save</button>
            <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text)' }} onClick={loadSample}>Load Sample</button>
            <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={clear}>Clear</button>
          </div>

          <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: status === 'recording' ? 'var(--red-soft)' : 'var(--surface2)', color: status === 'recording' ? 'var(--red)' : 'var(--text)' }}>
            Status: {status}. Voice commands: “begin transcribing” and “complete transcribe.”
          </div>
          {pendingBeginPrompt && (
            <div className="rounded-lg p-3 mb-3 text-sm flex items-center justify-between gap-3 flex-wrap" style={{ background: 'var(--accent-soft)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <span>Maggie is ready. Begin transcription now?</span>
              <div className="flex gap-2">
                <button type="button" className="px-3 rounded-md text-xs font-semibold" style={{ background: 'var(--green)', color: '#fff', minHeight: 32 }} onClick={beginConfirmedSession}>Begin now</button>
                <button type="button" className="px-3 rounded-md text-xs font-semibold" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 32 }} onClick={() => setPendingBeginPrompt(false)}>Not yet</button>
              </div>
            </div>
          )}
          {error && <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{error}</div>}
          {saved && (
            <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: 'var(--green-soft)', color: 'var(--green)' }}>
              Saved: {saved.document?.title}{saved.document?.clientName ? ` to ${saved.document.clientName}` : ''}{saved.tasks?.length ? `; ${saved.tasks.length} task${saved.tasks.length === 1 ? '' : 's'} created` : ''}
            </div>
          )}

          <textarea
            value={transcript}
            onChange={e => { transcriptRef.current = e.target.value; setTranscript(e.target.value) }}
            placeholder="Arm Maggie, say begin transcribing, then talk. Or paste transcript text here."
            className="w-full rounded-lg p-3 text-sm"
            style={{ minHeight: 420, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', resize: 'vertical' }}
          />
        </section>

        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-xs uppercase font-semibold mb-2" style={{ color: status === 'recording' ? 'var(--red)' : 'var(--text-muted)' }}>{status}</div>
          <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--text)' }}>{savedIntelligence ? 'Saved Meeting Intelligence' : 'Draft Intelligence Preview'}</h2>
          <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {savedIntelligence
              ? `Source: ${savedIntelligence.source === 'ai' ? 'AI analysis' : 'fallback analysis'}; speaker mode: ${savedIntelligence.diarizationMode || 'transcript only'}.`
              : `Before save this panel is only a local draft. Saved analysis uses owner-first two-speaker mode: Carl Farrington, then ${otherSpeakerName}.`}
          </div>
          <SummaryBlock title="Summary" items={intelligenceSummary ? [intelligenceSummary] : []} empty="No transcript yet." />
          <SummaryBlock title="Participants" items={intelligenceParticipants} empty="Participants will appear after server analysis." />
          <SummaryBlock title="Speaker Notes" items={intelligenceSpeakers} empty="Speaker notes will appear after server analysis." />
          <SummaryBlock title="Decisions" items={intelligenceDecisions} empty="No decisions detected yet." />
          <SummaryBlock title="Action Items" items={intelligenceActions} empty="No action items detected yet." />
          {saved?.tasks?.length ? <SummaryBlock title="Tasks Created" items={saved.tasks.map(t => t.title)} empty="No tasks created." /> : null}
          <SummaryBlock title="Event Log" items={events.map(e => `${e.at} - ${e.message}`)} empty="No events yet." />
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Owner</div>
            <div className="text-sm" style={{ color: 'var(--text)' }}>Carl Farrington, owner-operator. Capture agent: Maggie.</div>
          </div>
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Save Destination</div>
            <div className="text-sm" style={{ color: 'var(--text)' }}>
              Documents, global Feed activity, and {selectedClient ? `${selectedClient.name}'s Activity tab` : 'no client timeline unless one is selected'}.
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

function SummaryBlock({ title, items, empty }) {
  return (
    <div className="mb-4">
      <div className="text-xs uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>{title}</div>
      {items.length ? (
        <ul className="space-y-2">
          {items.map((item, i) => <li key={`${title}-${i}`} className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>{item}</li>)}
        </ul>
      ) : (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{empty}</div>
      )}
    </div>
  )
}
