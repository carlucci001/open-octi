// Read-only view onto the live agent-tool risk classification declared in
// app/api/agent/execute/route.js (TOOL_RISK_POLICIES + SAFE_TOOLS). Built for
// the Agent Approvals settings screen, which needs to show "nobody can see
// the security posture without reading source" — this makes that posture
// visible without hand-maintaining a second copy of the list that could
// silently drift from route.js.
//
// route.js only exports its Next.js route handlers (GET/POST), not the
// internal TOOL_RISK_POLICIES/SAFE_TOOLS registries, and importing the whole
// route module would pull in a long chain of server-only side effects
// (Resend, entityStore, auth, media-gen, Stripe catalog, …). So — exactly
// like __tests__/agentToolPolicyCoverage.test.js and
// scripts/feature-inventory.mjs already do for this same file — this parses
// route.js's source with the TypeScript compiler's AST to pull the two
// declarations out as data. `typescript` is an existing devDependency
// already used this way elsewhere in the repo; nothing new is introduced.
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROUTE_PATH = path.join(process.cwd(), 'app/api/agent/execute/route.js')

let cache = null // { mtimeMs, size, data }

function findVariableInitializer(sourceFile, name) {
  let found = null
  function visit(node) {
    if (found) return
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = node.initializer
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return found
}

function staticLiteralValue(node) {
  if (!node) return undefined
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false
  if (ts.isNumericLiteral(node)) return Number(node.text)
  return undefined
}

function objectLiteralProp(node, key) {
  if (!node || !ts.isObjectLiteralExpression(node)) return undefined
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name
    const propName = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null
    if (propName === key) return staticLiteralValue(property.initializer)
  }
  return undefined
}

// TOOL_RISK_POLICIES = { toolName: { risk, approvalRequired, reason }, ... }
function extractRiskPolicies(node) {
  if (!node || !ts.isObjectLiteralExpression(node)) return []
  const out = []
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property)) continue
    const name = property.name
    const tool = ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : null
    if (!tool) continue
    const entry = property.initializer
    out.push({
      tool,
      risk: objectLiteralProp(entry, 'risk') ?? null,
      approvalRequired: objectLiteralProp(entry, 'approvalRequired') ?? true,
      reason: objectLiteralProp(entry, 'reason') ?? '',
    })
  }
  return out.sort((a, b) => a.tool.localeCompare(b.tool))
}

// SAFE_TOOLS = new Set([ 'a', 'b', ... ])
function extractSafeTools(node) {
  if (!node || !ts.isNewExpression(node)) return []
  const arrayArg = node.arguments?.[0]
  if (!arrayArg || !ts.isArrayLiteralExpression(arrayArg)) return []
  return arrayArg.elements
    .filter(el => ts.isStringLiteral(el))
    .map(el => el.text)
    .sort((a, b) => a.localeCompare(b))
}

function parse(text) {
  const sourceFile = ts.createSourceFile(ROUTE_PATH, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  const riskPoliciesInitializer = findVariableInitializer(sourceFile, 'TOOL_RISK_POLICIES')
  const safeToolsInitializer = findVariableInitializer(sourceFile, 'SAFE_TOOLS')
  const policies = extractRiskPolicies(riskPoliciesInitializer)
  const safeTools = extractSafeTools(safeToolsInitializer)
  return {
    policies,
    approvalRequiredCount: policies.filter(p => p.approvalRequired !== false).length,
    safeTools,
    safeToolCount: safeTools.length,
    parsedAt: new Date().toISOString(),
  }
}

// Cached on route.js's mtime/size so repeated settings-screen loads don't
// re-parse a ~4800-line file on every request, while still picking up an
// edit as soon as the file next changes on disk.
export function getAgentToolRiskCatalog() {
  let stat
  try {
    stat = fs.statSync(ROUTE_PATH)
  } catch (e) {
    return { policies: [], approvalRequiredCount: 0, safeTools: [], safeToolCount: 0, error: `route.js not found: ${String(e.message || e)}` }
  }
  if (cache && cache.mtimeMs === stat.mtimeMs && cache.size === stat.size) return cache.data
  try {
    const text = fs.readFileSync(ROUTE_PATH, 'utf8')
    const data = parse(text)
    cache = { mtimeMs: stat.mtimeMs, size: stat.size, data }
    return data
  } catch (e) {
    return { policies: [], approvalRequiredCount: 0, safeTools: [], safeToolCount: 0, error: `could not parse route.js: ${String(e.message || e).slice(0, 300)}` }
  }
}
