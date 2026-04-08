'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { POVInput } from '@/components/POVInput'
import { getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'

const SEMANTIC_PUBKEY = '68bb72c016397a902d087a7ad594e9e10c070bc3158d0af77d708d006ff6a2f4'

export default function SemanticRankingRequestPage() {
  const router = useRouter()
  const [userPubkey, setUserPubkey] = useState<string>('')
  const [formData, setFormData] = useState<Record<string, string>>({
    title: '',
    pov: '',
    type: 'p',
    model: 'fused',
    context: '',
    lambda: '1.0',
    minrank: '0',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchUserPubkey = async () => {
      try {
        const signer = await getNip07Signer()
        if (signer) {
          const user = await signer.user()
          if (user.pubkey) {
            setUserPubkey(user.pubkey)
            setFormData(prev => ({ ...prev, pov: user.pubkey }))
          }
        }
      } catch (err) {
        console.error('Failed to get user pubkey:', err)
      }
    }
    fetchUserPubkey()
  }, [])

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
      
      event.tags = [
        ['d', `request-${Date.now()}`],
        ['p', SEMANTIC_PUBKEY],
        ['k', '37573'],
      ]
      
      // Add title tag
      if (formData.title) event.tags.push(['title', formData.title])
      
      // Add config tags
      if (formData.pov) event.tags.push(['config', 'pov', formData.pov])
      if (formData.type) event.tags.push(['config', 'type', formData.type])
      
      // Add option tags
      if (formData.model) event.tags.push(['option', 'model', formData.model])
      if (formData.context) event.tags.push(['option', 'context', formData.context])
      if (formData.lambda) event.tags.push(['option', 'lambda', formData.lambda])
      if (formData.context_weight) event.tags.push(['option', 'context_weight', formData.context_weight])
      if (formData.pool_start) event.tags.push(['option', 'pool_start', formData.pool_start])
      if (formData.pool_end) event.tags.push(['option', 'pool_end', formData.pool_end])
      if (formData.pool_pct) event.tags.push(['option', 'pool_pct', formData.pool_pct])
      if (formData.exclude_follows === 'true') event.tags.push(['option', 'exclude_follows', 'true'])
      if (formData.include_follows === 'true') event.tags.push(['option', 'include_follows', 'true'])
      if (formData.reverse === 'true') event.tags.push(['option', 'reverse', 'true'])
      
      await event.sign(signer)
      await event.publish()

      await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventId: event.id,
          configData: formData,
        }),
      })

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
        <h2 className="text-3xl font-bold tracking-tight">Semantic Ranking Request</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Rank pubkeys using semantic similarity and social graph embeddings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Configuration</CardTitle>
          <CardDescription>Configure your semantic ranking request</CardDescription>
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
                  Min Rank: {formData.minrank}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={formData.minrank}
                  onChange={(e) => setFormData({ ...formData, minrank: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Minimum rank threshold (0-100)
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

              <div>
                <label className="block text-sm font-medium mb-1">
                  Pool Percentage: {formData.pool_pct || '100'}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={formData.pool_pct || '100'}
                  onChange={(e) => setFormData({ ...formData, pool_pct: e.target.value })}
                  className="w-full"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Percentage of candidate pool to consider (1-100)
                </p>
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
                    checked={formData.include_follows === 'true'}
                    onChange={(e) => setFormData({ ...formData, include_follows: e.target.checked ? 'true' : '' })}
                    className="rounded"
                  />
                  <span className="text-sm">Include follows in candidate pool</span>
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
                {loading ? 'Publishing...' : 'Publish Request'}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push('/dashboard/requests/new')}
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
