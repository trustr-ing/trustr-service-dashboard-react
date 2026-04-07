'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getNDK, getNip07Signer } from '@/lib/nostr/ndk'
import { buildServiceRequestEvent, type ServiceRequestConfig } from '@/lib/nostr/events'

const SERVICE_CONFIG = {
  graperank: {
    name: 'GrapeRank',
    pubkey: '0a7242787988a2c763f6862161107b26e6e029566298a33c6aeed6fd4273be69',
    fields: [
      { name: 'pov', label: 'Point of View', type: 'text', required: true, placeholder: '["pubkey1","pubkey2"]' },
      { name: 'type', label: 'Type', type: 'select', required: true, options: ['p', 'e', 'a', 't', 'r'] },
      { name: 'minrank', label: 'Min Rank', type: 'number', defaultValue: '0' },
      { name: 'attenuation', label: 'Attenuation', type: 'number', defaultValue: '0.5', step: '0.1' },
      { name: 'rigor', label: 'Rigor', type: 'number', defaultValue: '0.5', step: '0.1' },
      { name: 'precision', label: 'Precision', type: 'number', defaultValue: '0.00001', step: '0.00001' },
      { name: 'interpreters', label: 'Interpreters (JSON)', type: 'textarea', placeholder: '[{"id":"nostr-3","params":{...}}]' },
    ],
  },
}

export default function NewRequestPage() {
  const router = useRouter()
  const [service] = useState<'graperank'>('graperank')
  const [formData, setFormData] = useState<Record<string, string>>({
    type: 'p',
    minrank: '0',
    attenuation: '0.5',
    rigor: '0.5',
    precision: '0.00001',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const signer = await getNip07Signer()
      if (!signer) {
        throw new Error('Nostr signer not available')
      }

      const ndk = getNDK()
      ndk.signer = signer

      const config = SERVICE_CONFIG[service]
      const event = buildServiceRequestEvent(service, config.pubkey, formData as ServiceRequestConfig)
      
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

      router.push('/dashboard/requests')
    } catch (err) {
      console.error('Publish error:', err)
      setError(err instanceof Error ? err.message : 'Failed to publish request')
    } finally {
      setLoading(false)
    }
  }

  const config = SERVICE_CONFIG[service]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">New Request</h2>
        <p className="text-gray-600 dark:text-gray-400">
          Create a new service request
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Request Configuration</CardTitle>
          <CardDescription>Configure your {config.name} request</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {config.fields.map((field) => (
              <div key={field.name}>
                <label className="block text-sm font-medium mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                
                {field.type === 'select' ? (
                  <select
                    required={field.required}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  >
                    <option value="">Select...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                    rows={3}
                  />
                ) : (
                  <input
                    type={field.type}
                    required={field.required}
                    placeholder={field.placeholder}
                    value={formData[field.name] || field.defaultValue || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    step={field.step}
                    className="w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2"
                  />
                )}
              </div>
            ))}

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
                onClick={() => router.push('/dashboard')}
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
