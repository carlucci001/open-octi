import { NextResponse } from "next/server"
import { readData, writeData } from "@/lib/dataStore"
import { requireAdmin } from "@/lib/auth"
import crypto from "crypto"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  let body = {}
  try { body = await request.json() } catch {}
  const email = String(body.email || "").toLowerCase().trim()
  const accountId = body.accountId

  const accts = (readData("accounts.json") || { accounts: [] }).accounts || []
  const leases = (readData("leases.json") || { leases: [] }).leases || []
  const activeLeases = leases.filter(l => l.status === "active")
  const leasedAccountIds = new Set(activeLeases.map(l => l.clientAccountId).filter(Boolean))

  let acct = accts.find(a => (accountId && a.id === accountId) || (email && (a.email || "").toLowerCase() === email))
  if (!acct && !accountId && !email) {
    acct = accts.find(a => leasedAccountIds.has(a.id) && (
      a.hidden ||
      a.type === "internal-test" ||
      (a.tags || []).includes("portal-test") ||
      /portal self-test/i.test(a.name || "")
    ))
    if (!acct) acct = accts.find(a => leasedAccountIds.has(a.id) && a.email)
  }

  if (!acct) return NextResponse.json({ ok: false, error: "account not found" }, { status: 404 })
  const lease = activeLeases.find(l => l.clientAccountId === acct.id)
  if (!lease) return NextResponse.json({ ok: false, error: "account has no active lease" }, { status: 400 })

  const sessions = readData("portal-sessions.json") || { tokens: {}, sessions: {}, requestLog: [] }
  const token = crypto.randomBytes(32).toString("base64url")
  const now = Date.now()
  sessions.tokens = sessions.tokens || {}
  sessions.tokens[token] = {
    email: acct.email,
    accountId: acct.id,
    leaseId: lease.id,
    tenantId: lease.tenantId,
    issuedAt: now,
    expiresAt: now + 15 * 60 * 1000,
    used: false,
  }
  writeData("portal-sessions.json", sessions)

  const url = "https://portal.farringtondevelopment.com/api/portal/auth/verify?token=" + token
  return NextResponse.json({ ok: true, url, account: { id: acct.id, name: acct.name, email: acct.email } })
}
