import { useState, useEffect } from 'react'
import { nip19 } from 'nostr-tools'

export interface POVOption {
  value: string // naddr or hex pubkey
  label: string // naddr format or npub
  lastUsed: string
  isOutput: boolean
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

        const options: POVOption[] = []
        
        // Get completed requests with output events
        requests
          .filter((r: { status: string; resultEventIds: string }) => r.status === 'completed')
          .forEach((r: { eventId: string; resultEventIds: string; publishedAt: string; configData: string }) => {
            try {
              const resultIds = JSON.parse(r.resultEventIds || '[]')
              const config = JSON.parse(r.configData)
              
              // For each output event, create an naddr reference
              resultIds.forEach((eventId: string) => {
                try {
                  // Get service pubkey from config
                  const servicePubkey = config.servicePubkey || config.service_pubkey
                  
                  if (servicePubkey && eventId) {
                    // Create naddr for the output event (kind 37573)
                    const naddr = nip19.naddrEncode({
                      kind: 37573,
                      pubkey: servicePubkey,
                      identifier: eventId
                    })
                    
                    options.push({
                      value: naddr,
                      label: `${naddr.slice(0, 16)}... (${new Date(r.publishedAt).toLocaleDateString()})`,
                      lastUsed: r.publishedAt,
                      isOutput: true
                    })
                  }
                } catch (err) {
                  console.warn('Failed to create naddr:', err)
                }
              })
            } catch (err) {
              console.warn('Failed to parse request:', err)
            }
          })

        // Sort by most recent first
        options.sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))

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
