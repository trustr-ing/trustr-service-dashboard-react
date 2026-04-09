import { useEffect, useState } from 'react'
import { db } from '@/lib/db'
import { subscriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface UserSubscription {
  id: number
  pubkey: string
  name: string
  isActive: boolean
}

export function useSubscription(userId?: number) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchSubscription() {
      if (!userId) {
        setLoading(false)
        return
      }

      try {
        const sub = await db.query.subscriptions.findFirst({
          where: eq(subscriptions.userId, userId),
        })

        if (sub) {
          setSubscription({
            id: sub.id,
            pubkey: sub.pubkey,
            privkey: sub.privkey,
            isActive: sub.isActive,
          })
        }
      } catch (error) {
        console.error('Failed to fetch subscription:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSubscription()
  }, [userId])

  return { subscription, loading }
}
