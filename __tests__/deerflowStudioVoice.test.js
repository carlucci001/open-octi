import { describe, expect, it } from 'vitest'
import { canProduce, parseStudioRequest, isStudioCancel, isStudioStatusQuestion } from '@/lib/deerflow-studio-voice'

const IRIS = { runtimeProvider: 'deerflow-hetzner', tools: ['deep_research_dossier', 'deerflow_studio_produce'] }
const NADIA = { runtimeProvider: 'deerflow-hetzner', tools: ['deep_research_dossier'] }
const MAGGIE = { runtimeProvider: 'openclaw-hetzner', tools: ['deerflow_studio_produce', 'voice_call'] }

describe('canProduce — the OpenClaw guard', () => {
  it('allows a deerflow agent carrying the studio tool', () => {
    expect(canProduce(IRIS)).toBe(true)
  })

  it('refuses a deerflow research agent without the tool', () => {
    expect(canProduce(NADIA)).toBe(false)
  })

  it('refuses an OpenClaw agent even if it somehow lists the studio tool', () => {
    expect(canProduce(MAGGIE)).toBe(false)
  })

  it('refuses junk', () => {
    expect(canProduce(null)).toBe(false)
    expect(canProduce({})).toBe(false)
    expect(canProduce({ runtimeProvider: 'deerflow-hetzner' })).toBe(false)
  })
})

describe('parseStudioRequest — kind detection', () => {
  it('reads a video brief', () => {
    const r = parseStudioRequest('Iris, make me an eight second clip of an operations floor at dawn, slow push in')
    expect(r.kind).toBe('video')
    expect(r.brief).toMatch(/operations floor at dawn/)
  })

  it('reads a music brief', () => {
    expect(parseStudioRequest('generate a thirty second underscore, low synth bass, minor key').kind).toBe('music')
  })

  it('reads a deck brief', () => {
    expect(parseStudioRequest('Wes, build me eight slides on why we beat a normal CRM').kind).toBe('deck')
  })

  it('prefers podcast over video when both nouns appear', () => {
    expect(parseStudioRequest('make a podcast episode about the video we shipped').kind).toBe('podcast')
  })

  it('reads an image brief', () => {
    expect(parseStudioRequest('create an image of a dark control room, photoreal').kind).toBe('image')
  })

  it('reads a voiceover brief and prefers it over podcast', () => {
    expect(parseStudioRequest('Iris, record a voiceover for the demo').kind).toBe('voiceover')
    expect(parseStudioRequest('narrate this in one voice, ninety seconds').kind).toBe('voiceover')
    expect(parseStudioRequest('make a voiceover for the podcast intro').kind).toBe('voiceover')
  })

  it('takes a URL as the production signal when no verb is present', () => {
    const r = parseStudioRequest('https://example.com/article — podcast, angle it as why operators are done with systems of record')
    expect(r.kind).toBe('podcast')
    expect(r.brief).toMatch(/example\.com/)
  })

  it('keeps the URL and the angle in the brief', () => {
    const r = parseStudioRequest('Iris, make a voiceover from https://openocti.local/post with the angle that this is a system of action')
    expect(r.kind).toBe('voiceover')
    expect(r.brief).toMatch(/https:\/\//)
    expect(r.brief).toMatch(/system of action/)
  })

  it('strips the name address from the brief', () => {
    const r = parseStudioRequest('Iris, create an image of a dark control room')
    expect(r.brief.toLowerCase().startsWith('iris')).toBe(false)
  })
})

describe('parseStudioRequest — refuses to spend money on non-requests', () => {
  it('ignores a bare noun with no production verb', () => {
    expect(parseStudioRequest('the video was great')).toBeNull()
    expect(parseStudioRequest('I liked that track')).toBeNull()
  })

  it('ignores conversation control', () => {
    for (const t of ['yes', 'ok', 'cancel', 'never mind', 'status', 'go', 'thanks']) {
      expect(parseStudioRequest(t)).toBeNull()
    }
  })

  it('ignores a research request', () => {
    expect(parseStudioRequest('research Blue Ridge Contracting and vet them')).toBeNull()
  })

  it('ignores the synthetic greeting turn', () => {
    expect(parseStudioRequest('The user just greeted you')).toBeNull()
  })

  it('ignores empty and near-empty input', () => {
    expect(parseStudioRequest('')).toBeNull()
    expect(parseStudioRequest('   ')).toBeNull()
    expect(parseStudioRequest(null)).toBeNull()
  })

  it('accepts a spelled-out length cue without an explicit verb', () => {
    expect(parseStudioRequest('eight second clip of an empty command center at dawn').kind).toBe('video')
  })

  it('still refuses a length cue with no kind noun — "give me a second" must not render', () => {
    expect(parseStudioRequest('give me a second')).toBeNull()
    expect(parseStudioRequest('hold on thirty seconds')).toBeNull()
  })
})

describe('control phrases', () => {
  it('detects cancel', () => {
    expect(isStudioCancel('cancel that')).toBe(true)
    expect(isStudioCancel('never mind')).toBe(true)
    expect(isStudioCancel('make me a clip')).toBe(false)
  })

  it('detects a status question', () => {
    expect(isStudioStatusQuestion('any update?')).toBe(true)
    expect(isStudioStatusQuestion("how's it coming")).toBe(true)
    expect(isStudioStatusQuestion('make me a clip')).toBe(false)
  })

  // The two utterances that actually fell through to the research prompt on
  // 2026-08-05 while a render was running. Regression guards.
  it('detects the real-world phrasings that used to fall through', () => {
    expect(isStudioStatusQuestion('where do you plan on putting my deliverables')).toBe(true)
    expect(isStudioStatusQuestion('no you already working on some things I want to know if they are really working are you really doing the jobs that I gave')).toBe(true)
    expect(isStudioStatusQuestion('did you do it')).toBe(true)
    expect(isStudioStatusQuestion('are you still working on that')).toBe(true)
    expect(isStudioStatusQuestion('where did my files go')).toBe(true)
    expect(isStudioStatusQuestion('anything yet')).toBe(true)
    expect(isStudioStatusQuestion('what happened to the deck')).toBe(true)
  })

  it('does not mistake a fresh production brief for a status question', () => {
    expect(isStudioStatusQuestion('create an image of a dark control room')).toBe(false)
    expect(isStudioStatusQuestion('make me a thirty second underscore')).toBe(false)
  })
})
