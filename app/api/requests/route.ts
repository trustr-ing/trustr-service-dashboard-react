import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { savedRequests } from '@/lib/db/schema'
import { and, eq, desc } from 'drizzle-orm'
import { getCurrentUser } from '@/lib/auth/session'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const requests = await db.query.savedRequests.findMany({
      where: eq(savedRequests.userId, user.id),
      orderBy: [desc(savedRequests.publishedAt)],
    })

    return NextResponse.json({ requests })
  } catch (error) {
    console.error('Get requests error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { eventId, templateId, configData } = body

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const serializedConfigData = configData ? JSON.stringify(configData) : '{}'

    const [savedRequest] = await db
      .insert(savedRequests)
      .values({
        userId: user.id,
        eventId,
        templateId: templateId || null,
        configData: serializedConfigData,
        status: 'pending',
      })
      // Request events can be discovered by sync immediately after publish,
      // so duplicate writes by eventId should be treated as idempotent.
      .onConflictDoNothing({ target: savedRequests.eventId })
      .returning()

    if (!savedRequest) {
      const [existingSavedRequest] = await db.query.savedRequests.findMany({
        where: and(
          eq(savedRequests.eventId, eventId),
          eq(savedRequests.userId, user.id),
        ),
        limit: 1,
      })

      if (existingSavedRequest) {
        return NextResponse.json({ savedRequest: existingSavedRequest })
      }

      return NextResponse.json({ error: 'Request already exists' }, { status: 409 })
    }

    return NextResponse.json({ savedRequest })
  } catch (error) {
    console.error('Save request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
