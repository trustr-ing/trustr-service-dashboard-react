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

    const [savedRequest] = await db.query.savedRequests.findMany({
      where: and(
        eq(savedRequests.id, parseInt(id)),
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
