// Ordinary chat streams keep their existing EOF behavior. Research streams
// must receive a final receipt before a connection close counts as completion.
export function createResearchStreamTracker() {
  let research = null
  let finished = false
  return {
    accept(frame) {
      if (frame?.research && typeof frame.research === 'object') {
        research = { ...research, ...frame.research }
      }
      if (research && frame?.done === true) finished = true
    },
    hasResearch() {
      return Boolean(research)
    },
    interruptionText() {
      if (!research || finished) return ''
      const url = /^\/\?tab=research(?:&(?:job|dossier)=[A-Za-z0-9%_.~-]+)?$/.test(research.url || '')
        ? research.url
        : '/?tab=research'
      return `The chat connection ended before a final research result arrived. [Open research status](${url}) to check the saved request and its result.`
    },
  }
}
