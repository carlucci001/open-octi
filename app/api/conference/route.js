import { NextResponse } from 'next/server'
import {
  listMeetings, getMeeting, createMeeting, updateMeeting, startMeeting, endMeeting, deleteMeeting,
  listRooms, createRoom, updateRoom, deleteRoom, bumpRoomUse,
} from '@/lib/conference-store'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    const url = new URL(request.url)
    const status = url.searchParams.get('status') || undefined
    const linkedToId = url.searchParams.get('linkedToId') || undefined
    const fromTime = url.searchParams.get('fromTime') || undefined
    const meetings = listMeetings({ status, linkedToId, fromTime })
    const rooms = listRooms()
    return NextResponse.json({ ok: true, meetings, rooms })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    const action = body.action

    if (action === 'create_meeting') return NextResponse.json({ ok: true, meeting: createMeeting(body.meeting || {}) })
    if (action === 'update_meeting') return NextResponse.json({ ok: true, meeting: updateMeeting(body.id, body.patch || {}) })
    if (action === 'start_meeting')  return NextResponse.json({ ok: true, meeting: startMeeting(body.id) })
    if (action === 'end_meeting')    return NextResponse.json({ ok: true, meeting: endMeeting(body.id, { notes: body.notes }) })
    if (action === 'delete_meeting') return NextResponse.json(deleteMeeting(body.id))
    if (action === 'get_meeting')    return NextResponse.json({ ok: true, meeting: getMeeting(body.id) })

    if (action === 'create_room') return NextResponse.json({ ok: true, room: createRoom(body.room || {}) })
    if (action === 'update_room') return NextResponse.json({ ok: true, room: updateRoom(body.id, body.patch || {}) })
    if (action === 'delete_room') return NextResponse.json(deleteRoom(body.id))
    if (action === 'bump_room')   return NextResponse.json({ ok: true, room: bumpRoomUse(body.id) })

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
