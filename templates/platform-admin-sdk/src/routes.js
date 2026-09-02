const RESOURCE_NAMES = ['health', 'releases', 'errors', 'usage', 'revenue']

function stub(name) {
  return async function GET() {
    return Response.json({ error: { code: 'NOT_IMPLEMENTED', message: `Implement the ${name} Platform Admin resource.` } }, { status: 501 })
  }
}

export function createPlatformAdminRouteStubs(handlers = {}) {
  return Object.fromEntries(RESOURCE_NAMES.map(name => [name, { GET: handlers[name] || stub(name) }]))
}
