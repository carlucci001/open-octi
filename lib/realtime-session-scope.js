// Events from a closed connection must never affect its replacement.
export function createRealtimeSessionScope(owner, session) {
  session.closed = false
  session.abortController = new AbortController()
  owner.current = session
  const isCurrent = () => owner.current === session && !session.closed
  const scope = {
    isCurrent,
    guard: handler => (...args) => isCurrent() ? handler(...args) : undefined,
    send: event => {
      if (!isCurrent() || session.dc?.readyState !== 'open') return false
      session.dc.send(JSON.stringify(event))
      return true
    },
    retire: () => {
      session.closed = true
      session.abortController.abort()
    },
  }
  session.scope = scope
  return scope
}

export function realtimeGreeting({ openOcti, agentId, firstMessage }) {
  if (openOcti) {
    // Response instructions replace the full persona, including its knowledge.
    return { type: 'response.create', response: { tool_choice: 'none' } }
  }
  return {
    type: 'response.create',
    response: {
      instructions: firstMessage
        ? `Greet Carl as ${agentId === 'finance-manager' ? 'Frank' : 'your active persona'} in one short sentence: "${firstMessage}"`
        : 'Greet Carl in one short sentence and ask how you can help.',
    },
  }
}
