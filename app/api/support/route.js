import { NextResponse } from 'next/server'
import { findById, logActivity } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { createBuildBoardCard } from '@/lib/build-board'
import {
  addSupportTicketComment,
  createSupportTicket,
  deleteSupportTicket,
  getSupportTicket,
  listSupportTickets,
  SUPPORT_CATEGORIES,
  SUPPORT_PRIORITIES,
  SUPPORT_STATUSES,
  updateSupportTicket,
} from '@/lib/supportTickets'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function actorFromUser(user) {
  return {
    type: 'staff',
    id: user?.id || user?.email || null,
    name: user?.name || user?.email || 'Command Center',
  }
}

function enrichTicket(ticket = {}) {
  const accountId = ticket.accountId || ticket.clientId || null
  const account = accountId ? findById('accounts', accountId) : null
  return {
    ...ticket,
    accountId,
    clientId: ticket.clientId || accountId,
    accountName: ticket.accountName || account?.name || '',
    linkedTo: { ...(ticket.linkedTo || {}), ...(accountId ? { accountId } : {}) },
  }
}

function logTicketActivity(ticket, subject, body, meta = {}) {
  if (!ticket?.accountId) return
  logActivity({
    type: 'support_ticket',
    subject,
    body,
    linkedTo: { accountId: ticket.accountId, supportTicketId: ticket.id },
    meta: { ticketNumber: ticket.ticketNumber, status: ticket.status, priority: ticket.priority, ...meta },
  })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    const ticket = getSupportTicket(id, { includeDeleted: searchParams.get('includeDeleted') === 'true' })
    if (!ticket) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, ticket })
  }
  const tickets = listSupportTickets({
    accountId: searchParams.get('accountId') || searchParams.get('clientId') || undefined,
    status: searchParams.get('status') || undefined,
    priority: searchParams.get('priority') || undefined,
    category: searchParams.get('category') || undefined,
    assignedToUserId: searchParams.get('assignedToUserId') || undefined,
    q: searchParams.get('q') || undefined,
    includeClosed: searchParams.get('includeClosed') === 'true',
    includeDeleted: searchParams.get('includeDeleted') === 'true',
  })
  return NextResponse.json({
    ok: true,
    tickets,
    meta: { statuses: SUPPORT_STATUSES, priorities: SUPPORT_PRIORITIES, categories: SUPPORT_CATEGORIES },
  })
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()
  const actor = actorFromUser(user)

  if (body.action === 'add') {
    const ticket = createSupportTicket(enrichTicket(body.ticket || {}), actor)
    logTicketActivity(ticket, `Support ticket opened: ${ticket.subject}`, ticket.description, { action: 'created' })
    return NextResponse.json({ ok: true, ticket })
  }

  if (body.action === 'update') {
    const ticket = updateSupportTicket(body.ticket?.id || body.id, enrichTicket(body.ticket || body.patch || {}), actor)
    if (!ticket) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    logTicketActivity(ticket, `Support ticket updated: ${ticket.subject}`, `Status: ${ticket.status}. Priority: ${ticket.priority}.`, { action: 'updated' })
    return NextResponse.json({ ok: true, ticket })
  }

  if (body.action === 'comment') {
    const result = addSupportTicketComment(body.id || body.ticketId, body.comment || {}, actor)
    if (!result) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    logTicketActivity(result.ticket, `Support ticket comment: ${result.ticket.subject}`, result.comment.body, { action: 'commented', visibility: result.comment.visibility })
    return NextResponse.json({ ok: true, ...result })
  }

  if (body.action === 'delete') {
    const ticket = deleteSupportTicket(body.id || body.ticketId, actor)
    if (!ticket) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    logTicketActivity(ticket, `Support ticket deleted: ${ticket.subject}`, ticket.description, { action: 'deleted' })
    return NextResponse.json({ ok: true, ticket })
  }

  if (['resolve', 'close', 'reopen'].includes(body.action)) {
    const status = body.action === 'resolve' ? 'resolved' : body.action === 'close' ? 'closed' : 'reopened'
    const ticket = updateSupportTicket(body.id || body.ticketId, { status }, actor)
    if (!ticket) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    logTicketActivity(ticket, `Support ticket ${status}: ${ticket.subject}`, body.note || '', { action: body.action })
    return NextResponse.json({ ok: true, ticket })
  }

  if (body.action === 'send_to_build_board') {
    const current = getSupportTicket(body.id || body.ticketId)
    if (!current) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    if (current.category !== 'feature_request') {
      return NextResponse.json({ ok: false, error: 'Only Feature request tickets can be sent to Build Board' }, { status: 400 })
    }
    if (current.linkedTo?.buildBoardCardId) {
      return NextResponse.json({ ok: true, ticket: current, buildBoardCardId: current.linkedTo.buildBoardCardId, alreadyLinked: true })
    }
    let card
    try {
      card = await createBuildBoardCard({
        title: current.subject,
        summary: current.description,
        productId: current.productId || 'command-center',
        source: 'support',
        size: 'M',
        idempotencyKey: `support-ticket:${current.id}`,
        linkedTicket: { id: current.id, ticketNumber: current.ticketNumber, subject: current.subject },
      })
    } catch (buildBoardError) {
      return NextResponse.json({ ok: false, error: String(buildBoardError?.message || 'Hermes Build Board is unavailable').slice(0, 300) }, { status: 503 })
    }
    const ticket = updateSupportTicket(current.id, {
      linkedTo: { ...(current.linkedTo || {}), buildBoardCardId: card.id },
      buildBoardCardId: card.id,
    }, actor)
    logTicketActivity(ticket, `Sent to Build Board: ${ticket.subject}`, `Build Board card ${card.id} created in Idea.`, { action: 'send_to_build_board', buildBoardCardId: card.id })
    return NextResponse.json({ ok: true, ticket, card, buildBoardCardId: card.id })
  }

  return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
}
