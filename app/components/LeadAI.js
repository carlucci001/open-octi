'use client'
import { useState } from 'react'

const QUICK_PROMPTS = [
  { label: '✉ Draft follow-up email', prompt: 'Draft a short, friendly follow-up email to this lead. Reference their business type and suggest a next step. Keep it under 120 words.' },
  { label: '📞 Suggest opening line', prompt: 'Give me 3 different opening lines I could use when cold-calling this lead. Each under 20 words. Reference their specific business.' },
  { label: '🎯 Next best action', prompt: 'Based on this lead\'s current status and campaign, what is the single best next action I should take? Be specific and direct.' },
  { label: '❓ Likely objections', prompt: 'List the top 3 objections this lead is likely to raise, with a one-sentence response to each.' },
  { label: '📋 Summarize lead', prompt: 'Summarize this lead in 3 bullet points: who they are, why they fit, and the one thing to focus on.' },
]

async function readJsonResponse(response, label = 'Request') {
  const text = await response.text()
  let data = null

  if (text.trim()) {
    try {
      data = JSON.parse(text)
    } catch {
      const html = /^\s*<!doctype html/i.test(text) || /^\s*<html/i.test(text)
      throw new Error(`${label} ${html ? 'returned a web page instead of data' : 'returned invalid data'} (${response.status}). Refresh your session and try again.`)
    }
  }

  if (!response.ok) {
    throw new Error(data?.error || `${label} failed (${response.status})`)
  }
  if (!data || typeof data !== 'object') {
    throw new Error(`${label} returned an empty response`)
  }
  return data
}

async function postJson(url, body, label) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return readJsonResponse(response, label)
}

export default function LeadAI({ lead, onResearchSaved }) {
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [researching, setResearching] = useState(false)
  const [researchNote, setResearchNote] = useState('')
  const [modelNote, setModelNote] = useState('')

  const ask = async (prompt) => {
    if (!prompt.trim() || loading) return
    setLoading(true)
    setResponse('')
    const model = (typeof window !== 'undefined' && localStorage.getItem('fcc-chat-model')) || 'gemini-flash'
    try {
      const res = await postJson('/api/agent/chat', {
        messages: [{ role: 'user', content: prompt }],
        model,
        leadContext: { id: lead.id, name: lead.bn, contact: lead.cn, phone: lead.ph, email: lead.em, website: lead.web, address: lead.address, category: lead.cat, businessType: lead.bt, status: lead.st, campaign: lead.campaign || 'sponsors', notes: lead.notes, researchSummary: lead.researchSummary },
      }, 'Lead AI')
      if (res.error) {
        setResponse('⚠ ' + res.error)
        setModelNote('')
      } else {
        setResponse(res.text)
        setModelNote(res.fellBackFrom ? `⚡ ${res.fellBackFrom} was rate-limited — answered by ${res.model}` : '')
      }
    } catch (e) {
      setResponse('⚠ ' + e.message)
      setModelNote('')
    }
    setLoading(false)
  }

  const research = async () => {
    setResearching(true)
    setResearchNote('')
    let researchResult = null
    try {
      const res = await postJson('/api/harness/actions/lead-research', { leadId: lead.id }, 'Auto-Research')
      researchResult = res
      if (res.error) setResearchNote('⚠ ' + res.error)
      else if (res.updated?.length && res.saved) setResearchNote(`✓ Research saved, refreshing: ${res.updated.join(', ')}`)
      else if (res.updated?.length) setResearchNote(`⚠ Found ${res.updated.join(', ')} but did not save to the visible record`)
      else setResearchNote('✓ No new info found')
    } catch (e) {
      setResearchNote('⚠ ' + e.message)
    }
    if (!researchResult?.error && researchResult?.saved && researchResult?.updated?.length) {
      await onResearchSaved?.(researchResult)
      setResearchNote(`✓ Visible record refreshed: ${researchResult.updated.join(', ')}`)
    }
    setResearching(false)
  }

  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🤖</span>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>Ask AI about this lead</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Claude-powered · Knows this lead's full context</div>
          </div>
        </div>
        <button onClick={research} disabled={researching}
          className="text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', opacity: researching ? 0.5 : 1 }}>
          {researching ? '⟳ Researching...' : '🔍 Auto-Research'}
        </button>
      </div>

      {researchNote && (
        <div className="text-xs mb-3 px-2 py-1.5 rounded" style={{ background: researchNote.startsWith('⚠') ? 'var(--red-soft)' : 'var(--green-soft)', color: researchNote.startsWith('⚠') ? 'var(--red)' : 'var(--green)' }}>{researchNote}</div>
      )}

      {lead.researchSummary && (
        <div className="text-xs mb-3 px-3 py-2 rounded-lg italic" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          <span className="font-semibold not-italic">Research: </span>{lead.researchSummary}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-3">
        {QUICK_PROMPTS.map(q => (
          <button key={q.label} onClick={() => ask(q.prompt)} disabled={loading}
            className="text-[10px] px-2 py-1 rounded-md font-medium"
            style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)', opacity: loading ? 0.5 : 1 }}>
            {q.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { ask(input); setInput('') } }}
          placeholder="Or ask your own question..."
          className="flex-1 text-xs px-3 py-2 rounded-lg"
          style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button onClick={() => { ask(input); setInput('') }} disabled={!input.trim() || loading}
          className="text-xs px-3 py-2 rounded-lg font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: (!input.trim() || loading) ? 0.4 : 1 }}>
          Ask
        </button>
      </div>

      {modelNote && (
        <div className="mt-3 text-[10px] px-2 py-1 rounded" style={{ background: 'var(--amber-soft)', color: 'var(--amber)' }}>{modelNote}</div>
      )}
      {(loading || response) && (
        <div className="mt-3 px-3 py-2 rounded-lg text-xs whitespace-pre-wrap" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', maxHeight: 300, overflowY: 'auto' }}>
          {loading ? (
            <span style={{ color: 'var(--text-muted)' }}>
              <span className="inline-flex gap-1"><span className="animate-pulse">•</span><span className="animate-pulse" style={{ animationDelay: '150ms' }}>•</span><span className="animate-pulse" style={{ animationDelay: '300ms' }}>•</span></span> Thinking...
            </span>
          ) : response}
        </div>
      )}
    </div>
  )
}
