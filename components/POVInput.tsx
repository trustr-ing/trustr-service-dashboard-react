import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { nip19 } from 'nostr-tools'

interface PastRequest {
  id: number
  eventId: string
  resultEventIds: string
  publishedAt: string
  configData: string
}

interface POVInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  userPubkey?: string
}

export function POVInput({ value, onChange, disabled, userPubkey }: POVInputProps) {
  const [mode, setMode] = useState<'self' | 'output'>('self')
  const [pastRequests, setPastRequests] = useState<PastRequest[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // Determine initial mode based on value
    if (value) {
      if (value.startsWith('naddr1')) {
        setMode('output')
      } else {
        setMode('self')
      }
    }
  }, [value])

  useEffect(() => {
    if (mode === 'output') {
      fetchPastRequests()
    }
  }, [mode])

  const fetchPastRequests = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/requests')
      if (!response.ok) throw new Error('Failed to fetch requests')
      
      const data = await response.json()
      const completed = data.requests.filter((r: PastRequest) => 
        r.resultEventIds && JSON.parse(r.resultEventIds).length > 0
      )
      setPastRequests(completed)
    } catch (err) {
      console.error('Failed to fetch past requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const createNaddrForRequest = (request: PastRequest): string | null => {
    try {
      const resultIds = JSON.parse(request.resultEventIds || '[]')
      const config = JSON.parse(request.configData)
      
      if (resultIds.length === 0) return null
      
      // Use first result event ID
      const resultEventId = resultIds[0]
      
      // Get service pubkey from config (could be from either service)
      const servicePubkey = config.servicePubkey || config.service_pubkey
      
      if (!servicePubkey || !resultEventId) return null
      
      // Create naddr for output event (kind 37573)
      const naddr = nip19.naddrEncode({
        kind: 37573,
        pubkey: servicePubkey,
        identifier: resultEventId
      })
      
      return naddr
    } catch (err) {
      console.error('Failed to create naddr:', err)
      return null
    }
  }

  const handleModeChange = (newMode: 'self' | 'output') => {
    setMode(newMode)
    if (newMode === 'self' && userPubkey) {
      onChange(userPubkey)
    } else {
      onChange('')
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Point of View (POV)
      </label>
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'self' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('self')}
          disabled={disabled}
        >
          My POV
        </Button>
        <Button
          type="button"
          variant={mode === 'output' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('output')}
          disabled={disabled}
        >
          From Existing Request
        </Button>
      </div>

      {mode === 'self' ? (
        <div>
          <input
            type="text"
            value={value || userPubkey || ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Your pubkey (hex format)"
            disabled={disabled}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
          />
          <p className="text-xs text-gray-500 mt-1">
            Start ranking from your own perspective
          </p>
        </div>
      ) : (
        <div>
          {loading ? (
            <div className="text-sm text-gray-500">Loading past requests...</div>
          ) : pastRequests.length === 0 ? (
            <div className="text-sm text-gray-500">
              No completed requests with results found
            </div>
          ) : (
            <select
              value={value}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
            >
              <option value="">Select a previous request output...</option>
              {pastRequests.map((request) => {
                const naddr = createNaddrForRequest(request)
                if (!naddr) return null
                const date = new Date(request.publishedAt).toLocaleDateString()
                return (
                  <option key={request.id} value={naddr}>
                    Request from {date} - {naddr.slice(0, 20)}...
                  </option>
                )
              })}
            </select>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Use output from a previous ranking as the starting point
          </p>
        </div>
      )}
    </div>
  )
}
