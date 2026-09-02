import { NextResponse } from 'next/server'
import { getCurrentUser } from './auth'
import { hasCapability } from './roles'

export function forbidden(message = 'forbidden') {
  return NextResponse.json({ ok: false, error: message }, { status: 403 })
}

export function unauthorized() {
  return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
}

export async function requireCapability(request, capability) {
  const user = await getCurrentUser(request)
  if (!user) return { user: null, error: unauthorized() }
  if (!hasCapability(user, capability)) {
    return { user: null, error: forbidden('permission denied') }
  }
  return { user, error: null }
}

export async function requireCrmRead(request) {
  return requireCapability(request, 'crm:read')
}

export async function requireCrmWrite(request) {
  return requireCapability(request, 'crm:write')
}

export async function requireUserManagement(request) {
  return requireCapability(request, 'users:manage')
}
