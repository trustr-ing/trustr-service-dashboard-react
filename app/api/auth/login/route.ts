import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users, subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hexToNpub } from '@/lib/nostr/keys'
import { createSession } from '@/lib/auth/session'
import { verifyEvent } from 'nostr-tools'
import { createOrchestratorSubscription, getActiveSubscription } from '@/lib/orchestrator/subscriptions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { pubkey, signedEvent } = body

    if (!pubkey) {
      return NextResponse.json({ error: 'Missing pubkey' }, { status: 400 })
    }

    if (signedEvent) {
      const isValid = verifyEvent(signedEvent)
      if (!isValid || signedEvent.pubkey !== pubkey) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
      }
    }

    let user = await db.query.users.findFirst({
      where: eq(users.pubkey, pubkey),
    })

    if (!user) {
      const [newUser] = await db.insert(users).values({
        pubkey,
        npub: hexToNpub(pubkey),
        displayName: null,
      }).returning()
      user = newUser
    } else {
      await db.update(users)
        .set({ lastLoginAt: new Date() })
        .where(eq(users.id, user.id))
    }

    // Auto-register orchestrator subscription if not exists
    let subscription = await db.query.subscriptions.findFirst({
      where: eq(subscriptions.userId, user.id),
    })

    if (!subscription) {
      try {
        // Check if orchestrator subscription already exists
        const existingSub = await getActiveSubscription(pubkey)
        
        if (existingSub) {
          // Store existing subscription (pubkey only - privkey stays on orchestrator)
          const [newSub] = await db.insert(subscriptions).values({
            userId: user.id,
            name: 'Default Subscription',
            pubkey: existingSub.subscriptionPubkey,
            isActive: existingSub.status === 'active',
          }).returning()
          subscription = newSub
        } else {
          // Create new orchestrator subscription
          const orchestratorSub = await createOrchestratorSubscription(pubkey)
          
          // Store in local database (pubkey only - privkey stays on orchestrator)
          const [newSub] = await db.insert(subscriptions).values({
            userId: user.id,
            name: 'Default Subscription',
            pubkey: orchestratorSub.subscriptionPubkey,
            isActive: true,
          }).returning()
          subscription = newSub
        }
      } catch (error) {
        console.error('Failed to create subscription:', error)
        // Continue login even if subscription creation fails
      }
    }

    await createSession(pubkey)

    return NextResponse.json({
      success: true,
      user: {
        pubkey: user.pubkey,
        npub: user.npub,
        displayName: user.displayName,
      },
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
