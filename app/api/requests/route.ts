import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { savedRequests } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
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
      limit: 50,
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
    const { eventId, templateId } = body

    if (!eventId) {
      return NextResponse.json({ error: 'Missing eventId' }, { status: 400 })
    }

    const [savedRequest] = await db
      .insert(savedRequests)
      .values({
        userId: user.id,
        eventId,
        templateId: templateId || null,
        status: 'pending',
      })
      .returning()

    return NextResponse.json({ savedRequest })
  } catch (error) {
    console.error('Save request error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
