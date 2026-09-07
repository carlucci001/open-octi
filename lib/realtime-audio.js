export function createStreamAudioMeter(stream, AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext) {
  if (!AudioContextClass || !stream) return null
  let context
  try {
    context = new AudioContextClass()
    const source = context.createMediaStreamSource(stream)
    const analyser = context.createAnalyser()
    analyser.fftSize = 256
    analyser.smoothingTimeConstant = 0.65
    source.connect(analyser)
    const bytes = new Uint8Array(analyser.frequencyBinCount)
    let closed = false
    return {
      read: () => {
        if (closed) return null
        analyser.getByteFrequencyData(bytes)
        return bytes
      },
      resume: () => { if (!closed) return Promise.resolve(context.resume()).catch(() => {}) },
      close: () => {
        if (closed) return
        closed = true
        source.disconnect()
        analyser.disconnect()
        Promise.resolve(context.close()).catch(() => {})
      },
    }
  } catch {
    if (context) Promise.resolve(context.close()).catch(() => {})
    return null
  }
}

export async function playRealtimeAudio(audio, scope, onBlocked) {
  try {
    await audio.play()
    return scope.isCurrent()
  } catch {
    if (scope.isCurrent()) onBlocked('Your browser paused voice playback. Select Resume audio to hear your assistant.')
    return false
  }
}
