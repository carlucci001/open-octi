'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { resolveOpenOctiAssistant } from '@/lib/openocti-assistant'
import { connectOpenOctiGemini } from '@/lib/openocti-gemini-voice'

export default function OpenOctiVoiceGuide() {
  const [assistant, setAssistant] = useState(null)
  const available = Boolean(assistant?.voice)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const session = useRef(null)
  const audio = useRef(null)
  const mounted = useRef(true)
  const stop = useCallback(() => {
    const current = session.current
    session.current = null
    if (current) {
      clearTimeout(current.timeout)
      current.abort.abort()
      if (current.pc) { current.pc.onconnectionstatechange = null; current.pc.ontrack = null }
      current.dc?.close()
      current.pc?.close()
      current.cleanup?.()
      current.stream?.getTracks().forEach(track => track.stop())
    }
    if (audio.current) audio.current.srcObject = null
    if (mounted.current) setStatus('idle')
  }, [])
  useEffect(() => {
    mounted.current = true
    const refresh = () => fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' }).then(response => response.json()).then(data => {
      if (mounted.current) setAssistant(resolveOpenOctiAssistant(data.capabilities || []))
    }).catch(() => {})
    refresh()
    window.addEventListener('openocti:key-saved', refresh)
    return () => { mounted.current = false; window.removeEventListener('openocti:key-saved', refresh); stop() }
  }, [stop])
  async function start() {
    if (session.current || !available) return
    setError(''); setStatus('connecting')
    let current
    try {
      if (assistant.voice.provider === 'gemini') {
        current = { abort: new AbortController() }; session.current = current
        current.timeout = setTimeout(() => { if (session.current === current) { setError('Voice took too long to connect. You can continue in text.'); stop() } }, 30000)
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (session.current !== current) { stream.getTracks().forEach(track => track.stop()); return }
        current.stream = stream
        await connectOpenOctiGemini({ current, isCurrent: () => session.current === current, onReady: () => { clearTimeout(current.timeout); setStatus('live') }, onError: message => { setError(message); stop() }, onEnd: stop })
        return
      }
      const pc = new RTCPeerConnection()
      current = { pc, abort: new AbortController() }
      session.current = current
      current.timeout = setTimeout(() => {
        if (session.current === current) { setError('Voice took too long to connect. Please try again.'); stop() }
      }, 30000)
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (session.current !== current) { stream.getTracks().forEach(track => track.stop()); return }
      current.stream = stream
      stream.getTracks().forEach(track => pc.addTrack(track, stream))
      pc.ontrack = event => { if (audio.current) audio.current.srcObject = event.streams[0] }
      pc.onconnectionstatechange = () => {
        if (session.current !== current) return
        if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) { setError('Voice disconnected. You can start again.'); stop() }
      }
      const dc = pc.createDataChannel('oai-events')
      current.dc = dc
      dc.onopen = () => {
        if (session.current !== current) return
        clearTimeout(current.timeout); setStatus('live')
        dc.send(JSON.stringify({ type: 'response.create', response: { instructions: 'Speak in English. Briefly introduce yourself as Octi, an AI voice guide for OpenOcti. Welcome the user and ask what they would like help setting up. Continue in English unless the user explicitly requests another language.' } }))
      }
      dc.onmessage = event => {
        try { const message = JSON.parse(event.data); if (message.type === 'error') { setError(message.error?.message || 'Voice session failed.'); stop() } } catch {}
      }
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      const response = await fetch('/api/voice/openai/session?agent=octi-guide', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: offer.sdp, signal: current.abort.signal })
      const answer = await response.text()
      if (!response.ok) { let message = 'Could not start OpenAI voice.'; try { message = JSON.parse(answer).error || message } catch {} throw new Error(message) }
      if (session.current === current) await pc.setRemoteDescription({ type: 'answer', sdp: answer })
    } catch (reason) {
      if (session.current === current) { setError(reason.name === 'NotAllowedError' ? 'Allow microphone access to start voice.' : reason.message); stop() }
    }
  }
  return <div className="mt-4 rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
    <div className="font-semibold">Talk with Octi</div>
    <p role="status" className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{assistant?.message || 'Checking your setup assistant options…'}</p>
    {available && <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>AI-generated voice. Uses your saved {assistant.voice.label} key. Voice usage is billed by that provider. English is the default; ask for another language whenever you prefer.</p>}
    {!available ? <Link href="/settings/models#openai" className="inline-block mt-2 font-semibold" style={{ color: 'var(--accent)' }}>Add an OpenAI key for voice</Link> : <button type="button" onClick={status === 'idle' ? start : stop} className="mt-3 rounded-lg px-4 py-2 font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{status === 'idle' ? 'Start voice with Octi' : status === 'connecting' ? 'Cancel connection' : 'End voice'}</button>}
    {status !== 'idle' && <p role="status" className="text-sm mt-2">{status === 'connecting' ? 'Connecting voice…' : 'Voice is connected. You can speak now.'}</p>}
    {error && <p role="alert" className="text-sm mt-2" style={{ color: '#fca5a5' }}>{error}</p>}
    <audio ref={audio} autoPlay controls={status === 'live'} className="mt-2" />
  </div>
}
