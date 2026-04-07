'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getNip07Signer } from '@/lib/nostr/ndk'
import { NDKEvent } from '@nostr-dev-kit/ndk'

export default function LoginPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNip07Login = async () => {
    try {
      setLoading(true)
      setError(null)

      const signer = await getNip07Signer()
      if (!signer) {
        setError('No Nostr extension found. Please install Alby, nos2x, or another NIP-07 compatible extension.')
        return
      }

      const user = await signer.user()
      const pubkey = user.pubkey

      const event = new NDKEvent()
      event.kind = 27235
      event.content = `Login to Trustr Dashboard at ${Date.now()}`
      event.created_at = Math.floor(Date.now() / 1000)
      await event.sign(signer)

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pubkey,
          signedEvent: event.rawEvent(),
        }),
      })

      if (!response.ok) {
        throw new Error('Login failed')
      }

      router.push('/dashboard')
    } catch (err) {
      console.error('Login error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred during login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-3xl font-bold">Trustr Dashboard</CardTitle>
          <CardDescription>
            Sign in with your Nostr identity to manage service requests
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleNip07Login}
            disabled={loading}
            className="w-full"
            size="lg"
          >
            {loading ? 'Connecting...' : 'Sign in with Nostr Extension (NIP-07)'}
          </Button>

          {error && (
            <div className="rounded-md bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <div className="text-center text-sm text-gray-600 dark:text-gray-400">
            <p>Don&apos;t have a Nostr extension?</p>
            <a
              href="https://getalby.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Get Alby
            </a>
            {' or '}
            <a
              href="https://github.com/fiatjaf/nos2x"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              nos2x
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
