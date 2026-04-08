'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

interface SavedRequest {
  id: number
  eventId: string
  configData: string
  publishedAt: string
}

export default function UpdateRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [requestId, setRequestId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    params.then((p) => setRequestId(p.id))
  }, [params])

  useEffect(() => {
    if (!requestId) return

    const fetchAndRedirect = async () => {
      try {
        const response = await fetch(`/api/requests/${requestId}`)
        if (!response.ok) {
          router.push('/dashboard/requests')
          return
        }

        const data = await response.json()
        const request: SavedRequest = data.request
        const config = JSON.parse(request.configData)

        // Determine which service based on config
        // Check for interpreters (GrapeRank) vs model (Semantic)
        const isGrapeRank = config.interpreters !== undefined
        const baseRoute = isGrapeRank 
          ? '/dashboard/requests/new/graperank' 
          : '/dashboard/requests/new/semantic'

        // Build query string with all config data and eventId for d tag
        const queryParams = new URLSearchParams({
          update: 'true',
          eventId: request.eventId,
          ...config
        })

        router.push(`${baseRoute}?${queryParams.toString()}`)
      } catch (error) {
        console.error('Failed to fetch request:', error)
        router.push('/dashboard/requests')
      } finally {
        setLoading(false)
      }
    }

    fetchAndRedirect()
  }, [requestId, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600 dark:text-gray-400">Loading request data...</p>
      </div>
    )
  }

  return null
}
