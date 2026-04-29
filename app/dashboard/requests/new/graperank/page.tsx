'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { POVInput } from '@/components/POVInput'
import { InterpreterBuilder } from '@/components/InterpreterBuilder'
import { getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { buildServiceRequestEvent, type ServiceRequestConfig } from '@/lib/nostr/events'
import { fetchServicePubkey } from '@/lib/nostr/services'
import { useServiceAnnouncements } from '@/lib/hooks/useServiceAnnouncements'

const graperankAllowedRequestTypes = ['p', 'P', 'pubkey'] as const
const graperankAllowedRequestTypeSet = new Set<string>(graperankAllowedRequestTypes)

interface Interpreter {
  type: string
  actorType?: string
  subjectType?: string
  iterate?: number
  params?: {
    value?: number
    confidence?: number
    [key: string]: number | string | undefined
  }
}

export default function GrapeRankRequestPage() {
  const router = useRouter()
  const { announcements } = useServiceAnnouncements()
  const [userPubkey, setUserPubkey] = useState<string>('')
  const [servicePubkey, setServicePubkey] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({
    title: '',
    pov: '',
    type: graperankAllowedRequestTypes[0],
    minrank: '0.0001',
    attenuation: '0.5',
    rigor: '0.5',
    precision: '0.00001',
  })
  const [interpreters, setInterpreters] = useState<Interpreter[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isUpdate, setIsUpdate] = useState(false)
  const [originalEventId, setOriginalEventId] = useState<string | null>(null)
  const [dTag, setDTag] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserPubkey = async () => {
      try {
        const signer = await getNip07Signer()
        if (signer) {
          const user = await signer.user()
          if (user.pubkey) {
            setUserPubkey(user.pubkey)
            setFormData(previousFormData => {
              const hasExistingPov = Boolean(previousFormData.pov?.trim())
              if (isUpdate || hasExistingPov) {
                return previousFormData
              }

              return { ...previousFormData, pov: user.pubkey }
            })
          }
        }
      } catch (err) {
        console.error('Failed to get user pubkey:', err)
      }
    }
    fetchUserPubkey()
  }, [isUpdate])

  useEffect(() => {
    const grapeRankAnnouncement = announcements.find(a => a.serviceId === 'trustr_graperank')
    if (grapeRankAnnouncement) {
      setServicePubkey(grapeRankAnnouncement.pubkey)
    }
  }, [announcements])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const updateMode = params.get('update') === 'true'
    const eventId = params.get('eventId')
    
    if (updateMode && eventId) {
      setIsUpdate(true)
      setOriginalEventId(eventId)

      const requestType = params.get('type')
      const normalizedRequestType =
        requestType && graperankAllowedRequestTypeSet.has(requestType)
          ? requestType
          : graperankAllowedRequestTypes[0]
      
      // Pre-fill form with query params
      const newFormData: Record<string, string> = {
        title: params.get('title') || '',
        pov: params.get('pov') || '',
        type: normalizedRequestType,
        minrank: params.get('minrank') || '0.0001',
        attenuation: params.get('attenuation') || '0.5',
        rigor: params.get('rigor') || '0.5',
        precision: params.get('precision') || '0.00001',
      }
      setFormData(newFormData)
      
      // Parse interpreters if present
      const interpretersStr = params.get('interpreters')
      if (interpretersStr) {
        try {
          const parsedInterpreters = JSON.parse(interpretersStr)
          // Convert from GrapeRank format back to UI format
          const uiInterpreters = parsedInterpreters.map((int: { id: string; params?: Record<string, unknown>; iterate?: number }) => {
            const typeMap: Record<string, string> = {
              'nostr-3': 'follows',
              'nostr-10000': 'mutes',
              'nostr-1984': 'reports',
              'nostr-1-t': 'hashtags',
              'nostr-9735': 'zaps',
              'nostr-31873': 'attestor_recommendations',
              'nostr-31871': 'attestations',
            }
            const fallbackParamsByInterpreterId: Record<string, { actorType: string; subjectType: string }> = {
              'nostr-3': { actorType: 'pubkey', subjectType: 'p' },
              'nostr-10000': { actorType: 'pubkey', subjectType: 'p' },
              'nostr-1984': { actorType: 'pubkey', subjectType: 'p' },
              'nostr-1-t': { actorType: 'pubkey', subjectType: 't' },
              'nostr-9735': { actorType: 'e', subjectType: 'pubkey' },
              'nostr-31873': { actorType: 'pubkey', subjectType: 'p' },
              'nostr-31871': { actorType: 'pubkey', subjectType: 'p' },
            }
            const fallbackParams = fallbackParamsByInterpreterId[int.id] || { actorType: 'p', subjectType: 'p' }
            return {
              type: typeMap[int.id] || int.id,
              actorType: (typeof int.params?.actorType === 'string' ? int.params.actorType : fallbackParams.actorType),
              subjectType: (typeof int.params?.subjectType === 'string' ? int.params.subjectType : fallbackParams.subjectType),
              iterate: int.iterate || 1,
              params: {
                value: int.params?.value ?? 1.0,
                confidence: int.params?.confidence ?? 1.0,
              }
            }
          })
          setInterpreters(uiInterpreters)
        } catch (err) {
          console.error('Failed to parse interpreters:', err)
        }
      }
      
      // Fetch the original event to get the d tag
      fetchOriginalDTag(eventId)
    }
  }, [])

  const fetchOriginalDTag = async (eventId: string) => {
    try {
      const ndk = getNDK()
      const event = await ndk.fetchEvent(eventId)
      if (event) {
        const dTagArray = event.tags.find((t: string[]) => t[0] === 'd')
        if (dTagArray && dTagArray[1]) {
          setDTag(dTagArray[1])
        }
      }
    } catch (err) {
      console.error('Failed to fetch original d tag:', err)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const signer = await getNip07Signer()
      if (!signer) {
        throw new Error('Nostr signer not available. Please install a Nostr browser extension.')
      }

      const ndk = getNDK()
      ndk.signer = signer

      // Map interpreter types to GrapeRank IDs
      const interpreterTypeMap: Record<string, string> = {
        'follows': 'nostr-3',
        'mutes': 'nostr-10000',
        'reports': 'nostr-1984',
        'hashtags': 'nostr-1-t',
        'zaps': 'nostr-9735',
        'attestor_recommendations': 'nostr-31873',
        'attestations': 'nostr-31871',
      }

      // Transform interpreters to GrapeRank format
      const grapeRankInterpreters = interpreters.map(int => ({
        id: interpreterTypeMap[int.type] || int.type,
        params: {
          ...int.params,
          actorType: int.actorType,
          subjectType: int.subjectType,
        },
        ...(int.iterate ? { iterate: int.iterate } : {})
      }))

      // Merge form data with interpreters as JSON
      const configData = {
        ...formData,
        ...(grapeRankInterpreters.length > 0 ? { interpreters: JSON.stringify(grapeRankInterpreters) } : {})
      }

      const resolvedServicePubkey =
        servicePubkey || (await fetchServicePubkey('trustr_graperank'))

      if (!resolvedServicePubkey) {
        throw new Error('GrapeRank service not available. Please refresh and try again.')
      }

      if (!servicePubkey) {
        setServicePubkey(resolvedServicePubkey)
      }

      const event = buildServiceRequestEvent(
        'trustr_graperank',
        resolvedServicePubkey,
        configData as ServiceRequestConfig,
        37573,
        dTag || undefined,
      )
      
      await event.sign(signer)
      await event.publish()

      if (isUpdate && originalEventId) {
        // Update existing request entry with new eventId
        await fetch(`/api/requests/${originalEventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            eventId: event.id,
            configData: JSON.stringify(configData),
            status: 'pending',
          }),
        })
      } else {
        // Create new request entry
        await fetch('/api/requests', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            eventId: event.id,
            configData,
          }),
        })
      }

      router.push(`/dashboard/requests/${event.id}`)
    } catch (err) {
      console.error('Publish error:', err)
      setError(err instanceof Error ? err.message : 'Failed to publish request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">
          {isUpdate ? 'Update GrapeRank Request' : 'GrapeRank Request'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {isUpdate 
            ? `Updating request ${originalEventId?.slice(0, 8)}... - This will re-trigger the ranking service`
            : 'Rank Nostr users by trust using follows, mutes, reports, zaps, and attestations'
          }
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Configuration</CardTitle>
          <CardDescription>
            {isUpdate 
              ? 'Modify the configuration and publish to update this request'
              : 'Configure your GrapeRank ranking request'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Bitcoin Core Contributors"
                  disabled={loading}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  A descriptive title for this ranking request
                </p>
              </div>

              <POVInput
                value={formData.pov}
                onChange={(value) => setFormData({ ...formData, pov: value })}
                disabled={loading}
                userPubkey={userPubkey}
              />

              <div>
                <label className="block text-sm font-medium mb-1">
                  Type
                </label>
                <select
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  disabled={loading}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                >
                  {graperankAllowedRequestTypes.map(requestType => (
                    <option key={requestType} value={requestType}>
                      {requestType}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select which POV type the service should resolve.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Min Rank
                </label>
                <input
                  type="text"
                  value={formData.minrank}
                  onChange={(e) => setFormData({ ...formData, minrank: e.target.value })}
                  placeholder="0.0001"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exclude results below this rank (default 0.0001 excludes rank == 0)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Attenuation: {formData.attenuation}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.attenuation}
                  onChange={(e) => setFormData({ ...formData, attenuation: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Influence decay per degree of separation (0-1)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Rigor: {formData.rigor}
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.rigor}
                  onChange={(e) => setFormData({ ...formData, rigor: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Confidence threshold factor (0-1)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Precision
                </label>
                <input
                  type="number"
                  step="0.00001"
                  value={formData.precision}
                  onChange={(e) => setFormData({ ...formData, precision: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Max delta between iterations (0 = iterate until stable)
                </p>
              </div>

              <InterpreterBuilder
                interpreters={interpreters}
                onChange={setInterpreters}
                disabled={loading}
              />
            </div>

            {error && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
                <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading 
                  ? (isUpdate ? 'Updating...' : 'Publishing...') 
                  : (isUpdate ? 'Update Request' : 'Publish Request')
                }
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(isUpdate ? `/dashboard/requests/${originalEventId}` : '/dashboard/requests/new')}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
