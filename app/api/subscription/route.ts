import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getSession } from '@/lib/auth/session'

export async function GET() {
  try {
    const session = await getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, session.userId),
    })

    if (!subscription) {
      return NextResponse.json({ error: 'No subscription found' }, { status: 404 })
    }

    return NextResponse.json({
      id: subscription.id,
      pubkey: subscription.pubkey,
      privkey: subscription.privkey,
      name: subscription.name,
      isActive: subscription.isActive,
    })
  } catch (error) {
    console.error('Failed to fetch subscription:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
