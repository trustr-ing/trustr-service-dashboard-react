import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { nip19 } from 'nostr-tools'
import { Plus, X } from 'lucide-react'

interface PastRequest {
  id: number
  eventId: string
  resultEventIds: string
  firstOutputNaddr: string | null
  publishedAt: string
  configData: string
  status: string
}

interface POVInputProps {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  userPubkey?: string
  allowMultiple?: boolean
}

type InputMode = 'pubkey' | 'naddr' | 'selector'

export function POVInput({ value, onChange, disabled, userPubkey, allowMultiple = false }: POVInputProps) {
  const [mode, setMode] = useState<InputMode>('pubkey')
  const [pubkeys, setPubkeys] = useState<string[]>([userPubkey || ''])
  const [pastRequests, setPastRequests] = useState<PastRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Auto-detect mode from value
  useEffect(() => {
    const normalizedValue = value.trim()
    if (!normalizedValue) {
      return
    }

    if (mode !== 'selector' && normalizedValue.startsWith('naddr1')) {
      setMode('naddr')
      return
    }

    if (mode !== 'selector' && /^[0-9a-f]{64}$/i.test(normalizedValue)) {
      setMode('pubkey')
      if (allowMultiple) {
        setPubkeys([normalizedValue])
      }
    }
  }, [allowMultiple, mode, value])

  // Fetch past requests when selector mode is activated
  useEffect(() => {
    if (mode === 'selector') {
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
        r.status === 'completed' && r.firstOutputNaddr
      )
      setPastRequests(completed)
    } catch (err) {
      console.error('Failed to fetch past requests:', err)
    } finally {
      setLoading(false)
    }
  }

  const validatePubkey = (pk: string): boolean => {
    if (!pk || pk.trim() === '') return true // Empty is valid (optional)
    return /^[0-9a-f]{64}$/i.test(pk)
  }

  const validateNaddr = (addr: string): boolean => {
    if (!addr || addr.trim() === '') return false
    try {
      const decoded = nip19.decode(addr)
      return decoded.type === 'naddr'
    } catch {
      return false
    }
  }

  const handleModeChange = (newMode: InputMode) => {
    setMode(newMode)
    setValidationError(null)
    
    if (newMode === 'pubkey') {
      // Set default to user pubkey for first entry
      if (allowMultiple) {
        setPubkeys([userPubkey || ''])
        onChange(userPubkey || '')
      } else {
        onChange(userPubkey || '')
      }
    } else if (newMode === 'naddr' || newMode === 'selector') {
      onChange('')
    }
  }

  const handlePubkeyChange = (index: number, pk: string) => {
    const newPubkeys = [...pubkeys]
    newPubkeys[index] = pk
    setPubkeys(newPubkeys)
    
    // Validation
    if (pk && !validatePubkey(pk)) {
      setValidationError('Invalid pubkey format (must be 64 character hex)')
    } else {
      setValidationError(null)
    }
    
    // For single pubkey or first pubkey, update value
    if (!allowMultiple || index === 0) {
      onChange(pk)
    } else {
      // For multiple pubkeys, join with commas
      onChange(newPubkeys.filter(p => p.trim()).join(','))
    }
  }

  const handleNaddrChange = (addr: string) => {
    onChange(addr)
    
    if (addr && !validateNaddr(addr)) {
      setValidationError('Invalid naddr format')
    } else {
      setValidationError(null)
    }
  }

  const addPubkeyField = () => {
    setPubkeys([...pubkeys, ''])
  }

  const removePubkeyField = (index: number) => {
    const newPubkeys = pubkeys.filter((_, i) => i !== index)
    setPubkeys(newPubkeys)
    onChange(newPubkeys.filter(p => p.trim()).join(','))
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">
        Point of View (POV) <span className="text-red-500">*</span>
      </label>
      
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === 'pubkey' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('pubkey')}
          disabled={disabled}
        >
          Pubkey
        </Button>
        <Button
          type="button"
          variant={mode === 'naddr' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('naddr')}
          disabled={disabled}
        >
          Naddr
        </Button>
        <Button
          type="button"
          variant={mode === 'selector' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handleModeChange('selector')}
          disabled={disabled}
        >
          My Requests
        </Button>
      </div>

      {mode === 'pubkey' && (
        <div className="space-y-2">
          {allowMultiple ? (
            <>
              {pubkeys.map((pk, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={pk}
                    onChange={(e) => handlePubkeyChange(index, e.target.value)}
                    placeholder={index === 0 ? "Your pubkey (64 char hex)" : "Additional pubkey"}
                    disabled={disabled}
                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-sm"
                  />
                  {index > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => removePubkeyField(index)}
                      disabled={disabled}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPubkeyField}
                disabled={disabled}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Pubkey
              </Button>
            </>
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => handlePubkeyChange(0, e.target.value)}
              placeholder="Pubkey (64 character hex)"
              disabled={disabled}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-sm"
            />
          )}
          <p className="text-xs text-gray-500">
            {allowMultiple ? 'Enter one or more pubkeys to rank from multiple perspectives' : 'Enter a pubkey to start ranking from that perspective (defaults to your pubkey)'}
          </p>
        </div>
      )}

      {mode === 'naddr' && (
        <div>
          <input
            type="text"
            value={value}
            onChange={(e) => handleNaddrChange(e.target.value)}
            placeholder="naddr1..."
            disabled={disabled}
            className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 font-mono text-sm"
          />
          <p className="text-xs text-gray-500 mt-1">
            Enter an naddr address (NIP-19 event pointer) to use output from any event
          </p>
        </div>
      )}

      {mode === 'selector' && (
        <div>
          {loading ? (
            <div className="text-sm text-gray-500 py-2">Loading past requests...</div>
          ) : pastRequests.length === 0 ? (
            <div className="text-sm text-gray-500 py-2">
              No completed requests found. Complete a request first to use this option.
            </div>
          ) : (
            <select
              value={value}
              onChange={(e) => {
                onChange(e.target.value)
                setValidationError(null)
              }}
              disabled={disabled}
              className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
            >
              <option value="">Select a previous request output...</option>
              {pastRequests.map((request) => {
                if (!request.firstOutputNaddr) return null
                const date = new Date(request.publishedAt).toLocaleDateString()
                const config = JSON.parse(request.configData)
                const title = config.title || 'Untitled'
                return (
                  <option key={request.id} value={request.firstOutputNaddr}>
                    {title} - {date}
                  </option>
                )
              })}
            </select>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Use the output from one of your previous successful requests as the starting point
          </p>
        </div>
      )}

      {validationError && (
        <p className="text-xs text-red-500">{validationError}</p>
      )}
    </div>
  )
}
