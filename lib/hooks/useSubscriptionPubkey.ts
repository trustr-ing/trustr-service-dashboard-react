import { useEffect, useState } from 'react'

export function useSubscriptionPubkey() {
  const [subscriptionPubkey, setSubscriptionPubkey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchSubscription() {
      try {
        const response = await fetch('/api/subscription')
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('No subscription found. Please contact support.')
          } else if (response.status === 401) {
            setError('Unauthorized. Please log in again.')
          } else {
            setError('Failed to fetch subscription')
          }
          return
        }

        const data = await response.json()
        setSubscriptionPubkey(data.pubkey)
      } catch (err) {
        console.error('Failed to fetch subscription:', err)
        setError('Failed to fetch subscription')
      } finally {
        setLoading(false)
      }
    }

    fetchSubscription()
  }, [])

  return { subscriptionPubkey, loading, error }
}
