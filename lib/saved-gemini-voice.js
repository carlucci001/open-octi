// Gemini prebuilt voice names. Kept dependency-free so server routes can import it cheaply.
const GEMINI_VOICE_IDS = new Set([
  'Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir', 'Leda', 'Orus', 'Aoede', 'Callirrhoe', 'Autonoe',
  'Enceladus', 'Iapetus', 'Umbriel', 'Algieba', 'Despina', 'Erinome', 'Algenib', 'Rasalgethi', 'Laomedeia', 'Achernar',
  'Alnilam', 'Schedar', 'Gacrux', 'Pulcherrima', 'Achird', 'Zubenelgenubi', 'Vindemiatrix', 'Sadachbia', 'Sadaltager', 'Sulafat',
])

// The Gemini voice an agent was given in Voice Lab, or '' when none is saved.
// Only the voice name is honored: a saved TTS model or a legacy ElevenLabs
// lock must not change a pinned live provider or model.
export function savedGeminiVoice(voice) {
  if (!voice || voice.provider !== 'gemini') return ''
  const saved = String(voice.geminiVoice || voice.voiceName || '').trim()
  return GEMINI_VOICE_IDS.has(saved) ? saved : ''
}
