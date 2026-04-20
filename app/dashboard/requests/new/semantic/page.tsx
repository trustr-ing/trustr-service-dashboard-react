'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { POVInput } from '@/components/POVInput'
import { getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { fetchServicePubkey } from '@/lib/nostr/services'
import { NDKEvent } from '@nostr-dev-kit/ndk'
import { useServiceAnnouncements } from '@/lib/hooks/useServiceAnnouncements'

const PUBKEY_TYPE_ALIASES = new Set(['pubkey', 'p', 'P'])

function canonicalRankTypeForConfigType(rawType: string): 'pubkey' | 'id' {
  return PUBKEY_TYPE_ALIASES.has(rawType) ? 'pubkey' : 'id'
}

export default function SemanticRankingRequestPage() {
  const router = useRouter()
  const { announcements } = useServiceAnnouncements()
  const [userPubkey, setUserPubkey] = useState<string>('')
  const [servicePubkey, setServicePubkey] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, string>>({
    title: '',
    pov: '',
    type: 'p',
    rank_type: 'pubkey',
    rank_kind: '1',
    model: 'fused',
    context: '',
    lambda: '1.0',
    minrank: '0',
  })
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
    const semanticAnnouncement = announcements.find(a => a.serviceId === 'trustr_semantic_ranking')
    if (semanticAnnouncement) {
      setServicePubkey(semanticAnnouncement.pubkey)
    }
  }, [announcements])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const updateMode = params.get('update') === 'true'
    const eventId = params.get('eventId')
    
    if (updateMode && eventId) {
      setIsUpdate(true)
      setOriginalEventId(eventId)
      
      // Pre-fill form with query params
      const newFormData: Record<string, string> = {}
      params.forEach((value, key) => {
        if (key !== 'update' && key !== 'eventId') {
          newFormData[key] = value
        }
      })
      
      setFormData(prev => ({ ...prev, ...newFormData }))
      
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

      const event = new NDKEvent(ndk)
      event.kind = 37572
      event.content = ''
      
      const requestDTag = dTag || `request-${Date.now()}`

      const resolvedServicePubkey =
        servicePubkey || (await fetchServicePubkey('trustr_semantic_ranking'))

      if (!resolvedServicePubkey) {
        throw new Error('Semantic ranking service not available. Please refresh and try again.')
      }

      if (!servicePubkey) {
        setServicePubkey(resolvedServicePubkey)
      }

      event.tags = [
        ['d', requestDTag],
        ['p', resolvedServicePubkey],
        ['k', '37573'],
      ]
      
      // Add title tag
      if (formData.title) event.tags.push(['title', formData.title])
      
      // Add config tags
      if (formData.pov) event.tags.push(['config', 'pov', formData.pov])
      if (formData.type) event.tags.push(['config', 'type', formData.type])
      if (formData.minrank) event.tags.push(['config', 'minrank', formData.minrank])

      const canonicalRankType =
        formData.rank_type === 'pubkey' || formData.rank_type === 'id'
          ? formData.rank_type
          : canonicalRankTypeForConfigType(formData.type)

      // Add option tags
      if (canonicalRankType) event.tags.push(['option', 'rank_type', canonicalRankType])
      if (formData.rank_kind) event.tags.push(['option', 'rank_kind', formData.rank_kind])
      if (formData.model) event.tags.push(['option', 'model', formData.model])
      if (formData.context) event.tags.push(['option', 'context', formData.context])
      if (formData.lambda) event.tags.push(['option', 'lambda', formData.lambda])
      if (formData.context_weight) event.tags.push(['option', 'context_weight', formData.context_weight])
      if (formData.pool_start) event.tags.push(['option', 'pool_start', formData.pool_start])
      if (formData.pool_end) event.tags.push(['option', 'pool_end', formData.pool_end])
      if (formData.exclude_follows === 'true') event.tags.push(['option', 'exclude_follows', 'true'])
      if (formData.reverse === 'true') event.tags.push(['option', 'reverse', 'true'])
      
      await event.sign(signer)
      await event.publish()

      if (isUpdate && originalEventId) {
        // Update existing request entry with new eventId
        await fetch(`/api/requests/${originalEventId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            eventId: event.id,
            configData: JSON.stringify(formData),
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
            configData: formData,
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
          {isUpdate ? 'Update Semantic Ranking Request' : 'Semantic Ranking Request'}
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {isUpdate 
            ? `Updating request ${originalEventId?.slice(0, 8)}... - This will re-trigger the ranking service`
            : 'Rank event references using semantic similarity and optional trust weighting'
          }
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Configuration</CardTitle>
          <CardDescription>
            {isUpdate 
              ? 'Modify the configuration and publish to update this request'
              : 'Configure your semantic ranking request'
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
                  placeholder="e.g., Nostr Relay Developers"
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    POV Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.type}
                    onChange={(e) => {
                      const nextType = e.target.value
                      setFormData({
                        ...formData,
                        type: nextType,
                        rank_type: canonicalRankTypeForConfigType(nextType),
                      })
                    }}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    <option value="p">p</option>
                    <option value="P">P</option>
                    <option value="pubkey">pubkey</option>
                    <option value="id">id</option>
                    <option value="e">e</option>
                    <option value="a">a</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Alias for subject extraction from the POV reference.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Rank Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.rank_type}
                    onChange={(e) => setFormData({ ...formData, rank_type: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    <option value="pubkey">pubkey</option>
                    <option value="id">id</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Candidate matching field for event ranking.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Rank Kind <span className="text-red-500">*</span>
                  </label>
                  <select
                    required
                    value={formData.rank_kind}
                    onChange={(e) => setFormData({ ...formData, rank_kind: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    <option value="1">1 (short notes)</option>
                    <option value="30023">30023 (long-form articles)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Single event kind to rank for this request.
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Ranking Model <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                >
                  <option value="semantic">Semantic Only</option>
                  <option value="fused">Fused (Semantic + Social)</option>
                  <option value="social">Social Only</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Choose between semantic similarity, social graph, or fused ranking
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Search Context <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., nostr relay software, bitcoin developers"
                  value={formData.context}
                  onChange={(e) => setFormData({ ...formData, context: e.target.value })}
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Query string for semantic similarity matching
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Lambda (Trust Weight): {formData.lambda}
                </label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.lambda}
                  onChange={(e) => setFormData({ ...formData, lambda: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Balance between semantic similarity (0) and social trust (2). Default: 1.0
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Context Weight
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={formData.context_weight || '0.5'}
                  onChange={(e) => setFormData({ ...formData, context_weight: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Weight of context in semantic ranking (0-1)
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
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md dark:bg-gray-800 dark:border-gray-600"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exclude normalized results below this rank threshold.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Pool Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.pool_start || ''}
                    onChange={(e) => setFormData({ ...formData, pool_start: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Pool End Date
                  </label>
                  <input
                    type="date"
                    value={formData.pool_end || ''}
                    onChange={(e) => setFormData({ ...formData, pool_end: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.exclude_follows === 'true'}
                    onChange={(e) => setFormData({ ...formData, exclude_follows: e.target.checked ? 'true' : '' })}
                    className="rounded"
                  />
                  <span className="text-sm">Exclude follows from results</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.reverse === 'true'}
                    onChange={(e) => setFormData({ ...formData, reverse: e.target.checked ? 'true' : '' })}
                    className="rounded"
                  />
                  <span className="text-sm">Reverse ranking (least similar first)</span>
                </label>
              </div>
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
