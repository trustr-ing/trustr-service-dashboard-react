import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { hexToNpub } from '@/lib/nostr/keys'
import { createSession } from '@/lib/auth/session'
import { verifyEvent } from 'nostr-tools'

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
