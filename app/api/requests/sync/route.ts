import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { savedRequests } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/session'

interface SyncRequestEvent {
  eventId: string
  configData: string
  publishedAt: number
  status: string
  resultEventIds: string[]
  feedbackEventIds: string[]
  firstOutputNaddr: string | null
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { events } = body as { events: SyncRequestEvent[] }

    if (!events || !Array.isArray(events)) {
      return NextResponse.json({ error: 'Missing events array' }, { status: 400 })
    }

    let imported = 0
    let updated = 0
    let skipped = 0

    for (const event of events) {
      if (!event.eventId) {
        skipped++
        continue
      }

      // Check if this request already exists
      const [existing] = await db.query.savedRequests.findMany({
        where: eq(savedRequests.eventId, event.eventId),
        limit: 1,
      })

      if (existing) {
        // Update if we have new output data the local DB doesn't have
        const existingResultIds = JSON.parse(existing.resultEventIds || '[]')
        const hasNewResults = event.resultEventIds.length > existingResultIds.length
        const needsStatusUpdate = existing.status === 'pending' && event.status === 'completed'
        const needsNaddrUpdate = !existing.firstOutputNaddr && event.firstOutputNaddr

        if (hasNewResults || needsStatusUpdate || needsNaddrUpdate) {
          const updateData: Record<string, unknown> = {}
          if (hasNewResults) {
            updateData.resultEventIds = JSON.stringify(event.resultEventIds)
          }
          if (event.feedbackEventIds.length > 0) {
            updateData.feedbackEventIds = JSON.stringify(event.feedbackEventIds)
          }
          if (needsStatusUpdate) {
            updateData.status = event.status
            updateData.completedAt = new Date()
          }
          if (needsNaddrUpdate) {
            updateData.firstOutputNaddr = event.firstOutputNaddr
          }

          if (Object.keys(updateData).length > 0) {
            await db.update(savedRequests)
              .set(updateData)
              .where(eq(savedRequests.eventId, event.eventId))
            updated++
          } else {
            skipped++
          }
        } else {
          skipped++
        }
      } else {
        // Insert new request discovered from relays
        await db.insert(savedRequests).values({
          userId: user.id,
          eventId: event.eventId,
          configData: event.configData || '{}',
          status: event.status,
          publishedAt: new Date(event.publishedAt * 1000),
          completedAt: event.status === 'completed' ? new Date() : null,
          resultEventIds: JSON.stringify(event.resultEventIds),
          feedbackEventIds: JSON.stringify(event.feedbackEventIds),
          firstOutputNaddr: event.firstOutputNaddr,
        })
        imported++
      }
    }

    return NextResponse.json({ imported, updated, skipped })
  } catch (error) {
    console.error('Sync requests error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
