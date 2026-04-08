import { useState, useEffect } from 'react'
import { nip19 } from 'nostr-tools'

export interface POVOption {
  value: string // hex pubkey
  label: string // npub format
  lastUsed: string
}

export function usePastPOVs() {
  const [povOptions, setPovOptions] = useState<POVOption[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchPastPOVs = async () => {
      try {
        const response = await fetch('/api/requests')
        if (!response.ok) {
          throw new Error('Failed to fetch requests')
        }

        const data = await response.json()
        const requests = data.requests || []

        // Extract POVs from completed requests
        const povMap = new Map<string, string>()
        
        requests
          .filter((r: { status: string; configData: string }) => r.status === 'completed')
          .forEach((r: { configData: string; publishedAt: string }) => {
            try {
              const config = JSON.parse(r.configData)
              if (config.pov) {
                // Keep track of most recent usage
                if (!povMap.has(config.pov) || r.publishedAt > povMap.get(config.pov)!) {
                  povMap.set(config.pov, r.publishedAt)
                }
              }
            } catch (err) {
              console.warn('Failed to parse config:', err)
            }
          })

        // Convert to options with npub format
        const options: POVOption[] = Array.from(povMap.entries())
          .map(([pubkey, lastUsed]) => {
            let label = pubkey
            try {
              label = nip19.npubEncode(pubkey)
            } catch {
              // Keep hex if encoding fails
            }
            
            return {
              value: pubkey,
              label,
              lastUsed
            }
          })
          .sort((a, b) => b.lastUsed.localeCompare(a.lastUsed)) // Most recent first

        setPovOptions(options)
      } catch (err) {
        console.error('Failed to fetch past POVs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchPastPOVs()
  }, [])

  return { povOptions, loading }
}
