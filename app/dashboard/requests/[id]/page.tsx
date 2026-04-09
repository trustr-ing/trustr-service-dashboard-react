'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { format } from 'date-fns'
import { useRequestMonitor } from '@/lib/hooks/useRequestMonitor'
import { ResultsTable, parseOutputEventResults } from '@/components/ResultsTable'
import { deleteEvent } from '@/lib/nostr/deletion'
import Link from 'next/link'

interface SavedRequest {
  id: number
  eventId: string
  status: string
  publishedAt: string
  completedAt: string | null
  configData: string
}

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter()
  const [request, setRequest] = useState<SavedRequest | null>(null)
  const [loading, setLoading] = useState(true)
  const [requestId, setRequestId] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setRequestId(p.id))
  }, [params])

  const { feedbackEvents, outputEvents, isConnected } = useRequestMonitor(
    request?.eventId || null
  )

  const fetchRequest = useCallback(async () => {
    if (!requestId) return
    try {
      const response = await fetch(`/api/requests/${requestId}`)
      if (!response.ok) {
        router.push('/dashboard/requests')
        return
      }
      const data = await response.json()
      setRequest(data.request)

      if (data.request.status === 'pending' && outputEvents.length > 0) {
        await updateRequestStatus('completed')
      }
    } catch (error) {
      console.error('Failed to fetch request:', error)
    } finally {
      setLoading(false)
    }
  }, [requestId, outputEvents.length, router])

  useEffect(() => {
    if (!requestId) return
    fetchRequest()
  }, [requestId, fetchRequest])

  const updateRequestStatus = useCallback(async (status: string) => {
    if (!requestId) return
    try {
      const response = await fetch(`/api/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          resultEventIds: outputEvents.map((e) => e.id),
          feedbackEventIds: feedbackEvents.map((e) => e.id),
          completedAt: new Date().toISOString(),
        }),
      })

      if (response.ok) {
        const data = await response.json()
        setRequest(data.savedRequest)
      }
    } catch (error) {
      console.error('Failed to update request:', error)
    }
  }, [requestId, outputEvents, feedbackEvents])

  useEffect(() => {
    if (request && request.status === 'pending' && outputEvents.length > 0) {
      updateRequestStatus('completed')
    }
  }, [outputEvents.length, request, updateRequestStatus])

  const handleDelete = async () => {
    if (!request || !confirm('Are you sure you want to delete this request? This will publish a NIP-09 deletion event.')) {
      return
    }

    try {
      await deleteEvent(request.eventId)
      
      // Delete from local database
      await fetch(`/api/requests/${requestId}`, {
        method: 'DELETE',
      })
      
      router.push('/dashboard/requests')
    } catch (error) {
      console.error('Failed to delete request:', error)
      alert('Failed to delete request: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600 dark:text-gray-400">Loading request...</p>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <p className="text-gray-600 dark:text-gray-400">Request not found</p>
      </div>
    )
  }

  const config = JSON.parse(request.configData)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Request {request.eventId.slice(0, 8)}...
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            Published {format(new Date(request.publishedAt), 'PPp')}
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/requests/update/${request.eventId}`}>
            <Button>Update Request</Button>
          </Link>
          <Button variant="destructive" onClick={handleDelete}>
            Delete Request
          </Button>
          <Link href="/dashboard/requests">
            <Button variant="outline">Back to Requests</Button>
          </Link>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Status</CardTitle>
          <CardDescription>Current request status and connection</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-medium">Status:</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
              request.status === 'completed'
                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200'
                : request.status === 'processing'
                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
                : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200'
            }`}>
              {request.status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-medium">Relay Connection:</span>
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-gray-400'}`} />
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Configuration</CardTitle>
          <CardDescription>Parameters used for this request</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {Object.entries(config).map(([key, value]) => (
              <div key={key}>
                <span className="font-medium text-gray-700 dark:text-gray-300">{key}:</span>{' '}
                <span className="text-gray-600 dark:text-gray-400">
                  {typeof value === 'string' && value.length > 50
                    ? `${value.slice(0, 50)}...`
                    : String(value)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {outputEvents.length > 0 && (
        <ResultsTable
          results={outputEvents.flatMap(output => parseOutputEventResults(output))}
          title={`Ranked Results (${outputEvents.flatMap(output => parseOutputEventResults(output)).length})`}
          description="Top ranked pubkeys from the service"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Output Events ({outputEvents.length})</CardTitle>
          <CardDescription>Raw result events from the service</CardDescription>
        </CardHeader>
        <CardContent>
          {outputEvents.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {isConnected ? 'Waiting for results...' : 'No results yet. Check relay connection.'}
            </p>
          ) : (
            <div className="space-y-4">
              {outputEvents.map((output) => (
                <div
                  key={output.id}
                  className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-gray-500">
                      {output.id.slice(0, 16)}...
                    </span>
                    <span className="text-xs text-gray-500">
                      {format(new Date(output.timestamp * 1000), 'PPp')}
                    </span>
                  </div>
                  <details className="cursor-pointer">
                    <summary className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      View raw event data
                    </summary>
                    <pre className="bg-gray-50 dark:bg-gray-900 p-3 rounded text-xs overflow-x-auto mt-2">
                      {JSON.stringify(output.data, null, 2)}
                    </pre>
                  </details>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Feedback Events ({feedbackEvents.length})</CardTitle>
          <CardDescription>Status updates and progress messages</CardDescription>
        </CardHeader>
        <CardContent>
          {feedbackEvents.length === 0 ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              No feedback events yet
            </p>
          ) : (
            <div className="space-y-2">
              {feedbackEvents.map((feedback) => (
                <div
                  key={feedback.id}
                  className="border-l-2 border-blue-500 pl-4 py-2"
                >
                  <div className="flex items-center justify-between mb-1">
                    {feedback.status && (
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {feedback.status}
                      </span>
                    )}
                    <span className="text-xs text-gray-500">
                      {format(new Date(feedback.timestamp * 1000), 'PPp')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {feedback.message}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
