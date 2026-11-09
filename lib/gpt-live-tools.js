function validArguments(value, schema) {
  if (!schema) return false
  if (schema.enum && !schema.enum.includes(value)) return false
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    if ((schema.required || []).some(key => !(key in value))) return false
    return Object.entries(value).every(([key, item]) => schema.properties?.[key]
      ? validArguments(item, schema.properties[key]) : schema.additionalProperties !== false)
  }
  if (schema.type === 'array') return Array.isArray(value) && value.every(item => validArguments(item, schema.items))
  if (schema.type === 'integer') return Number.isInteger(value)
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  if (['string', 'boolean'].includes(schema.type)) return typeof value === schema.type
  return !schema.type
}

// Live forwards Responses events inside response.event. Wait for the response's
// complete set of calls, then submit every result before one continuation.
export function createLiveToolBridge({ tools, schemas, send, isCurrent, onUsage = () => {}, onError = () => {} }) {
  const delegations = new Map()
  const responses = new Map()
  const calls = new Map()
  let serial = Promise.resolve()
  const responseKey = (delegationId, responseId) => `${delegationId}:${responseId}`
  async function execute(call) {
    if (calls.has(call.call_id)) {
      const previous = calls.get(call.call_id)
      if (previous.name !== call.name || previous.arguments !== call.arguments) throw new Error('GPT-Live reused a tool call with different arguments.')
      return previous.result
    }
    let args
    let result
    try {
      args = JSON.parse(call.arguments || '{}')
      if (!Object.hasOwn(schemas, call.name) || typeof tools[call.name] !== 'function' || !validArguments(args, schemas[call.name])) {
        result = JSON.stringify({ error: 'Tool unavailable or arguments invalid. Ask for the missing details; no action was performed.' })
      } else if (isCurrent()) {
        const output = await tools[call.name](args)
        result = typeof output === 'string' ? output : JSON.stringify(output ?? { ok: true })
      }
    } catch {
      result = JSON.stringify({ error: 'The tool could not complete. Do not claim success or automatically repeat a consequential action.' })
    }
    calls.set(call.call_id, { name: call.name, arguments: call.arguments, result })
    return result
  }
  return {
    handle(envelope) {
      if (!isCurrent() || envelope.type !== 'response.event') return serial
      const event = envelope.event || {}
      const delegationId = envelope.delegation_id
      if (!delegationId) return serial
      if (event.type === 'response.created') {
        const id = event.response?.id
        if (id) {
          delegations.set(delegationId, id)
          const key = responseKey(delegationId, id)
          if (!responses.has(key)) responses.set(key, { calls: new Map(), finished: false })
        }
        return serial
      }
      const id = event.response?.id || event.response_id || delegations.get(delegationId)
      const response = responses.get(responseKey(delegationId, id))
      if (!response || response.finished) return serial
      if (event.type === 'response.output_item.done' && event.item?.type === 'function_call' && event.item.call_id) {
        const previous = response.calls.get(event.item.call_id)
        if (previous && JSON.stringify(previous) !== JSON.stringify(event.item)) {
          response.finished = true
          onError('GPT-Live returned conflicting tool calls; no action was performed.')
        } else response.calls.set(event.item.call_id, event.item)
      }
      if (['response.completed', 'response.failed', 'response.incomplete'].includes(event.type)) {
        response.finished = true
        if (event.response?.usage) onUsage({ responseId: id, usage: event.response.usage })
        if (event.type !== 'response.completed') {
          onError('The agent’s reasoning request did not finish. No pending tools were run.')
          return serial
        }
        serial = serial.then(async () => {
          if (!isCurrent()) return
          let submitted = 0
          for (const call of response.calls.values()) {
            if (!isCurrent()) return
            // A replayed call must not produce either a second action or a
            // duplicate output, both of which the provider rejects.
            if (calls.has(call.call_id)) continue
            const output = await execute(call)
            if (!isCurrent() || !send({ type: 'response.item.create', item: { type: 'function_call_output', call_id: call.call_id, output } })) return
            submitted++
          }
          if (submitted && isCurrent()) send({ type: 'response.create' })
        }).catch(() => onError('The agent could not return a tool result. Check the action before trying again.'))
      }
      return serial
    },
  }
}
