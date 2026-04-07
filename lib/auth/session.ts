import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { sessions, users } from '@/lib/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { randomBytes } from 'crypto'

const SESSION_COOKIE_NAME = 'trustr_session'
const SESSION_DURATION_DAYS = 7

export async function createSession(pubkey: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.pubkey, pubkey),
  })

  if (!user) {
    throw new Error('User not found')
  }

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DURATION_DAYS)

  await db.insert(sessions).values({
    userId: user.id,
    token,
    expiresAt,
  })

  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
  })

  return token
}

export async function getSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (!token) {
    return null
  }

  const session = await db.query.sessions.findFirst({
    where: and(
      eq(sessions.token, token),
      gt(sessions.expiresAt, new Date())
    ),
    with: {
      user: true,
    },
  })

  return session || null
}

export async function getCurrentUser() {
  const session = await getSession()
  return session?.user || null
}

export async function destroySession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value

  if (token) {
    await db.delete(sessions).where(eq(sessions.token, token))
  }

  cookieStore.delete(SESSION_COOKIE_NAME)
}
