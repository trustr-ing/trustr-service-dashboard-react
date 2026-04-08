'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { POVSelector } from '@/components/POVSelector'
import { InterpreterBuilder } from '@/components/InterpreterBuilder'
import { getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { buildServiceRequestEvent, type ServiceRequestConfig } from '@/lib/nostr/events'

const GRAPERANK_PUBKEY = '9331ff6ecb651162f64ff1a54f8b69f82d72cb93b979bf4635b59b989ec543ae'

interface Interpreter {
  type: string
  actorType?: string
  subjectType?: string
  minrank?: number
  attenuation?: number
  rigor?: number
}

export default function GrapeRankRequestPage() {
  const router = useRouter()
  const [formData, setFormData] = useState<Record<string, string>>({
    pov: '',
    type: 'p',
    minrank: '0',
    attenuation: '0.5',
    rigor: '0.5',
    precision: '0.00001',
  })
  const [interpreters, setInterpreters] = useState<Interpreter[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

      // Merge form data with interpreters as JSON
      const configData = {
        ...formData,
        ...(interpreters.length > 0 ? { interpreters: JSON.stringify(interpreters) } : {})
      }

      const event = buildServiceRequestEvent('trustr_graperank', GRAPERANK_PUBKEY, configData as ServiceRequestConfig)
      
      await event.sign(signer)
      await event.publish()

      await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          eventId: event.id,
          configData,
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
        <h2 className="text-3xl font-bold tracking-tight">GrapeRank Request</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Rank Nostr users by trust using follows, mutes, reports, zaps, and attestations
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Configuration</CardTitle>
          <CardDescription>Configure your GrapeRank ranking request</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <POVSelector
                value={formData.pov}
                onChange={(value) => setFormData({ ...formData, pov: value })}
                disabled={loading}
              />

              <div>
                <label className="block text-sm font-medium mb-1">
                  Type
                </label>
                <input
                  type="text"
                  value="p"
                  disabled
                  className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-900 px-3 py-2 text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Fixed to &apos;p&apos; (Pubkeys) for this MVP
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
