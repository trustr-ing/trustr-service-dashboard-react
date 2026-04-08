import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { savedRequests } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/session'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params

    // Check if id is numeric (database id) or hex string (eventId)
    const isNumeric = /^\d+$/.test(id)
    
    const [savedRequest] = await db.query.savedRequests.findMany({
      where: isNumeric 
        ? and(
            eq(savedRequests.id, parseInt(id)),
            eq(savedRequests.userId, user.id)
          )
        : and(
            eq(savedRequests.eventId, id),
            eq(savedRequests.userId, user.id)
          ),
      limit: 1,
    })

    if (!savedRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json({ request: savedRequest })
  } catch (error) {
    console.error('Get request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { status, eventId, configData, resultEventIds, feedbackEventIds, completedAt } = body

    const updateData: Record<string, unknown> = {}
    if (status) updateData.status = status
    if (eventId) updateData.eventId = eventId
    if (configData) updateData.configData = configData
    if (resultEventIds) updateData.resultEventIds = JSON.stringify(resultEventIds)
    if (feedbackEventIds) updateData.feedbackEventIds = JSON.stringify(feedbackEventIds)
    if (completedAt) updateData.completedAt = new Date(completedAt)

    // Check if id is numeric (database id) or hex string (eventId)
    const isNumeric = /^\d+$/.test(id)

    const [updated] = await db
      .update(savedRequests)
      .set(updateData)
      .where(
        isNumeric
          ? and(
              eq(savedRequests.id, parseInt(id)),
              eq(savedRequests.userId, user.id)
            )
          : and(
              eq(savedRequests.eventId, id),
              eq(savedRequests.userId, user.id)
            )
      )
      .returning()

    if (!updated) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json({ savedRequest: updated })
  } catch (error) {
    console.error('Update request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { id } = await params

    const [deleted] = await db
      .delete(savedRequests)
      .where(
        and(
          eq(savedRequests.id, parseInt(id)),
          eq(savedRequests.userId, user.id)
        )
      )
      .returning()

    if (!deleted) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
