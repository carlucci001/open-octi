// The setup guide uses the same constrained Gemini token protocol as VoiceSession.
export async function connectOpenOctiGemini({ current, isCurrent, onReady, onError, onEnd }) {
  const context = new AudioContext()
  const sources = new Set()
  let input, processor, mute, ws, playAt = 0
  const stopOutput = () => { for (const source of sources) { try { source.stop() } catch {} }; sources.clear(); playAt = context.currentTime }
  current.cleanup = () => {
    if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; ws.close() }
    if (processor) { processor.onaudioprocess = null; processor.disconnect() }
    input?.disconnect(); mute?.disconnect(); stopOutput()
    context.close().catch(() => {})
  }
  await context.resume()
  const response = await fetch('/api/voice/gemini-live-token', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: current.abort.signal,
    body: JSON.stringify({ agentId: 'octi-guide', voiceName: 'Kore', enableTools: false }),
  })
  const data = await response.json()
  if (!response.ok || !data.ok) throw new Error('Google Gemini could not start voice. Check the Gemini key and available quota in Models & Keys.')
  if (!isCurrent()) return
  ws = new WebSocket(data.websocketUrl)
  ws.onopen = () => { if (isCurrent()) ws.send(JSON.stringify(data.setup)) }
  ws.onerror = () => { if (isCurrent()) onError('The Gemini voice connection failed. You can keep using text and try voice again.') }
  ws.onclose = () => { if (isCurrent()) onEnd() }
  ws.onmessage = async event => {
    if (!isCurrent()) return
    try {
      const message = JSON.parse(typeof event.data === 'string' ? event.data : await event.data.text())
      if (!isCurrent()) return
      if (message.error) { onError('Gemini could not continue this voice session. You can keep using text.'); return }
      if (message.setupComplete && !processor) {
        input = context.createMediaStreamSource(current.stream)
        processor = context.createScriptProcessor(4096, 1, 1)
        mute = context.createGain(); mute.gain.value = 0
        input.connect(processor); processor.connect(mute); mute.connect(context.destination)
        processor.onaudioprocess = event => {
          if (!isCurrent() || ws.readyState !== WebSocket.OPEN) return
          const samples = event.inputBuffer.getChannelData(0)
          const ratio = context.sampleRate / 16000
          const pcm = new Int16Array(Math.floor(samples.length / ratio))
          for (let i = 0; i < pcm.length; i++) { const sample = Math.max(-1, Math.min(1, samples[Math.floor(i * ratio)])); pcm[i] = sample * (sample < 0 ? 0x8000 : 0x7fff) }
          let binary = ''; for (const byte of new Uint8Array(pcm.buffer)) binary += String.fromCharCode(byte)
          ws.send(JSON.stringify({ realtimeInput: { audio: { data: btoa(binary), mimeType: 'audio/pcm;rate=16000' } } }))
        }
        onReady()
        ws.send(JSON.stringify({ clientContent: { turns: [{ role: 'user', parts: [{ text: 'Introduce yourself briefly as Octi, my AI setup assistant, in English. Ask what I would like help setting up. Continue in English unless I explicitly request another language.' }] }], turnComplete: true } }))
      }
      if (message.serverContent?.interrupted) stopOutput()
      for (const part of message.serverContent?.modelTurn?.parts || []) {
        if (!part.inlineData?.data || !String(part.inlineData.mimeType || '').startsWith('audio/pcm')) continue
        const raw = atob(part.inlineData.data)
        const floats = new Float32Array(Math.floor(raw.length / 2))
        for (let i = 0; i < floats.length; i++) { let value = raw.charCodeAt(i * 2) | (raw.charCodeAt(i * 2 + 1) << 8); if (value >= 0x8000) value -= 0x10000; floats[i] = value / 0x8000 }
        const rate = Number(/rate=(\d+)/.exec(part.inlineData.mimeType)?.[1]) || 24000
        const buffer = context.createBuffer(1, floats.length, rate); buffer.copyToChannel(floats, 0)
        const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination)
        playAt = Math.max(context.currentTime + 0.02, playAt); source.start(playAt); playAt += buffer.duration
        sources.add(source); source.onended = () => sources.delete(source)
      }
    } catch { if (isCurrent()) onError('Gemini voice could not process the response. You can continue in text.') }
  }
}
