import { useState, useEffect } from 'react'

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

        // Get completed requests with first output naddr pointers
        requests
          .filter((r: { status: string; firstOutputNaddr: string | null }) =>
            r.status === 'completed' && Boolean(r.firstOutputNaddr)
          )
          .forEach((r: { firstOutputNaddr: string; publishedAt: string }) => {
            try {
              options.push({
                value: r.firstOutputNaddr,
                label: `${r.firstOutputNaddr.slice(0, 16)}... (${new Date(r.publishedAt).toLocaleDateString()})`,
                lastUsed: r.publishedAt,
                isOutput: true,
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
